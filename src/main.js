const { loadSettings } = require('../settings');
const exchanges = require('./exchanges');
const {
    withRetries,
    logWithTimestamp,
    handleError
} = require('./utils');
const {
    tableExists,
    createTable,
    insertVolumeData,
    deleteOldData
} = require('./utils/db');
const {
    generateDynamicSettings,
    refetchSymbolsForExchange
} = require('./fetch-symbols');
const cron = require('node-cron');
const RollingRateLimiter = require('./utils/rolling-rate-limiter');

let settings;
let globalRateLimiter;

// Symbol health tracking system
const symbolHealthTracker = {}; // { 'exchangeName': { 'SYMBOL': { consecutiveFails: 0, lastFailTime: null, lastSuccessTime: null } } }
const suspectedDelistedSymbols = new Set(); // Set of 'exchangeName:symbol' strings

// Mutex to prevent overlapping cron cycles (per-exchange)
const fetchCycleInProgress = {};

// Delisting detection thresholds (loaded from settings)
let CONSECUTIVE_FAIL_THRESHOLD = 3;
let OTHER_SYMBOLS_SUCCESS_THRESHOLD = 0.6;
let MIN_SAMPLE_SIZE = 3;

// Initialize health tracker for an exchange if not exists
function initializeHealthTracker(exchangeName) {
    if (!symbolHealthTracker[exchangeName]) {
        symbolHealthTracker[exchangeName] = {};
    }
}

// Initialize health tracking for a symbol
function initializeSymbolHealth(exchangeName, symbol) {
    initializeHealthTracker(exchangeName);
    if (!symbolHealthTracker[exchangeName][symbol]) {
        symbolHealthTracker[exchangeName][symbol] = {
            consecutiveFails: 0,
            lastFailTime: null,
            lastSuccessTime: null
        };
    }
}

// Update symbol health after fetch attempt
function updateSymbolHealth(exchangeName, symbol, success, fetchResults) {
    initializeSymbolHealth(exchangeName, symbol);
    const now = Date.now();
    const health = symbolHealthTracker[exchangeName][symbol];

    if (success) {
        health.consecutiveFails = 0;
        health.lastSuccessTime = now;

        // Remove from suspected delisted if present
        const key = `${exchangeName}:${symbol}`;
        if (suspectedDelistedSymbols.has(key)) {
            suspectedDelistedSymbols.delete(key);
            logWithTimestamp(`Symbol ${symbol} on ${exchangeName} recovered, removed from exclusion list`);
        }
    } else {
        health.lastFailTime = now;

        // Calculate success rate of OTHER symbols
        const otherSymbolsTotal = fetchResults.total - 1; // Exclude current symbol
        const otherSymbolsSuccess = fetchResults.successful - (success ? 1 : 0);
        const successRate = otherSymbolsTotal > 0 ? otherSymbolsSuccess / otherSymbolsTotal : 0;

        // Check minimum sample size to avoid false positives
        if (otherSymbolsTotal < MIN_SAMPLE_SIZE) {
            logWithTimestamp(`Symbol ${symbol} on ${exchangeName} failed but only ${otherSymbolsTotal} other symbols - insufficient sample size for delisting detection`);
            return;
        }

        // Only increment consecutive fails if other symbols are mostly succeeding
        if (successRate >= OTHER_SYMBOLS_SUCCESS_THRESHOLD) {
            health.consecutiveFails++;

            // Check if threshold reached
            if (health.consecutiveFails >= CONSECUTIVE_FAIL_THRESHOLD) {
                const key = `${exchangeName}:${symbol}`;
                if (!suspectedDelistedSymbols.has(key)) {
                    suspectedDelistedSymbols.add(key);
                    logWithTimestamp(`Symbol ${symbol} suspected delisted on ${exchangeName} after ${health.consecutiveFails} consecutive failures (${Math.round(successRate * 100)}% of other symbols succeeded)`);

                    // Send delisting detection email (Logged only, no email sent to avoid spam)
                    handleError(`DELISTING DETECTED: Symbol ${symbol} on ${exchangeName} has failed ${health.consecutiveFails} consecutive times while other symbols succeed. Temporarily excluded from fetching.`, false);

                    // Trigger refetch (respects cooldown) - fire and forget with proper error handling
                    (async () => {
                        try {
                            const refetched = await refetchSymbolsForExchange(exchangeName);
                            if (refetched) {
                                // Refetch succeeded, clear suspected delisted symbols and reload settings
                                clearSuspectedDelistedForExchange(exchangeName);
                                const newSettings = await loadSettings();
                                settings = newSettings;

                                // Reload delisting detection thresholds from settings
                                if (settings.delisting_detection) {
                                    CONSECUTIVE_FAIL_THRESHOLD = settings.delisting_detection.consecutive_fail_threshold || 3;
                                    OTHER_SYMBOLS_SUCCESS_THRESHOLD = settings.delisting_detection.other_symbols_success_threshold || 0.6;
                                    MIN_SAMPLE_SIZE = settings.delisting_detection.min_sample_size || 3;
                                }

                                logWithTimestamp(`Settings reloaded after successful refetch for ${exchangeName}`);
                            }
                        } catch (err) {
                            logWithTimestamp(`Error during refetch/reload for ${exchangeName}: ${err.message}`);
                        }
                    })();
                }
            }
        } else {
            // Most symbols failing - likely exchange issue, don't count against this symbol
            logWithTimestamp(`Symbol ${symbol} failed but ${Math.round(successRate * 100)}% success rate suggests exchange issue, not delisting`);
        }
    }
}

