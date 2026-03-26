const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class PhemexHedgedContract extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.phemex.com";
        this.exchangeName = 'phemex-hedged-contract'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
        // Scale factors for price and ratio calculations
        this.priceScale = 10000;
        this.ratioScale = 100000000;
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('public/products-plus')
        if (response ?.data ?.perpProductsV2) {
            return response.data.perpProductsV2.map(res => {
                return {
                    symbol: res.symbol,
                    table_symbol: res.symbol,
                    type: 'perpetual',
                    asset: sanitizeAssetName(res.baseCurrency),
                }
            })
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('md/v3/ticker/24hr', {
            symbol,
        })
        if (response ?.result) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response.result.lastRp,
                    bestAskPrice: +response.result.askRp,
                    bestBidPrice: +response.result.bidRp,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(+response.result.turnoverRv).toFixed(2),
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('md/v3/ticker/24hr/all ', {})
        if (response ?.result) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.result.map(res => {
                return {
                    symbol: res.symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.lastRp,
                        bestAskPrice: +res.askRp,
                        bestBidPrice: +res.bidRp,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: +(+res.turnoverRv).toFixed(2),
                    },
                }
            })
        }
        return null;
    }

}
module.exports = PhemexHedgedContract;
