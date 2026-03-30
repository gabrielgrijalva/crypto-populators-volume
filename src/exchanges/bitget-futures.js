const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class BitgetFutures extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.bitget.com";
        this.exchangeName = 'bitget-futures'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('api/v2/mix/market/contracts', {
            productType: instrument
        }
        );
        if (response?.msg === 'success' && response?.data?.length) {
            return response.data
            .filter(res => res.symbolStatus === 'normal')
            .map(res => {
                let adjustedType;
                switch(res.symbolType) {
                    case 'perpetual':
                        adjustedType = 'perpetual';
                        break;
                    case 'delivery':
                        adjustedType = 'futures';
                        break;
                    default:
                        throw new Error(`Unsupported type ${res.symbolType}`);
                }

                return {
                    symbol: res.symbol,
                    table_symbol: res.symbol,
                    type: adjustedType,
                    asset: sanitizeAssetName(res.baseCoin),
                }
                }
            );
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const response = await this.publicRequest('api/v2/mix/market/ticker', {
            symbol: symbol.toUpperCase(),
            productType: instrument.toUpperCase()
        });
        if (response?.msg === 'success') {
            console.log(response.data[0])
            const lastPrice = +response.data[0].lastPr;
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: lastPrice,
                    bestAskPrice: +response.data[0].askPr,
                    bestBidPrice: +response.data[0].bidPr,
                    bestAskSize: +response.data[0].askSz,
                    bestBidSize: +response.data[0].bidSz,
                    volume24h: +(+response.data[0].quoteVolume).toFixed(2),
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const response = await this.publicRequest('api/v2/mix/market/tickers', {
            productType: instrument.toUpperCase()
        })
        console.log('Fetched all tickers')
        if (response?.msg === 'success' && response?.data?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');

            return response.data.map((res) => {
                const lastPrice = +res.lastPr;
                return {
                    symbol: res.symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: lastPrice,
                        bestAskPrice: +res.askPr,
                        bestBidPrice: +res.bidPr,
                        bestAskSize: +res.askSz,
                        bestBidSize: +res.bidSz,
                        volume24h: +(+res.quoteVolume).toFixed(2),
                    },
                }
            })
        }
        return null;
    }

}

module.exports = BitgetFutures;
