const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'FDUSD', 'TUSD']);

class KuCoinSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.kucoin.com";
        this.exchangeName = 'kucoin-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('api/v2/symbols');
        if (response?.code === '200000' && response?.data?.length) {
            return response.data
                .filter(r => r.enableTrading === true && USD_QUOTE_ASSETS.has(r.quoteCurrency))
                .map(r => ({
                    symbol: r.symbol,
                    table_symbol: r.symbol.replace('-', ''),
                    type: 'spot',
                    asset: sanitizeAssetName(r.baseCurrency),
                }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('api/v1/market/stats', { symbol });
        if (response?.code === '200000' && response?.data) {
            const r = response.data;
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: r.last != null ? +r.last : null,
                    bestAskPrice: r.sell != null ? +r.sell : null,
                    bestBidPrice: r.buy != null ? +r.buy : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: r.volValue != null ? +(+r.volValue).toFixed(2) : null,
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v1/market/allTickers');
        if (response?.code === '200000' && response?.data?.ticker?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.ticker.map(r => ({
                symbol: r.symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: r.last != null ? +r.last : null,
                    bestAskPrice: r.sell != null ? +r.sell : null,
                    bestBidPrice: r.buy != null ? +r.buy : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: r.volValue != null ? +(+r.volValue).toFixed(2) : null,
                },
            }));
        }
        return null;
    }
}

module.exports = KuCoinSpot;