// Check if symbol should be skipped
function shouldSkipSymbol(exchangeName, symbol) {
    const key = `${exchangeName}:${symbol}`;
    return suspectedDelistedSymbols.has(key);
}

// Clear suspected delisted symbols for an exchange (call after refetch)
function clearSuspectedDelistedForExchange(exchangeName) {
    const keysToRemove = [];
    for (const key of suspectedDelistedSymbols) {
        if (key.startsWith(`${exchangeName}:`)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => suspectedDelistedSymbols.delete(key));

    if (keysToRemove.length > 0) {
        logWithTimestamp(`Cleared ${keysToRemove.length} suspected delisted symbols for ${exchangeName} after refetch`);
    }
}

// Clear health tracker for an exchange to prevent memory leak
function clearHealthTrackerForExchange(exchangeName) {
    if (symbolHealthTracker[exchangeName]) {
        const symbolCount = Object.keys(symbolHealthTracker[exchangeName]).length;
        delete symbolHealthTracker[exchangeName];
        logWithTimestamp(`Cleared health tracker for ${exchangeName} (${symbolCount} symbols removed)`);
    }
}

async function ensureTableExists(tableName, dataType) {
    try {
        if (!(await tableExists(tableName))) {
            await createTable(tableName, dataType);
            logWithTimestamp(`Created table: ${tableName}`);
        }
    } catch (error) {
        handleError(error, true);
    }
}

function parseInstrumentType(instrument) {
    switch (instrument) {
        case 'futures':
            return 'f';
        case 'perpetual':
            return 'p';
        case 'perpetual_quanto':
            return 'pq';
        case 'spot':
            return 's';
        default:
            const errorMessage = `Invalid instrument type: ${instrument}`;
            handleError(errorMessage, true);
    }
}

function getTableName(apiName, tablePrefix, type, tableType, symbol, tableSymbol) {
    const prefix = tablePrefix || apiName;
    symbol = tableSymbol || symbol;

    const parsedType = parseInstrumentType(type);
    // tableType will be 'volume_24h'
    const constructedName = `${prefix}_${parsedType}_${tableType}_${symbol}`;

    if (constructedName.length > 64) {
        const errorMessage = `Table name too long: ${constructedName}`;
        handleError(errorMessage, true);
    }

    return constructedName;
}

async function ensureTablesExist() {
    try {
        for (const exchange of settings.exchanges) {
            console.log(`Ensuring tables exist for exchange: ${exchange.api_name}`);
            for (const instrumentType in exchange.instruments) {
                for (const instrument of exchange.instruments[instrumentType]) {
                    // Skip spot contracts - volume project is derivatives only
                    if (instrument.type !== 'spot') {
                        const volumeTableName = getTableName(
                            exchange.api_name,
                            exchange.table_prefix,
                            instrument.type,
                            'volume_24h',
                            instrument.symbol,
                            instrument.table_symbol
                        );
                        await ensureTableExists(volumeTableName, 'volume_24h');
                    }
                }
            }
        }
        logWithTimestamp('All volume tables exist.');
    } catch (error) {
        handleError(error, true);
    }
}

async function fetchAllData(exchangeInstance, symbols, instrument) {
    try {
        let allData = [];
        const exchangeName = exchangeInstance.exchangeName;

        // Track fetch results for health calculation
        const fetchResults = {
            total: 0,
            successful: 0,
            failed: 0
        };

        if (exchangeInstance.has.fetchAllTickers) {
            const allTickers = await withRetries(() => exchangeInstance.fetchAllTickers(instrument)) || [];
            allData = [...ensureArray(allTickers)];

            // Track success for all symbols fetched in bulk
            fetchResults.total = symbols.length;
            fetchResults.successful = allData.length;
            fetchResults.failed = symbols.length - allData.length;

            // Update health for all symbols
            for (const { symbol } of symbols) {
                const success = allData.some(data => data.symbol === symbol);
                updateSymbolHealth(exchangeName, symbol, success, fetchResults);
            }
        } else if (exchangeInstance.has.fetchTicker) {
            // Track symbols to attempt (excluding suspected delisted)
            const symbolsToFetch = [];
            const skippedSymbols = [];

            for (const { symbol } of symbols) {
                if (shouldSkipSymbol(exchangeName, symbol)) {
                    skippedSymbols.push(symbol);
                } else {
                    symbolsToFetch.push(symbol);
                }
            }

            if (skippedSymbols.length > 0) {
                logWithTimestamp(`Skipping ${skippedSymbols.length} suspected delisted symbols on ${exchangeName}: ${skippedSymbols.join(', ')}`);
            }

            fetchResults.total = symbolsToFetch.length;
            const symbolOutcomes = [];

            // Fetch each symbol
            for (const symbol of symbolsToFetch) {
                let success = false;
                try {
                    const ticker = await withRetries(() => exchangeInstance.fetchTicker(symbol, instrument));
                    if (ticker) {
                        allData.push(ticker);
                        fetchResults.successful++;
                        success = true;
                    }
                } catch (error) {
                    logWithTimestamp(`Error fetching ticker for ${symbol}: ${error.message}`);
                }

                symbolOutcomes.push({ symbol, success });
            }

            // Calculate failures after all fetches complete to use full sample for health tracking
            fetchResults.failed = fetchResults.total - fetchResults.successful;

            // Update health for all attempted symbols using final results
            for (const { symbol, success } of symbolOutcomes) {
                updateSymbolHealth(exchangeName, symbol, success, fetchResults);
            }
        } else {
            logWithTimestamp(`Exchange ${exchangeName} does not support fetchAllTickers or fetchTicker.`);
        }

        if (fetchResults.total > 0) {
            const successRate = Math.round((fetchResults.successful / fetchResults.total) * 100);
            logWithTimestamp(`${exchangeName}: ${fetchResults.successful}/${fetchResults.total} symbols succeeded (${successRate}%)`);
        }

        return allData.filter(data => data && symbols.some(s => s.symbol === data.symbol));
    } catch (error) {
        logWithTimestamp(`Error fetching all volume data for ${exchangeInstance.exchangeName}: ${error.message}`);
        handleError(error, true);
        return [];
    }
}

function ensureArray(data) {
    if (!Array.isArray(data)) {
        logWithTimestamp(`Warning: data is not iterable. Defaulting to empty array.`);
        return [];
    }
    return data;
}

async function initializeExchangeProcesses(exchangeSettings) {
    try {
        const exchangeClass = exchanges[exchangeSettings.api_name];
        if (!exchangeClass) {
            const errorMessage = `Exchange ${exchangeSettings.api_name} not found in exchanges module.`;
            handleError(errorMessage, true);
        }

        if (!exchangeSettings.instruments || Object.keys(exchangeSettings.instruments).length === 0) {
            const errorMessage = `Fatal: No instruments found for exchange ${exchangeSettings.api_name}. This likely indicates a failed contract list fetch.`;
            handleError(errorMessage, true);
            process.exit(1);
        }

        const ips = settings.ips || [];
        const exchangeInstance = new exchangeClass(ips, globalRateLimiter);

        for (const instrument in exchangeSettings.instruments) {
            const instrumentData = exchangeSettings.instruments[instrument];

            if (!instrumentData || instrumentData.length === 0) {
                const errorMessage = `Fatal: No symbols found for instrument ${instrument} on exchange ${exchangeSettings.api_name}. This likely indicates a failed contract list fetch.`;
                handleError(errorMessage, true);
                process.exit(1);
            }

            const symbols = instrumentData.map(data => ({
                symbol: data.symbol,
                table_symbol: data.table_symbol || data.symbol,
                type: data.type,
                timeframes: data.timeframes
            }));

            // Filter out spot contracts - volume project is derivatives only
            const volumeSymbols = symbols.filter(s =>
                s.type !== 'spot'
            );

            // Only set up cron job if there are symbols that support volume fetching
            if (volumeSymbols.length > 0) {
                const lockKey = `${exchangeSettings.api_name}_${instrument}`;
                const intervalMinutes = settings.volume_interval_minutes || 5;
                const cronExpression = `*/${intervalMinutes} * * * *`;

                cron.schedule(cronExpression, async () => {
                    // Check if previous cycle is still running for THIS exchange+instrument
                    if (fetchCycleInProgress[lockKey]) {
                        logWithTimestamp(`Skipping volume fetch cycle for ${exchangeSettings.api_name} ${instrument} - previous cycle still in progress`);
                        return;
                    }

                    try {
                        fetchCycleInProgress[lockKey] = true;
                        logWithTimestamp(`Fetching latest volume data for ${exchangeSettings.api_name} ${instrument}...`);
                        const latestData = await fetchAllData(exchangeInstance, volumeSymbols, instrument);
                        console.log('Exchange Name: ', exchangeSettings.api_name, 'Latest Volume Data: ', latestData);

                        for (const tickerInfo of latestData) {
                            const symbolDetails = volumeSymbols.find(s => s.symbol === tickerInfo.symbol);
                            if (symbolDetails) {
                                if ('ticker' in tickerInfo && tickerInfo.ticker && tickerInfo.ticker.volume24h != null) {
                                    const tableName = getTableName(
                                        exchangeSettings.api_name,
                                        exchangeSettings.table_prefix,
                                        symbolDetails.type,
                                        'volume_24h',
                                        tickerInfo.symbol,
                                        symbolDetails.table_symbol
                                    );
                                    try {
                                        await insertVolumeData(tableName, [{
                                            timestamp: tickerInfo.ticker.timestamp,
                                            volume24h: tickerInfo.ticker.volume24h
                                        }]);
                                    } catch (error) {
                                        logWithTimestamp(`Error inserting volume data for ${tickerInfo.symbol}: ${error.message}`);
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        handleError(error, true);
                    } finally {
                        fetchCycleInProgress[lockKey] = false;
                    }
                });
            } else {
                logWithTimestamp(`Skipping volume fetching for ${exchangeSettings.api_name} ${instrument} - no derivatives contracts found`);
            }
        }
    } catch (error) {
        handleError(error, true);
    }
}

async function start() {
    try {
        await generateDynamicSettings();
        logWithTimestamp('Dynamic settings generated.');

        settings = await loadSettings();
        logWithTimestamp('Settings loaded.');

        // Initialize domain-based rate limiter
        globalRateLimiter = new RollingRateLimiter(settings.domainRateLimits);
        logWithTimestamp('Global rate limiter initialized.');

        // Load delisting detection thresholds from settings
        if (settings.delisting_detection) {
            CONSECUTIVE_FAIL_THRESHOLD = settings.delisting_detection.consecutive_fail_threshold || 3;
            OTHER_SYMBOLS_SUCCESS_THRESHOLD = settings.delisting_detection.other_symbols_success_threshold || 0.6;
            MIN_SAMPLE_SIZE = settings.delisting_detection.min_sample_size || 3;
            logWithTimestamp(`Delisting detection thresholds: consecutive_fails=${CONSECUTIVE_FAIL_THRESHOLD}, success_rate=${OTHER_SYMBOLS_SUCCESS_THRESHOLD}, min_sample=${MIN_SAMPLE_SIZE}`);
        }

        await ensureTablesExist();
        logWithTimestamp('Confirmed that all volume tables exist.');

        for (const exchangeSettings of settings.exchanges) {
            await initializeExchangeProcesses(exchangeSettings);
        }
        logWithTimestamp('Exchange processes for volume initialized.');

        cron.schedule('0 0 * * *', dailyUpdateAndCheck, {
            scheduled: true,
            timezone: "UTC"
        });
        logWithTimestamp('Scheduled daily update and check.');

    } catch (error) {
        handleError(error, true);
    }
}

async function dailyUpdateAndCheck() {
    try {
        logWithTimestamp('Starting daily update and check...');

        await generateDynamicSettings();
        logWithTimestamp('Dynamic settings updated.');

        const newSettings = await loadSettings();

        // Clear all suspected delisted symbols and health trackers for all exchanges after daily refresh
        for (const exchange of newSettings.exchanges) {
            clearSuspectedDelistedForExchange(exchange.api_name);
            clearHealthTrackerForExchange(exchange.api_name);
        }

        settings = newSettings;
        logWithTimestamp('Settings reloaded.');

        // Reload delisting detection thresholds from settings
        if (settings.delisting_detection) {
            CONSECUTIVE_FAIL_THRESHOLD = settings.delisting_detection.consecutive_fail_threshold || 3;
            OTHER_SYMBOLS_SUCCESS_THRESHOLD = settings.delisting_detection.other_symbols_success_threshold || 0.6;
            MIN_SAMPLE_SIZE = settings.delisting_detection.min_sample_size || 3;
            logWithTimestamp(`Delisting detection thresholds reloaded: consecutive_fails=${CONSECUTIVE_FAIL_THRESHOLD}, success_rate=${OTHER_SYMBOLS_SUCCESS_THRESHOLD}, min_sample=${MIN_SAMPLE_SIZE}`);
        }

        deleteOldData(settings.volume_days_to_keep, () => {
            logWithTimestamp('Old data deleted.');
        });
        logWithTimestamp('Deletion of old data initiated.');

        await ensureTablesExist();
        logWithTimestamp('Confirmed that all volume tables exist.');

        logWithTimestamp('New settings have been reloaded.');

    } catch (error) {
        handleError(error, true);
    }
}

start();
