const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class HuobiCoinSwaps extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.hbdm.vn";
        this.exchangeName = 'huobi-coin-swaps';
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
            const response = await this.publicRequest('swap-api/v1/swap_open_interest', {});
            if (response?.status === 'ok' && response?.data?.length) {
                this._oiCache = {};
                for (const item of response.data) {
                    this._oiCache[item.contract_code] = +item.amount;
                }
                this._oiCacheTime = now;
            }
        } catch (error) {
            console.error('Error fetching open interest from Huobi Coin Swaps:', error);
        }
        return this._oiCache || {};
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('swap-api/v1/swap_contract_info', {
        })
        if (response?.status === 'ok' && response?.data?.length) {
            return response.data.map(res => {
                return {
                    symbol: res.contract_code,
                    table_symbol: res.contract_code.replace('-', ''),
                    type: 'perpetual',
                    asset: sanitizeAssetName(res.symbol),
                }
            })
        }
        return null;
    }


    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('swap-ex/market/detail/merged', {
            contract_code: symbol
        })
        if (response?.status === 'ok') {
            const oiCache = await this._getOpenInterestCache();
            const oiAmount = oiCache[symbol];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response.tick.close,
                    bestAskPrice: response.tick.ask ?  +response.tick.ask[0] : null,
                    bestBidPrice: response.tick.bid ?  +response.tick.bid[0] : null,
                    bestAskSize: response.tick.ask ?  +response.tick.ask[1] : null,
                    bestBidSize: response.tick.bid ?  +response.tick.bid[1] : null,
                    volume24h: +(+response.tick.amount * +response.tick.close).toFixed(2),
                    openInterest: oiAmount != null && response.tick.close ? +(oiAmount * +response.tick.close).toFixed(2) : null,
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const [response, oiCache] = await Promise.all([
            this.publicRequest('v2/swap-ex/market/detail/batch_merged', {}),
            this._getOpenInterestCache(),
        ]);
        if (response?.status === 'ok' && response?.ticks?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.ticks.map(res => {
                const oiAmount = oiCache[res.contract_code];
                return {
                    symbol: res.contract_code,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.close,
                        bestAskPrice: res.ask ? +res.ask[0] : null,
                        bestBidPrice: res.bid ? +res.bid[0] : null,
                        bestAskSize: res.ask ? +res.ask[1] : null,
                        bestBidSize: res.bid ? +res.bid[1] : null,
                        volume24h: +(+res.amount * +res.close).toFixed(2),
                        openInterest: oiAmount != null && res.close ? +(oiAmount * +res.close).toFixed(2) : null,
                    },
                }
            })
        }
        return null;
    }

}

module.exports = HuobiCoinSwaps;
