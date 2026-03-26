const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange");

const axios = require("axios");
const moment = require("moment");

class KrakenFutures extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://futures.kraken.com/derivatives/api/v3";
        this.exchangeName = 'kraken-futures';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: true,
        };
    }

    // Exchange info functions

    async fetchSymbols(instrument) {
        try {
            const response = await axios.get(`${this.url}/instruments`);

            if (response?.data?.instruments?.length) {
                return response.data.instruments
                    .filter(instr => instr.tradeable === true) // Only include tradeable instruments
                    .map(instr => {
                        // Determine if this is perpetual or futures
                        let adjustedType;
                        if (instr.perpetual || instr.symbol.startsWith('PI_') || instr.symbol.startsWith('PF_')) {
                            adjustedType = 'perpetual';
                        } else {
                            adjustedType = 'futures';
                        }

                        // Parse the pair to get base and quote
                        const pairParts = instr.pair.split(':');
                        const base = pairParts[0];
                        const quote = pairParts[1] || 'USD';

                        // Determine if this is inverse or linear
                        const isInverse = instr.symbol.startsWith('PI_');

                        // Format the table_symbol with appropriate suffix
                        const tableSuffix = isInverse ? '_I' : '_L';
                        const tableSymbol = base + quote + tableSuffix;

                        return {
                            symbol: instr.symbol,
                            table_symbol: tableSymbol,
                            type: adjustedType,
                            asset: sanitizeAssetName(base),
                        };
                    });
            }
            return null;
        } catch (error) {
            console.error('Error fetching symbols from Kraken Futures:', error);
            return null;
        }
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        try {
            const response = await this.publicRequest(`tickers/${symbol}`);

            if (response?.ticker) {
                const ticker = response.ticker;
                const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return {
                    symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: ticker.last ? +ticker.last : null,
                        bestAskPrice: null,
                        bestBidPrice: null,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: ticker.volumeQuote != null ? +(+ticker.volumeQuote).toFixed(2) : null,
                        openInterest: ticker.openInterest != null ? (symbol.startsWith('PF_') ? (ticker.last != null ? +(+ticker.openInterest * +ticker.last).toFixed(2) : null) : +(+ticker.openInterest).toFixed(2)) : null,
                    }
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol} from Kraken Futures:`, error);
            return null;
        }
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        try {
            const response = await this.publicRequest('tickers');

            if (response?.tickers?.length) {
                const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return response.tickers.map(ticker => {
                    return {
                        symbol: ticker.symbol,
                        ticker: {
                            timestamp,
                            open: null,
                            high: null,
                            low: null,
                            close: ticker.last ? +ticker.last : null,
                            bestAskPrice: null,
                            bestBidPrice: null,
                            bestAskSize: null,
                            bestBidSize: null,
                            volume24h: ticker.volumeQuote != null ? +(+ticker.volumeQuote).toFixed(2) : null,
                            openInterest: ticker.openInterest != null ? (ticker.symbol.startsWith('PF_') ? (ticker.last != null ? +(+ticker.openInterest * +ticker.last).toFixed(2) : null) : +(+ticker.openInterest).toFixed(2)) : null,
                        },
                    };
                });
            }
            return null;
        } catch (error) {
            console.error('Error fetching all tickers from Kraken Futures:', error);
            return null;
        }
    }
}

module.exports = KrakenFutures;
