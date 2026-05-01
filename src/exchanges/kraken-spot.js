const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT']);
const TICKER_BATCH_SIZE = 100;

class KrakenSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.kraken.com";
        this.exchangeName = 'kraken-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('0/public/AssetPairs');
        if (response?.error?.length || !response?.result) return null;
        const pairs = Object.values(response.result);
        if (!pairs.length) return null;
        return pairs
            .filter(pair => {
                if (pair.status !== 'online') return false;
                const cleanQuote = (pair.quote || '').replace(/^Z/, '');
                return USD_QUOTE_ASSETS.has(cleanQuote);
            })
            .map(pair => {
                const cleanQuote = pair.quote.replace(/^Z/, '');
                const altname = pair.altname;
                const baseFromAltname = altname.endsWith(cleanQuote)
                    ? altname.slice(0, -cleanQuote.length)
                    : altname;
                return {
                    symbol: altname,
                    table_symbol: altname.replace('XBT', 'BTC'),
                    type: 'spot',
                    asset: sanitizeAssetName(baseFromAltname),
                };
            });
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('0/public/Ticker', { pair: symbol });
        if (response?.error?.length || !response?.result) return null;
        const entries = Object.entries(response.result);
        if (!entries.length) return null;
        const r = entries[0][1];
        const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
        const baseVol = r.v?.[1] != null ? +r.v[1] : null;
        const vwap = r.p?.[1] != null ? +r.p[1] : null;
        const usdVol = (baseVol != null && vwap != null) ? +(baseVol * vwap).toFixed(2) : null;
        return {
            symbol,
            ticker: {
                timestamp,
                open: null,
                high: null,
                low: null,
                close: r.c?.[0] != null ? +r.c[0] : null,
                bestAskPrice: r.a?.[0] != null ? +r.a[0] : null,
                bestBidPrice: r.b?.[0] != null ? +r.b[0] : null,
                bestAskSize: r.a?.[2] != null ? +r.a[2] : null,
                bestBidSize: r.b?.[2] != null ? +r.b[2] : null,
                volume24h: usdVol,
            }
        };
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const pairsResponse = await this.publicRequest('0/public/AssetPairs');
        if (pairsResponse?.error?.length || !pairsResponse?.result) return null;

        const legacyToAltname = {};
        const usdAltnames = [];
        for (const [legacyId, pair] of Object.entries(pairsResponse.result)) {
            if (pair.status !== 'online') continue;
            const cleanQuote = (pair.quote || '').replace(/^Z/, '');
            if (!USD_QUOTE_ASSETS.has(cleanQuote)) continue;
            legacyToAltname[legacyId] = pair.altname;
            usdAltnames.push(pair.altname);
        }
        if (!usdAltnames.length) return null;

        const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
        const allTickers = [];
        for (let i = 0; i < usdAltnames.length; i += TICKER_BATCH_SIZE) {
            const chunk = usdAltnames.slice(i, i + TICKER_BATCH_SIZE);
            const tickerResponse = await this.publicRequest('0/public/Ticker', { pair: chunk.join(',') });
            if (tickerResponse?.error?.length || !tickerResponse?.result) continue;

            for (const [key, r] of Object.entries(tickerResponse.result)) {
                const altname = legacyToAltname[key] || key;
                const baseVol = r.v?.[1] != null ? +r.v[1] : null;
                const vwap = r.p?.[1] != null ? +r.p[1] : null;
                const usdVol = (baseVol != null && vwap != null) ? +(baseVol * vwap).toFixed(2) : null;
                allTickers.push({
                    symbol: altname,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: r.c?.[0] != null ? +r.c[0] : null,
                        bestAskPrice: r.a?.[0] != null ? +r.a[0] : null,
                        bestBidPrice: r.b?.[0] != null ? +r.b[0] : null,
                        bestAskSize: r.a?.[2] != null ? +r.a[2] : null,
                        bestBidSize: r.b?.[2] != null ? +r.b[2] : null,
                        volume24h: usdVol,
                    },
                });
            }
        }

        return allTickers;
    }
}

module.exports = KrakenSpot;
