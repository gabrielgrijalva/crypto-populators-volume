const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class BinanceUSDMFutures extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://fapi.binance.com";
        this.exchangeName = 'binance-usdm-futures'
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        const response = await this.publicRequest('fapi/v1/exchangeInfo');
        if (response?.symbols?.length) {
            return response.symbols
            .filter(symbol => symbol.status === 'TRADING')
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
                    table_symbol: symbol.symbol.replace('_', ''),
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
        const tickerResponse = await this.publicRequest('fapi/v1/ticker/24hr', {
            symbol,
        })
        const bookTickerResponse = await this.publicRequest('fapi/v1/ticker/bookTicker', {
            symbol,
        })
        if (tickerResponse?.lastPrice && bookTickerResponse?.bidPrice && bookTickerResponse?.askPrice) {
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +tickerResponse.lastPrice,
                    bestAskPrice: +bookTickerResponse.askPrice,
                    bestBidPrice: +bookTickerResponse.bidPrice,
                    bestAskSize: +bookTickerResponse.askQty,
                    bestBidSize: +bookTickerResponse.bidQty,
                    volume24h: +(+tickerResponse.quoteVolume).toFixed(2),
                }
            }
        }
        return null;
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        const tickerResponse = await this.publicRequest('fapi/v1/ticker/24hr', {
        })
        const bookTickerResponse = await this.publicRequest('fapi/v1/ticker/bookTicker', {
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
                        volume24h: +(+res.quoteVolume).toFixed(2),
                    },
                }
            })
        }
        return null;
    }

}

module.exports = BinanceUSDMFutures;
