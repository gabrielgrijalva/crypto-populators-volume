const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class PhemexContract extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.phemex.com";
        this.exchangeName = 'phemex-contract'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
        this.priceScale = 10000;
        this.ratioScale = 100000000;
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('public/products-plus')
        if (response?.data?.products) {
            return response.data.products
                .filter(res => res.contractUnderlyingAssets === 'USD')
                .map(res => {
                    return {
                        symbol: res.symbol,
                        table_symbol: res.displaySymbol.replace(' / ', ''),
                        type: res.type.toLowerCase(),
                        asset: sanitizeAssetName(res.settleCurrency),
                    }
                })
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('md/v1/ticker/24hr', {
            symbol,
        })
        if (response?.result) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +(response.result.lastEp / this.priceScale).toFixed(8),
                    bestAskPrice: +(response.result.askEp / this.priceScale).toFixed(8),
                    bestBidPrice: +(response.result.bidEp / this.priceScale).toFixed(8),
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(response.result.volume).toFixed(2),
                    openInterest: response.result.openInterest ? +(+response.result.openInterest).toFixed(2) : null,
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('md/v1/ticker/24hr/all', {})
        if (response?.result) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.result.map(res => {
                return {
                    symbol: res.symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +(res.lastEp / this.priceScale).toFixed(8),
                        bestAskPrice: +(res.askEp / this.priceScale).toFixed(8),
                        bestBidPrice: +(res.bidEp / this.priceScale).toFixed(8),
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: +(res.volume).toFixed(2),
                        openInterest: res.openInterest ? +(+res.openInterest).toFixed(2) : null,
                    },
                }
            })
        }
        return null;
    }

}

module.exports = PhemexContract;
