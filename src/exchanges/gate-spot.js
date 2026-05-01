const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD']);

class GateSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.gateio.ws/api/v4";
        this.exchangeName = 'gate-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('spot/currency_pairs');
        if (response?.length) {
            return response
                .filter(r => r.trade_status === 'tradable' && USD_QUOTE_ASSETS.has(r.quote))
                .map(r => ({
                    symbol: r.id,
                    table_symbol: r.id.replace(/_/g, ''),
                    type: 'spot',
                    asset: sanitizeAssetName(r.base),
                }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('spot/tickers', { currency_pair: symbol });
        if (response?.length && response[0].currency_pair === symbol) {
            const r = response[0];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.last,
                    bestAskPrice: r.lowest_ask != null ? +r.lowest_ask : null,
                    bestBidPrice: r.highest_bid != null ? +r.highest_bid : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+r.quote_volume).toFixed(2),
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('spot/tickers');
        if (response?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.map(r => ({
                symbol: r.currency_pair,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +r.last,
                    bestAskPrice: r.lowest_ask != null ? +r.lowest_ask : null,
                    bestBidPrice: r.highest_bid != null ? +r.highest_bid : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+r.quote_volume).toFixed(2),
                },
            }));
        }
        return null;
    }
}

module.exports = GateSpot;
