const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class BinanceCoinMFutures extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://dapi.binance.com";
        this.exchangeName = 'binance-coinm-futures'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('dapi/v1/exchangeInfo');
        if (response?.symbols?.length) {
            return response.symbols
            .filter(symbol => symbol.contractStatus === 'TRADING')
            .map(symbol => {
                let adjustedType;
                switch (symbol.contractType.toLowerCase()) {
                    case 'perpetual':
                    case 'tradifi_perpetual':
                        adjustedType = 'perpetual';
                        break;
                    case 'current_quarter':
                        adjustedType = 'futures';
                        break;
                    case 'next_quarter':
                        adjustedType = 'futures';
                        break;
                    default:
                        // Skip unsupported contract types instead of throwing
                        return null;
                }

                return {
                    symbol: symbol.symbol,
                    table_symbol: symbol.pair,
                    type: adjustedType,
                    asset: sanitizeAssetName(symbol.baseAsset),
                }
            })
            .filter(Boolean);
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const tickerResponse = await this.publicRequest('dapi/v1/ticker/24hr', {
            symbol,
        })
        const bookTickerResponse = await this.publicRequest('dapi/v1/ticker/bookTicker', {
            symbol,
        })
        if (tickerResponse[0]?.lastPrice && bookTickerResponse[0]?.bidPrice && bookTickerResponse[0]?.askPrice) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +tickerResponse[0].lastPrice,
                    bestAskPrice: +bookTickerResponse[0].askPrice,
                    bestBidPrice: +bookTickerResponse[0].bidPrice,
                    bestAskSize: +bookTickerResponse[0].askQty,
                    bestBidSize: +bookTickerResponse[0].bidQty,
                    volume24h: +(+tickerResponse[0].baseVolume * +tickerResponse[0].lastPrice).toFixed(2),
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const tickerResponse = await this.publicRequest('dapi/v1/ticker/24hr', {
        })
        const bookTickerResponse = await this.publicRequest('dapi/v1/ticker/bookTicker', {
        })

        if (tickerResponse?.length && bookTickerResponse?.length) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return tickerResponse.map(res => {
                return {
                    symbol: res.symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +res.lastPrice,
                        bestAskPrice: +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol)?.askPrice ? +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol).askPrice : null,
                        bestBidPrice: +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol)?.bidPrice ? +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol).bidPrice : null,
                        bestAskSize: +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol)?.askQty ? +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol).askQty : null,
                        bestBidSize: +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol)?.bidQty ? +bookTickerResponse.find(bookTicker => bookTicker.symbol === res.symbol).bidQty : null,
                        volume24h: +(+res.baseVolume * +res.lastPrice).toFixed(2),
                    },
                }
            })
        }
        return null;
    }

}

module.exports = BinanceCoinMFutures;
