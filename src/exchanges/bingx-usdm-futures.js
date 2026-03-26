const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class BingXUSDMFutures extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://open-api.bingx.com";
        this.exchangeName = 'bingx-usdm-futures';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        }
    }

    // Exchange data functions

    async fetchSymbols(instrument) {
        try {
            const timestamp = Date.now();
            const response = await axios.get(`${this.url}/openApi/swap/v2/quote/contracts`, {
                params: { timestamp }
            });

            if (response?.data?.data?.length) {
                return response.data.data.map(contract => {
                    // Extract asset and quote from symbol (e.g., BTC-USDT -> BTC, USDT)
                    const [asset, quote] = contract.symbol.split('-');
                    return {
                        symbol: contract.symbol,
                        table_symbol: asset + quote, // e.g. BTCUSDT
                        type: 'perpetual', // BingX USDT-M are all perpetual contracts
                        asset: sanitizeAssetName(asset),
                    };
                });
            }
            return null;
        } catch (error) {
            console.error('Error fetching symbols from BingX USDM Futures:', error);
            return null;
        }
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        try {
            const timestamp = Date.now();
            const [response, oiResponse] = await Promise.all([
                axios.get(`${this.url}/openApi/swap/v2/quote/ticker`, {
                    params: { symbol, timestamp }
                }),
                axios.get(`${this.url}/openApi/swap/v2/quote/openInterest`, {
                    params: { symbol, timestamp }
                }).catch(() => null)
            ]);

            if (response?.data?.data) {
                const data = response.data.data;
                const oiValue = oiResponse?.data?.data?.openInterest;
                const openInterest = oiValue ? +(+oiValue).toFixed(2) : null;
                const ts = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return {
                    symbol,
                    ticker: {
                        timestamp: ts,
                        open: null,
                        high: null,
                        low: null,
                        close: data.lastPrice ? +data.lastPrice : null,
                        bestAskPrice: null,
                        bestBidPrice: null,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: data.quoteVolume ? +(+data.quoteVolume).toFixed(2) : null,
                        openInterest,
                    }
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol} from BingX USDM Futures:`, error);
            return null;
        }
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        try {
            const timestamp = Date.now();
            const response = await axios.get(`${this.url}/openApi/swap/v2/quote/ticker`, {
                params: { timestamp }
            });

            if (response?.data?.data?.length) {
                const ts = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');

                // Fetch OI for each symbol in parallel
                const oiResults = await Promise.allSettled(
                    response.data.data.map(data =>
                        axios.get(`${this.url}/openApi/swap/v2/quote/openInterest`, {
                            params: { symbol: data.symbol, timestamp: Date.now() }
                        }).catch(() => null)
                    )
                );

                return response.data.data.map((data, i) => {
                    const oiRes = oiResults[i]?.status === 'fulfilled' ? oiResults[i].value : null;
                    const oiValue = oiRes?.data?.data?.openInterest;
                    const openInterest = oiValue ? +(+oiValue).toFixed(2) : null;
                    return {
                        symbol: data.symbol,
                        ticker: {
                            timestamp: ts,
                            open: null,
                            high: null,
                            low: null,
                            close: data.lastPrice ? +data.lastPrice : null,
                            bestAskPrice: null,
                            bestBidPrice: null,
                            bestAskSize: null,
                            bestBidSize: null,
                            volume24h: data.quoteVolume ? +(+data.quoteVolume).toFixed(2) : null,
                            openInterest,
                        },
                    };
                });
            }
            return null;
        } catch (error) {
            console.error('Error fetching all tickers from BingX USDM Futures:', error);
            return null;
        }
    }
}

module.exports = BingXUSDMFutures;
