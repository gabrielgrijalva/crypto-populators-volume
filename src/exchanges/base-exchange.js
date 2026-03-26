const IPRotatingRequest = require('../utils/ip-rotating-requests');

class BaseExchange {
    constructor(ips = [], globalRateLimiter) {
        this.ipRotatingRequest = new IPRotatingRequest(ips);
        this.globalRateLimiter = globalRateLimiter;
        this.has = {
            fetchSymbols: false,
            fetchTicker: false,
            fetchAllTickers: false,
        }
    }

    async publicRequest(endpoint, params = {}) {
        const fullUrl = `${this.url}/${endpoint}`;
        if (this.globalRateLimiter) {
            await this.globalRateLimiter.requestPermission(fullUrl);
        }
        try {
            const response = await this.ipRotatingRequest.request({
                method: 'GET',
                url: fullUrl,
                params: params
            });
            return response.data;
        } catch (error) {
            const errorMessage = `Error fetching from ${this.exchangeName} at ${endpoint}: ${error.message}`;
            console.log(errorMessage);
            throw error;
        }
    }

    async fetchSymbols(instrument) {
        throw new Error('fetchSymbols not implemented');
    }

    async fetchTicker(symbol, instrument) {
        throw new Error('fetchTicker not implemented');
    }

    async fetchAllTickers(instrument) {
        throw new Error('fetchAllTickers not implemented');
    }
}

module.exports = BaseExchange;
