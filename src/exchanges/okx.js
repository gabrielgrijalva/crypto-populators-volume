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
            const data = response.data[0];
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            // For SPOT, volCcy24h is already in quote currency (USD-notional for USDT/USDC pairs).
            // For SWAP/FUTURES, volCcy24h is in base currency, so multiply by last to get USD-notional.
            const volume24h = data.instType === 'SPOT'
                ? +(+data.volCcy24h).toFixed(2)
                : +(+data.volCcy24h * +data.last).toFixed(2);
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +data.last,
                    bestAskPrice: +data.askPx,
                    bestBidPrice: +data.bidPx,
                    bestAskSize: +data.askSz,
                    bestBidSize: +data.bidSz,
                    volume24h,
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v5/market/tickers', {
            instType: instrument.toUpperCase(), // SPOT / SWAP / FUTURES / OPTION
        });
        if (response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return response.data.map(res => {
                // For SPOT, volCcy24h is already in quote currency (USD-notional for USDT/USDC pairs).
                // For SWAP/FUTURES, volCcy24h is in base currency, so multiply by last to get USD-notional.
                const volume24h = res.instType === 'SPOT'
                    ? +(+res.volCcy24h).toFixed(2)
                    : +(+res.volCcy24h * +res.last).toFixed(2);
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
                        volume24h,
                    },
                }
            })
        }
        return null;
    }

}

module.exports = OKX;
