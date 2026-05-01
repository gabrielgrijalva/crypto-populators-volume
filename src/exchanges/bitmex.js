const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class Bitmex extends BaseExchange {

    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://www.bitmex.com";
        this.exchangeName = 'bitmex'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('api/v1/instrument/active');
        if (response?.length) {
            return response
            .filter(res => res.state === 'Open' && res.typ === instrument)
            .map(res => {
                let adjustedType;
                switch (res.typ) {
                    case 'FFWCSX':
                        adjustedType = res.isQuanto ? 'perpetual_quanto' : 'perpetual';
                        break;
                    case 'FFCCSX':
                        adjustedType = 'futures';
                        break;
                    case 'IFXXXP':
                        adjustedType = 'spot';
                        break;
                    default:
                        throw new Error(`Unsupported type ${res.typ}`);
                }

                // Replace 'XBT' with 'BTC' for the table_symbol
                let adjustedTableSymbol = res.symbol.replace('XBT', 'BTC');

                // IFXXXP (spot) symbols are underscore-separated (e.g., XRP_USDT); strip underscores to match project-wide convention
                if (res.typ === 'IFXXXP') {
                    adjustedTableSymbol = adjustedTableSymbol.replace(/_/g, '');
                }

                return {
                    symbol: res.symbol,
                    table_symbol: adjustedTableSymbol,
                    type: adjustedType,
                    asset: sanitizeAssetName(res.underlying),
                };
            });
        }
        return null;
    }


    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('api/v1/instrument', {
            symbol: symbol
        });
        if (response?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol: symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response[0].lastPrice,
                    bestAskPrice: +response[0].askPrice,
                    bestBidPrice: +response[0].bidPrice,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +(response[0].foreignNotional24h).toFixed(2),
                }
            };
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v1/instrument', {
            filter: JSON.stringify({
                state: 'Open'
            })
        })
        if (response?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.map(res => {
                return {
                    symbol: res.symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.lastPrice,
                        bestAskPrice: +res.askPrice,
                        bestBidPrice: +res.bidPrice,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: +(res.foreignNotional24h).toFixed(2),
                    }
                }
            })
        }
        return null;
    }

}

module.exports = Bitmex;
