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
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v5/market/tickers', {
            instType: instrument.toUpperCase(), // SPOT / SWAP / FUTURES / OPTION
        })
        if (response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(res => {
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
                    },
                }
            })
        }
        return null;
    }

}

module.exports = OKX;
