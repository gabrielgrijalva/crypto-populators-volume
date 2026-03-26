const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange")

const axios = require("axios");
const moment = require("moment");

class Deribit extends BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://www.deribit.com/api/v2";
        this.exchangeName = 'deribit'
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
            const response = await axios.get(`${this.url}/public/get_instruments`, {
                params: {
                    currency: 'any',
                    kind: 'future',
                    expired: false
                }
            });

            if (response?.data?.result?.length) {
                return response.data.result
                    .map(instr => {
                        let adjustedType;
                        if (instr.settlement_period === 'perpetual') {
                            adjustedType = 'perpetual';
                        } else {
                            adjustedType = 'futures';
                        }

                        // Determine if this is linear or inverse
                        const isLinear = instr.instrument_type === 'linear';

                        // Format table_symbol
                        let tableSymbol;
                        if (adjustedType === 'perpetual') {
                            // For perpetuals, use ASSETQUOTE format
                            if (instr.quote_currency) {
                                tableSymbol = instr.base_currency + instr.quote_currency;
                            } else {
                                // For inverse contracts, the quote currency is implied to be USD
                                tableSymbol = instr.base_currency + 'USD';
                            }
                        } else {
                            // For futures, use the original instrument name but clean up any hyphens or underscores
                            tableSymbol = instr.instrument_name.replace(/-|_/g, '');
                        }

                        return {
                            symbol: instr.instrument_name,
                            table_symbol: tableSymbol,
                            type: adjustedType,
                            asset: sanitizeAssetName(instr.base_currency),
                        };
                    });
            }
            return null;
        } catch (error) {
            console.error('Error fetching symbols from Deribit:', error);
            return null;
        }
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        try {
            const response = await this.publicRequest('public/ticker', {
                instrument_name: symbol
            });

            if (response?.result) {
                const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return {
                    symbol,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: +response.result.last_price,
                        bestAskPrice: null,
                        bestBidPrice: null,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: +(+response.result.stats.volume_usd).toFixed(2),
                    }
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol} from Deribit:`, error);
            return null;
        }
    }

    // Batch market data functions

    async fetchAllTickers(instrument) {
        try {
            const [btcResponse, ethResponse] = await Promise.all([
                this.publicRequest('public/get_book_summary_by_currency', { currency: 'BTC' }),
                this.publicRequest('public/get_book_summary_by_currency', { currency: 'ETH' }),
            ]);

            const allItems = [
                ...(btcResponse?.result || []),
                ...(ethResponse?.result || []),
            ];

            if (allItems.length) {
                const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
                return allItems.map(item => ({
                    symbol: item.instrument_name,
                    ticker: {
                        timestamp,
                        open: null,
                        high: null,
                        low: null,
                        close: null,
                        bestAskPrice: null,
                        bestBidPrice: null,
                        bestAskSize: null,
                        bestBidSize: null,
                        volume24h: +(+item.volume_usd).toFixed(2),
                    },
                }));
            }
            return null;
        } catch (error) {
            console.error('Error fetching all tickers from Deribit:', error);
            return null;
        }
    }
}

module.exports = Deribit;
