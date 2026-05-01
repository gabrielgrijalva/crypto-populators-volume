const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDC', 'USDT', 'USD']);

class DeribitSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://www.deribit.com/api/v2";
        this.exchangeName = 'deribit-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: false,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('public/get_instruments', {
            currency: 'any',
            kind: 'spot',
            expired: false,
        });
        if (response?.result?.length) {
            return response.result
                .filter(r => r.is_active === true && USD_QUOTE_ASSETS.has(r.quote_currency))
                .map(r => ({
                    symbol: r.instrument_name,
                    table_symbol: r.instrument_name.replace(/_/g, ''),
                    type: 'spot',
                    asset: sanitizeAssetName(r.base_currency),
                }));
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('public/ticker', { instrument_name: symbol });
        if (response?.result) {
            const r = response.result;
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: r.last_price != null ? +r.last_price : null,
                    bestAskPrice: r.best_ask_price != null ? +r.best_ask_price : null,
                    bestBidPrice: r.best_bid_price != null ? +r.best_bid_price : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+(r.stats?.volume_usd) || +(r.stats?.volume) * +r.last_price || 0).toFixed(2),
                }
            };
        }
        return null;
    }
}

module.exports = DeribitSpot;
