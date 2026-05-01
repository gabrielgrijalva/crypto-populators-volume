const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD']);

class BingXSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://open-api.bingx.com";
        this.exchangeName = 'bingx-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('openApi/spot/v1/common/symbols');
        if (response?.data?.symbols?.length) {
            return response.data.symbols
                .filter(s => {
                    if (s.status !== 1) return false;
                    const parts = s.symbol.split('-');
                    if (parts.length !== 2) return false;
                    return USD_QUOTE_ASSETS.has(parts[1]);
                })
                .map(s => {
                    const [asset, quote] = s.symbol.split('-');
                    return {
                        symbol: s.symbol,
                        table_symbol: asset + quote,
                        type: 'spot',
                        asset: sanitizeAssetName(asset),
                    };
                });
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('openApi/spot/v1/ticker/24hr', { symbol });
        const r = Array.isArray(response?.data) ? response.data[0] : response?.data;
        if (r?.lastPrice != null) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.lastPrice,
                    bestAskPrice: r.askPrice != null ? +r.askPrice : null,
                    bestBidPrice: r.bidPrice != null ? +r.bidPrice : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: r.quoteVolume != null ? +(+r.quoteVolume).toFixed(2) : null,
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('openApi/spot/v1/ticker/24hr');
        if (response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(r => ({
                symbol: r.symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.lastPrice,
                    bestAskPrice: r.askPrice != null ? +r.askPrice : null,
                    bestBidPrice: r.bidPrice != null ? +r.bidPrice : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: r.quoteVolume != null ? +(+r.quoteVolume).toFixed(2) : null,
                },
            }));
        }
        return null;
    }
}

module.exports = BingXSpot;
