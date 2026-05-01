const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT']);

class HuobiSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.huobi.pro";
        this.exchangeName = 'huobi-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('v1/settings/common/symbols');
        if (response?.status === 'ok' && response?.data?.length) {
            return response.data
                .filter(r => r.state === 'online' && r.qc && USD_QUOTE_ASSETS.has(r.qc.toUpperCase()))
                .map(r => ({
                    symbol: r.symbol,
                    table_symbol: r.symbol.toUpperCase(),
                    type: 'spot',
                    asset: sanitizeAssetName(r.bc.toUpperCase()),
                }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('market/detail/merged', { symbol });
        if (response?.status === 'ok' && response?.tick) {
            const r = response.tick;
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.close,
                    bestAskPrice: r.ask?.[0] != null ? +r.ask[0] : null,
                    bestBidPrice: r.bid?.[0] != null ? +r.bid[0] : null,
                    bestAskSize: r.ask?.[1] != null ? +r.ask[1] : null,
                    bestBidSize: r.bid?.[1] != null ? +r.bid[1] : null,
                    volume24h: +(+r.vol).toFixed(2),
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('market/tickers');
        if (response?.status === 'ok' && response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(r => ({
                symbol: r.symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.close,
                    bestAskPrice: r.ask != null ? +r.ask : null,
                    bestBidPrice: r.bid != null ? +r.bid : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: r.vol != null ? +(+r.vol).toFixed(2) : null,
                },
            }));
        }
        return null;
    }
}

module.exports = HuobiSpot;
