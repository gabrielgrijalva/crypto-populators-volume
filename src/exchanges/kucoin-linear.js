const { sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange");

const moment = require("moment");

class KuCoinLinear extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api-futures.kucoin.com";
        this.exchangeName = 'kucoin-linear';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        };

        // Cache for contracts data to reduce API calls
        this._contractsCache = null;
        this._contractsCacheTime = 0;
        this._contractsCacheTTL = 60000; // 1 minute cache
    }

    // Helper functions

    async _getContracts() {
        const now = Date.now();
        if (this._contractsCache && (now - this._contractsCacheTime) < this._contractsCacheTTL) {
            return this._contractsCache;
        }

        const response = await this.publicRequest('api/v1/contracts/active', {});
        if (response?.data?.length) {
            this._contractsCache = response.data;
            this._contractsCacheTime = now;
            return response.data;
        }
        return [];
    }

    _getLinearContracts(contracts) {
        return contracts.filter(c =>
            c.isInverse === false &&
            c.status === 'Open' &&
            c.type === 'FFWCSX' // Perpetual type
        );
    }

    _normalizeTableSymbol(symbol) {
        // Remove trailing M and normalize XBT to BTC
        return symbol.replace(/M$/, '').replace(/^XBT/, 'BTC');
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        try {
            const contracts = await this._getContracts();
            const linearContracts = this._getLinearContracts(contracts);

            return linearContracts.map(contract => {
                // KuCoin uses XBT for Bitcoin
                let asset = contract.baseCurrency;
                if (asset === 'XBT') {
                    asset = 'BTC';
                }

                return {
                    symbol: contract.symbol,
                    table_symbol: this._normalizeTableSymbol(contract.symbol),
                    type: 'perpetual',
                    asset: sanitizeAssetName(asset),
                };
            });
        } catch (error) {
            console.error('Error fetching symbols:', error.message);
            return null;
        }
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        try {
            const [contracts, tickersResponse] = await Promise.all([
                this._getContracts(),
                this.publicRequest('api/v1/allTickers', {}),
            ]);

            const ticker = tickersResponse?.data?.find(t => t.symbol === symbol);
            if (!ticker) {
                return null;
            }

            const contract = contracts.find(c => c.symbol === symbol);
            const turnover = contract?.turnoverOf24h;

            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +ticker.price,
                    bestAskPrice: +ticker.bestAskPrice,
                    bestBidPrice: +ticker.bestBidPrice,
                    bestAskSize: +ticker.bestAskSize,
                    bestBidSize: +ticker.bestBidSize,
                    volume24h: turnover != null ? +(+turnover).toFixed(2) : null,
                }
            };
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol}:`, error.message);
            return null;
        }
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        try {
            const [contracts, tickersResponse] = await Promise.all([
                this._getContracts(),
                this.publicRequest('api/v1/allTickers', {}),
            ]);

            const linearSymbols = new Set(
                this._getLinearContracts(contracts).map(c => c.symbol)
            );

            if (tickersResponse?.data?.length) {
                const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return tickersResponse.data
                    .filter(ticker => linearSymbols.has(ticker.symbol))
                    .map(ticker => {
                        const contract = contracts.find(c => c.symbol === ticker.symbol);
                        const turnover = contract?.turnoverOf24h;
                        return {
                            symbol: ticker.symbol,
                            ticker: {
                                timestamp,
                                open: null,
                                high: null,
                                low: null,
                                close: +ticker.price,
                                bestAskPrice: +ticker.bestAskPrice,
                                bestBidPrice: +ticker.bestBidPrice,
                                bestAskSize: +ticker.bestAskSize,
                                bestBidSize: +ticker.bestBidSize,
                                volume24h: turnover != null ? +(+turnover).toFixed(2) : null,
                            },
                        };
                    });
            }
            return null;
        } catch (error) {
            console.error('Error fetching all tickers:', error.message);
            return null;
        }
    }
}

module.exports = KuCoinLinear;
