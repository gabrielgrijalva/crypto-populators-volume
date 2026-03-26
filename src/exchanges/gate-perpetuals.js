const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class GateIO extends BaseExchange {

    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.gateio.ws/api/v4";
        this.exchangeName = 'gate-perpetuals'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest(`futures/${instrument.toLowerCase()}/contracts/`, {
        })
        if (response?.length) {
            return response
            .filter(res => res.in_delisting == false)
            .map(res => {
                return {
                    symbol: res.name,
                    table_symbol: res.name.replace('_', ''),
                    type: instrument.toLowerCase() == 'btc'  && +res.quanto_multiplier ? 'perpetual_quanto' : 'perpetual',
                    asset: sanitizeAssetName(res.name.split('_')[0]),
                }
            })
        }
        return null;
    }


    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest(`futures/${instrument.toLowerCase()}/tickers/`, {
            contract: symbol
        })
        if (response?.length && response[0].contract == symbol) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response[0].last,
                    bestAskPrice: +response[0].lowest_ask,
                    bestBidPrice: +response[0].highest_bid,
                    bestAskSize: null,
                    bestBidSize: null,
                    volume24h: +response[0].volume_24h_quote,
                    openInterest: response[0].total_size != null ? +(+response[0].total_size * +response[0].quanto_multiplier * +response[0].last).toFixed(2) : null,
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest(`futures/${instrument.toLowerCase()}/tickers/`, {
        })
        if (response?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.map(res => {
                return {
                    symbol: res.contract,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.last,
                        bestAskPrice: +res.lowest_ask,
                        bestBidPrice: +res.highest_bid,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: +res.volume_24h_quote,
                        openInterest: res.total_size != null ? +(+res.total_size * +res.quanto_multiplier * +res.last).toFixed(2) : null,
                    },
                }
            })
        }
        return null;
    }

}

module.exports = GateIO;
