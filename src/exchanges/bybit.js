const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class Bybit extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.bybit.com";
        this.exchangeName = 'bybit'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange info functions

    async fetchSymbols(type) {
        const response = await this.publicRequest('/v5/market/instruments-info', {
            category: type, // spot, linear, inverse, option
            limit: 1000,
        })
        if (response?.result?.list?.length) {
            return response.result.list
            .filter(res => res.status == 'Trading')
            .map(res => {
                let adjustedType;
                switch(type) {
                    case 'spot':
                        adjustedType = 'spot';
                        break;
                    case 'linear':
                        adjustedType = res.contractType == 'LinearPerpetual' ? 'perpetual' : 'futures';
                        break;
                    case 'inverse':
                        adjustedType = res.contractType == 'InversePerpetual' ? 'perpetual' : 'futures';
                        break;
                    default:
                        throw new Error(`Invalid type ${type}`);
                }

                let adjustedTableSymbol;
                switch(adjustedType) {
                    case 'spot':
                        adjustedTableSymbol = res.baseCoin + res.quoteCoin;
                        break;
                    case 'perpetual':
                        adjustedTableSymbol = res.baseCoin + res.quoteCoin;
                        break;
                    case 'futures':
                        adjustedTableSymbol = res.symbol.replace('-', '');
                        break;
                    default:
                        throw new Error(`Invalid type ${type}`);
                }

                return {
                    symbol: res.symbol,
                    table_symbol: adjustedTableSymbol,
                    type: adjustedType,
                    asset: sanitizeAssetName(res.baseCoin)
                }
            })

        }
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('v5/market/tickers', {
            category: instrument, // spot, linear, inverse, option
            symbol,
        })
        if (response?.result?.list?.length) {
            const ticker = response.result.list[0];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            const volume24h = instrument == 'inverse' ? +(+ticker.volume24h).toFixed(2) : +(+ticker.turnover24h).toFixed(2);
            const openInterest = instrument == 'inverse' ? +(+ticker.openInterest).toFixed(2) : +(+ticker.openInterestValue).toFixed(2);
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +ticker.lastPrice,
                    bestAskPrice: +ticker.ask1Price,
                    bestBidPrice: +ticker.bid1Price,
                    bestAskSize: +ticker.ask1Size,
                    bestBidSize: +ticker.bid1Size,
                    volume24h,
                    openInterest,
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument = null) {
        const response = await this.publicRequest('v5/market/tickers', {
            category: instrument, // spot, linear, inverse, option
        })
        if (response?.result?.list?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.result.list.map(res => {
                const volume24h = instrument == 'inverse' ? +(+res.volume24h).toFixed(2) : +(+res.turnover24h).toFixed(2);
                const openInterest = instrument == 'inverse' ? +(+res.openInterest).toFixed(2) : +(+res.openInterestValue).toFixed(2);
                return {
                    symbol: res.symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.lastPrice,
                        bestAskPrice: +res.ask1Price,
                        bestBidPrice: +res.bid1Price,
                        bestAskSize: +res.ask1Size,
                        bestBidSize: +res.bid1Size,
                        volume24h,
                        openInterest,
                    },
                }
            })
        }
        return null;
    }

}

module.exports = Bybit;
