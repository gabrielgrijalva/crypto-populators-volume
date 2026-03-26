const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class HuobiUSDTSwaps extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.hbdm.vn";
        this.exchangeName = 'huobi-usdt-swaps'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('linear-swap-api/v1/swap_contract_info', {
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
        const response = await this.publicRequest('linear-swap-ex/market/detail/merged', {
            contract_code: symbol
        })
        if (response?.status === 'ok') {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +response.tick.close,
                    bestAskPrice: response.tick.ask ? +response.tick.ask[0] : null,
                    bestBidPrice: response.tick.bid ? +response.tick.bid[0] : null,
                    bestAskSize: response.tick.ask ? +response.tick.ask[1] : null,
                    bestBidSize: response.tick.bid ? +response.tick.bid[1] : null,
                    volume24h: +(+response.tick.trade_turnover).toFixed(2),
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('v2/linear-swap-ex/market/detail/batch_merged', {
        })
        if (response?.status === 'ok' && response?.ticks?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.ticks.map(res => {
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
                        volume24h: +(+res.trade_turnover).toFixed(2),
                    },
                }
            })
        }
        return null;
    }

}

module.exports = HuobiUSDTSwaps;
