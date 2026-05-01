const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'FDUSD', 'TUSD']);

class BitgetSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.bitget.com";
        this.exchangeName = 'bitget-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('api/v2/spot/public/symbols');
        if (response?.msg === 'success' && response?.data?.length) {
            return response.data
                .filter(r => r.status === 'online' && USD_QUOTE_ASSETS.has(r.quoteCoin))
                .map(r => ({
                    symbol: r.symbol,
                    table_symbol: r.symbol,
                    type: 'spot',
                    asset: sanitizeAssetName(r.baseCoin),
                }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('api/v2/spot/market/tickers', { symbol });
        if (response?.msg === 'success' && response?.data?.length) {
            const r = response.data[0];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.lastPr,
                    bestAskPrice: r.askPr != null ? +r.askPr : null,
                    bestBidPrice: r.bidPr != null ? +r.bidPr : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+r.usdtVolume || +r.quoteVolume).toFixed(2),
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v2/spot/market/tickers');
        if (response?.msg === 'success' && response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(r => ({
                symbol: r.symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.lastPr,
                    bestAskPrice: r.askPr != null ? +r.askPr : null,
                    bestBidPrice: r.bidPr != null ? +r.bidPr : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+r.usdtVolume || +r.quoteVolume).toFixed(2),
                },
            }));
        }
        return null;
    }
}

module.exports = BitgetSpot;
