const bitmex = require('./bitmex');
const bybit = require('./bybit');
const coinex_futures = require('./coinex-futures');
const coinex_spot = require('./coinex-spot');
const phemex_contract = require('./phemex-contract');
const phemex_hedged_contract = require('./phemex-hedged-contract');
const okx = require('./okx');
const gate_perpetuals = require('./gate-perpetuals');
const gate_spot = require('./gate-spot');
const huobi_coin_swaps = require('./huobi-coin-swaps');
const huobi_usdt_swaps = require('./huobi-usdt-swaps');
const huobi_spot = require('./huobi-spot');
const binance_usdm_futures = require('./binance-usdm-futures');
const binance_coinm_futures = require('./binance-coinm-futures');
const binance_spot = require('./binance-spot');
const bitget_futures = require('./bitget-futures');
const bitget_spot = require('./bitget-spot');
const bingx_usdm_futures = require('./bingx-usdm-futures');
const bingx_coinm_futures = require('./bingx-coinm-futures');
const bingx_spot = require('./bingx-spot');
const deribit = require('./deribit');
const deribit_spot = require('./deribit-spot');
const kraken_futures = require('./kraken-futures');
const kucoin_linear = require('./kucoin-linear');
const kucoin_inverse = require('./kucoin-inverse');

module.exports = {
    bitmex,
    bybit,
    coinex_futures,
    coinex_spot,
    phemex_contract,
    phemex_hedged_contract,
    okx,
    gate_perpetuals,
    gate_spot,
    huobi_coin_swaps,
    huobi_usdt_swaps,
    huobi_spot,
    binance_usdm_futures,
    binance_coinm_futures,
    binance_spot,
    bitget_futures,
    bitget_spot,
    bingx_usdm_futures,
    bingx_coinm_futures,
    bingx_spot,
    deribit,
    deribit_spot,
    kraken_futures,
    kucoin_linear,
    kucoin_inverse,
};
