const { handleError, sanitizeAssetName } = require('../utils');
const BaseExchange = require("./base-exchange");

const axios = require("axios");
const moment = require("moment");

class CoinexFutures extends BaseExchange {

    constructor(ips = [], globalRateLimiter) {
        super(ips, globalRateLimiter);
        this.url = "https://api.coinex.com";
        this.exchangeName = 'coinex-futures';
        // Declare capabilities
        this.has = {
            fetchSymbols: true,
            fetchTicker: true,
            fetchAllTickers: false,
        };
    }

    // Helper functions

    roundToClosest10thMinute(momentObj) {
        let minutes = momentObj.minute();
        let adjustment = minutes % 10; // Get the remainder when divided by 10

        if (minutes <= 5) {
            // Round down
            momentObj.subtract(adjustment, 'minutes');
        } else {
            // Round up
            momentObj.add(10 - adjustment, 'minutes');
        }

        // Set seconds and milliseconds to zero
        momentObj.second(0);
        momentObj.millisecond(0);

        return momentObj;
    }

    // Exchange data functions

    async fetchSymbols(type) {
        const response = await this.publicRequest('v2/futures/market', {});
        if (response?.code === 0) {
            return response.data.map(symbol => {
                return {
                    symbol: symbol.market,
                    table_symbol: symbol.market,
                    type: 'perpetual',
                    asset: sanitizeAssetName(symbol.market),
                };
            });
        }
        return null;
    }

    // Market data functions

    async fetchTicker(symbol, instrument) {
        const [tickerResponse, depthResponse] = await Promise.all([
            this.publicRequest('v2/futures/ticker', { market: symbol }),
            this.publicRequest('v2/futures/depth', {
                market: symbol,
                limit: 5,
                interval: "0" })
        ]);

        if (tickerResponse?.code == 0 && depthResponse?.code == 0) {
            const ticker = tickerResponse.data[0];
            const depth = depthResponse.data.depth;
            const timestamp = moment().utc().subtract(1, 'minutes').startOf('minute').format('YYYY-MM-DD HH:mm:ss');
            const volume24h = symbol.slice(-3) === 'USD' ? +(+ticker.volume).toFixed(2) : +(+ticker.value).toFixed(2);

            const bestAsk = depth.asks[0] || [];
            const bestBid = depth.bids[0] || [];

            return {
                symbol,
                ticker: {
                    timestamp,
                    open: null,
                    high: null,
                    low: null,
                    close: +ticker.last,
                    bestAskPrice: +bestAsk[0] || +ticker.sell,
                    bestBidPrice: +bestBid[0] || +ticker.buy,
                    bestAskSize: +bestAsk[1] || +ticker.sell_amount,
                    bestBidSize: +bestBid[1] || +ticker.buy_amount,
                    volume24h,
                }
            };
        }
        return null;
    }

}

module.exports = CoinexFutures;
