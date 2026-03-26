const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class BingXCoinMFutures extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://open-api.bingx.com";
        this.exchangeName = 'bingx-coinm-futures';
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
            const response = await axios.get(`${this.url}/openApi/cswap/v1/market/contracts`, {
                params: { timestamp }
            });

            if (response?.data?.data?.length) {
                return response.data.data.map(contract => {
                    // Extract asset and quote from symbol (e.g., BTC-USD -> BTC, USD)
                    const [asset, quote] = contract.symbol.split('-');
                    return {
                        symbol: contract.symbol,
                        table_symbol: asset + quote, // e.g. BTCUSD
                        type: 'perpetual', // BingX COIN-M are perpetual contracts
                        asset: sanitizeAssetName(asset),
                    };
                });
            }
            return null;
        } catch (error) {
            console.error('Error fetching symbols from BingX COIN-M Futures:', error);
            return null;
        }
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        try {
            const timestamp = Date.now();
            const [response, oiResponse] = await Promise.all([
                axios.get(`${this.url}/openApi/cswap/v1/market/ticker`, {
                    params: { symbol, timestamp }
                }),
                axios.get(`${this.url}/openApi/cswap/v1/market/openInterest`, {
                    params: { symbol, timestamp }
                }).catch(() => null)
            ]);

            if (response?.data?.data) {
                const data = response.data.data;
                const lastPrice = data.lastPrice ? +data.lastPrice : null;
                const oiBase = oiResponse?.data?.data?.[0]?.openInterest;
                const openInterest = oiBase && lastPrice ? +(+oiBase * lastPrice).toFixed(2) : null;
                const ts = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return {
                    symbol,
                    ticker: {
                        timestamp: ts,
                        open: null,
                        high: null,
                        low: null,
                        close: lastPrice,
                        bestAskPrice: null,
                        bestBidPrice: null,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: data.quoteVolume && lastPrice ? +(+data.quoteVolume * lastPrice).toFixed(2) : null,
                        openInterest,
                    }
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol} from BingX CoinM Futures:`, error);
            return null;
        }
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        try {
            const timestamp = Date.now();
            const response = await axios.get(`${this.url}/openApi/cswap/v1/market/ticker`, {
                params: { timestamp }
            });

            if (response?.data?.data?.length) {
                const ts = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');

                // Fetch OI for each symbol in parallel
                const oiResults = await Promise.allSettled(
                    response.data.data.map(data =>
                        axios.get(`${this.url}/openApi/cswap/v1/market/openInterest`, {
                            params: { symbol: data.symbol, timestamp: Date.now() }
                        }).catch(() => null)
                    )
                );

                return response.data.data.map((data, i) => {
                    const lastPrice = data.lastPrice ? +data.lastPrice : null;
                    const oiRes = oiResults[i]?.status === 'fulfilled' ? oiResults[i].value : null;
                    const oiBase = oiRes?.data?.data?.[0]?.openInterest;
                    const openInterest = oiBase && lastPrice ? +(+oiBase * lastPrice).toFixed(2) : null;
                    return {
                        symbol: data.symbol,
                        ticker: {
                            timestamp: ts,
                            open: null,
                            high: null,
                            low: null,
                            close: lastPrice,
                            bestAskPrice: null,
                            bestBidPrice: null,
                            bestAskSize: null,
                            bestBidSize: null,
                            volume24h: data.quoteVolume && lastPrice ? +(+data.quoteVolume * lastPrice).toFixed(2) : null,
                            openInterest,
                        },
                    };
                });
            }
            return null;
        } catch (error) {
            console.error('Error fetching all tickers from BingX CoinM Futures:', error);
            return null;
        }
    }
}

module.exports = BingXCoinMFutures;
