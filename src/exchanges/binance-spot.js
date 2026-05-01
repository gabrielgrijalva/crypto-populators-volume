const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'FDUSD', 'TUSD']);

class BinanceSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.binance.com";
        this.exchangeName = 'binance-spot'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('api/v3/exchangeInfo');
        if (response?.symbols?.length) {
            return response.symbols
            .filter(s => s.status === 'TRADING'
                && s.isSpotTradingAllowed === true
                && USD_QUOTE_ASSETS.has(s.quoteAsset))
            .map(s => ({
                symbol: s.symbol,
                table_symbol: s.symbol,
                type: 'spot',
                asset: sanitizeAssetName(s.baseAsset),
            }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('api/v3/ticker/24hr', { symbol });
        if (response?.lastPrice) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response.lastPrice,
                    bestAskPrice: +response.askPrice,
                    bestBidPrice: +response.bidPrice,
                    bestAskSize: +response.askQty,
                    bestBidSize: +response.bidQty,
                    volume24h: +(+response.quoteVolume).toFixed(2),
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v3/ticker/24hr');
        if (response?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.map(res => ({
                symbol: res.symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +res.lastPrice,
                    bestAskPrice: +res.askPrice,
                    bestBidPrice: +res.bidPrice,
                    bestAskSize: +res.askQty,
                    bestBidSize: +res.bidQty,
                    volume24h: +(+res.quoteVolume).toFixed(2),
                },
            }));
        }
        return null;
    }

}

module.exports = BinanceSpot;
