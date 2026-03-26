const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class OKX extends BaseExchange {

    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://www.okx.com";
        this.exchangeName = 'okx'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
        this._oiCache = null;
        this._oiCacheTime = 0;
        this._oiCacheTTL = 60000; // 1 minute cache
    }

    async _getOpenInterestCache() {
        const now = Date.now();
        if (this._oiCache && (now - this._oiCacheTime) < this._oiCacheTTL) {
            return this._oiCache;
        }
        try {
            const response = await this.publicRequest('api/v5/public/open-interest', { instType: 'SWAP' });
            if (response?.data?.length) {
                this._oiCache = {};
                for (const item of response.data) {
                    this._oiCache[item.instId] = +item.oiUsd;
                }
                this._oiCacheTime = now;
            }
        } catch (error) {
            console.error('Error fetching open interest from OKX:', error);
        }
        return this._oiCache || {};
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('api/v5/public/instruments', {
            instType: instrument.toUpperCase(), // SPOT / SWAP / FUTURES / OPTION
        })
        if (response?.data?.length) {
            return response.data
            .filter(res => res.state === 'live')
            .map(res => {
                let adjustedType;
                switch(res.instType) {
                    case 'SPOT':
                        adjustedType = 'spot';
                        break;
                    case 'SWAP':
                        adjustedType = 'perpetual';
                        break;
                    case 'FUTURES':
                        adjustedType = 'futures';
                        break;
                    default:
                        throw new Error(`Unsupported type ${instType}`);
                }
                return {
                    symbol: res.instId,
                    table_symbol: res.instId.replace(/-/g, '').replace('SWAP', ''),
                    type: adjustedType,
                    // split uly by - and get first part
                    asset: sanitizeAssetName(res.uly.split('-')[0]),
                }
            })
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('api/v5/market/ticker', {
            instId: symbol
        });
        if (response?.data?.length) {
            const oiCache = await this._getOpenInterestCache();
            const oiUsd = oiCache[symbol];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response.data[0].last,
                    bestAskPrice: +response.data[0].askPx,
                    bestBidPrice: +response.data[0].bidPx,
                    bestAskSize: +response.data[0].askSz,
                    bestBidSize: +response.data[0].bidSz,
                    volume24h: +(+response.data[0].volCcy24h * +response.data[0].last).toFixed(2),
                    openInterest: oiUsd != null ? +(oiUsd).toFixed(2) : null,
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const [response, oiCache] = await Promise.all([
            this.publicRequest('api/v5/market/tickers', {
                instType: instrument.toUpperCase(), // SPOT / SWAP / FUTURES / OPTION
            }),
            this._getOpenInterestCache(),
        ]);
        if (response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(res => {
                const oiUsd = oiCache[res.instId];
                return {
                    symbol: res.instId,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.last,
                        bestAskPrice: +res.askPx,
                        bestBidPrice: +res.bidPx,
                        bestAskSize: +res.askSz,
                        bestBidSize: +res.bidSz,
                        volume24h: +(+res.volCcy24h * +res.last).toFixed(2),
                        openInterest: oiUsd != null ? +(oiUsd).toFixed(2) : null,
                    },
                }
            })
        }
        return null;
    }

}

module.exports = OKX;
