const { sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange");

const moment = require("moment");

class KuCoinInverse extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api-futures.kucoin.com";
        this.exchangeName = 'kucoin-inverse';
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

    _getInverseContracts(contracts) {
        return contracts.filter(c =>
            c.isInverse === true &&
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
            const inverseContracts = this._getInverseContracts(contracts);

            return inverseContracts.map(contract => {
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
            const turnover = contract?.volumeOf24h;
            const oi = contract?.openInterest != null ? +(+contract.openInterest).toFixed(2) : null;

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
                    openInterest: oi,
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

            const inverseSymbols = new Set(
                this._getInverseContracts(contracts).map(c => c.symbol)
            );

            if (tickersResponse?.data?.length) {
                const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return tickersResponse.data
                    .filter(ticker => inverseSymbols.has(ticker.symbol))
                    .map(ticker => {
                        const contract = contracts.find(c => c.symbol === ticker.symbol);
                        const turnover = contract?.volumeOf24h;
                        const oi = contract?.openInterest != null ? +(+contract.openInterest).toFixed(2) : null;
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
                                openInterest: oi,
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

module.exports = KuCoinInverse;
