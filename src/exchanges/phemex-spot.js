const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const moment = require("moment");

const USD_QUOTE_ASSETS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'FDUSD', 'TUSD']);
const DEFAULT_SCALES = { priceScale: 8, valueScale: 8 };

class PhemexSpot extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.phemex.com";
        this.exchangeName = 'phemex-spot';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
        // Phemex transmits prices/values as scaled integers; scales vary per spot symbol
        // and must be applied at ticker time. Populated by fetchSymbols.
        this.spotScales = {};
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('public/products');
        if (!response?.data?.products?.length) return null;
        return response.data.products
            .filter(r => r.type === 'Spot'
                && r.status === 'Listed'
                && USD_QUOTE_ASSETS.has(r.quoteCurrency))
            .map(r => {
                this.spotScales[r.symbol] = {
                    priceScale: r.priceScale,
                    valueScale: r.valueScale,
                };
                return {
                    symbol: r.symbol,
                    table_symbol: r.displaySymbol.replace(' / ', ''),
                    type: 'spot',
                    asset: sanitizeAssetName(r.baseCurrency),
                };
            });
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('md/spot/ticker/24hr', { symbol });
        if (!response?.result) return null;
        const r = response.result;
        const { priceScale, valueScale } = this.spotScales[symbol] || DEFAULT_SCALES;
        const priceDiv = Math.pow(10, priceScale);
        const valueDiv = Math.pow(10, valueScale);
        const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
        return {
            symbol,
            ticker: {
                timestamp,
                open: null,
                high: null,
                low: null,
                close: r.lastEp != null ? +(r.lastEp / priceDiv).toFixed(8) : null,
                bestAskPrice: r.askEp != null ? +(r.askEp / priceDiv).toFixed(8) : null,
                bestBidPrice: r.bidEp != null ? +(r.bidEp / priceDiv).toFixed(8) : null,
                bestAskSize: null,
                bestBidSize: null,
                volume24h: r.turnoverEv != null ? +(r.turnoverEv / valueDiv).toFixed(2) : null,
            },
        };
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('md/spot/ticker/24hr/all');
        if (!response?.result?.length) return null;
        const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
        return response.result.map(r => {
            const { priceScale, valueScale } = this.spotScales[r.symbol] || DEFAULT_SCALES;
            const priceDiv = Math.pow(10, priceScale);
            const valueDiv = Math.pow(10, valueScale);
            return {
                symbol: r.symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: r.lastEp != null ? +(r.lastEp / priceDiv).toFixed(8) : null,
                    bestAskPrice: r.askEp != null ? +(r.askEp / priceDiv).toFixed(8) : null,
                    bestBidPrice: r.bidEp != null ? +(r.bidEp / priceDiv).toFixed(8) : null,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: r.turnoverEv != null ? +(r.turnoverEv / valueDiv).toFixed(2) : null,
                },
            };
        });
    }
}

module.exports = PhemexSpot;
