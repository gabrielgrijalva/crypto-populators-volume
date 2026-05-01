const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD']);

class CoinExSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.coinex.com";
        this.exchangeName = 'coinex-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('v2/spot/market');
        if (response?.code === 0 && response?.data?.length) {
            return response.data
                .filter(r => USD_QUOTE_ASSETS.has(r.quote_ccy))
                .map(r => ({
                    symbol: r.market,
                    table_symbol: r.market,
                    type: 'spot',
                    asset: sanitizeAssetName(r.base_ccy),
                }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('v2/spot/ticker', { market: symbol });
        if (response?.code === 0 && response?.data?.length) {
            const r = response.data[0];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.last,
                    bestAskPrice: r.ask != null ? +r.ask : null,
                    bestBidPrice: r.bid != null ? +r.bid : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+r.value).toFixed(2),
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('v2/spot/ticker');
        if (response?.code === 0 && response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(r => ({
                symbol: r.market,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.last,
                    bestAskPrice: r.ask != null ? +r.ask : null,
                    bestBidPrice: r.bid != null ? +r.bid : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+r.value).toFixed(2),
                },
            }));
        }
        return null;
    }
}

module.exports = CoinExSpot;
