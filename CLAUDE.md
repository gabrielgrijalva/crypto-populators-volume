# CLAUDE.md - crypto-populators-volume

## Project Overview

A Node.js service that continuously fetches and stores **24h trading volume** data from 18 cryptocurrency derivatives exchanges into a MySQL database. It runs on scheduled cron intervals (default every 5 minutes), with a daily maintenance cycle at 00:00 UTC.

**Runtime**: Node.js v18+ | **Entry point**: `src/main.js` | **Database**: MySQL (`exchanges` database)

## Architecture

```
src/
├── main.js                  # Core orchestration: cron scheduling, fetch cycles, health tracking
├── fetch-symbols.js         # Symbol discovery & dynamic settings generation
├── pairs.json               # Auto-generated at runtime (gitignored)
├── exchanges/
│   ├── base-exchange.js     # Abstract base class all exchanges extend
│   ├── index.js             # Exchange registry (maps api_name → class)
│   └── *.js                 # 18 exchange implementations
└── utils/
    ├── index.js             # Logging, retries, error handling, asset name sanitization
    ├── db.js                # MySQL pool, table creation, inserts, data deletion
    ├── rolling-rate-limiter.js  # Domain-based rolling window rate limiter
    └── ip-rotating-requests.js  # Round-robin proxy IP rotation for HTTP requests
```

**Configuration**: `settings.js` (root) defines exchange list, DB credentials, rate limits, proxy IPs, and manual pairs. It loads `src/pairs.json` for the symbol registry.

## Data Flow

1. **Startup**: `generateDynamicSettings()` calls each exchange's `fetchSymbols()` to discover all tradeable contracts and writes `src/pairs.json`
2. **Cron cycle** (every N minutes): For each exchange + instrument pair, calls `fetchAllTickers()` (bulk) or loops `fetchTicker()` (per-symbol), then inserts volume into MySQL
3. **Daily maintenance** (00:00 UTC): Refetches symbols, clears health trackers, deletes data older than retention period (default 60 days), creates any missing tables

## Exchange Module Pattern

All exchange files extend `BaseExchange` and must implement:

- `fetchSymbols(instrument)` - Returns list of tradeable contracts
- `fetchTicker(symbol, instrument)` - Returns single symbol ticker data
- `fetchAllTickers(instrument)` - Returns all tickers in one API call (preferred)

Each exchange declares supported methods via `this.has = { fetchSymbols, fetchTicker, fetchAllTickers }`.

**Adding a new exchange**:
1. Create `src/exchanges/{exchange-name}.js` extending `BaseExchange`
2. Implement the three methods above, declaring capabilities in `this.has`
3. Register in `src/exchanges/index.js`
4. Add config entry in `settings.js` with `api_name`, optional `table_prefix`, and `instruments` array
5. Add rate limit entry in `settings.js` `rateLimits` for the exchange's API domain

**Standardized ticker response**: All exchanges must normalize to USD notional values:
```js
{ symbol, ticker: { timestamp, volume24h, close, ... } }
```

## Database Schema

One table per symbol, named `{prefix}_{instrumentCode}_volume_24h_{symbol}`:

- **Volume**: `{exchange}_{instrumentCode}_volume_24h_{symbol}` — columns: `timestamp DATETIME PK`, `volume_24h DECIMAL(30,2)`

Instrument type codes: `f` = futures, `p` = perpetual, `pq` = perpetual_quanto, `s` = spot. Max table name length: 64 chars.

Inserts use `ON DUPLICATE KEY UPDATE` (upsert on timestamp).

## Key Subsystems

### Symbol Health Tracking (`main.js`)
Detects delistings by tracking consecutive failures per symbol. A symbol is suspected delisted when:
- It fails `CONSECUTIVE_FAIL_THRESHOLD` (3) times in a row
- At least `OTHER_SYMBOLS_SUCCESS_THRESHOLD` (60%) of other symbols on the same exchange are succeeding
- Minimum `MIN_SAMPLE_SIZE` (3) other symbols exist for comparison

Triggers automatic symbol refetch with 1-hour cooldown. Resets daily.

### Rate Limiting (`utils/rolling-rate-limiter.js`)
Domain-based rolling window limiter. Limits are defined per domain in `settings.js` and multiplied by number of proxy IPs. Blocks requests that would exceed the limit until the window clears.

### IP Rotation (`utils/ip-rotating-requests.js`)
Round-robin rotation across 4 proxy IPs per hostname. Uses `localAddress` binding on HTTPS agent.

### Error Handling (`utils/index.js`)
- `withRetries(fn, retries=5, delay=2000)` - Exponential retry wrapper for API calls
- `handleError(error, sendEmail)` - Logs with UTC timestamp, optionally sends debounced email via SendGrid (5-second batching window)

## Important Conventions

- **All volume values are normalized to USD notional** before storage
- **Timestamps use UTC** throughout (`moment.utc()`)
- **Logging format**: `YYYY-MM-DD HH:mm:ss.SSS [crypto-populators-volume] - message`
- **Asset name sanitization**: XBT/xbt → BTC, strips underscores/hyphens/spaces, removes large numeric suffixes (100000, 1000000)
- **Fetch cycle mutex**: `fetchCycleInProgress[lockKey]` prevents overlapping cron cycles for the same exchange+instrument
- Files use **kebab-case**, variables use **camelCase**, classes use **PascalCase**, thresholds use **UPPER_SNAKE_CASE**

## Exchanges (18 total)

| Exchange | Module | Instruments |
|----------|--------|-------------|
| Bybit | `bybit.js` | linear, inverse |
| Binance USDM | `binance-usdm-futures.js` | perpetual |
| Binance COINM | `binance-coinm-futures.js` | perpetual |
| OKX | `okx.js` | SWAP (perpetual) |
| Gate.io | `gate-perpetuals.js` | btc, usdt (perpetual/quanto) |
| Huobi USDT | `huobi-usdt-swaps.js` | swap |
| Huobi Coin | `huobi-coin-swaps.js` | swap |
| Phemex Standard | `phemex-contract.js` | perpetual |
| Phemex Hedged | `phemex-hedged-contract.js` | perpetual |
| BitMEX | `bitmex.js` | FFWCSX |
| CoinEx | `coinex-futures.js` | perpetual |
| Deribit | `deribit.js` | perpetual, future |
| Kraken Futures | `kraken-futures.js` | perpetual, future |
| KuCoin Linear | `kucoin-linear.js` | perpetual |
| KuCoin Inverse | `kucoin-inverse.js` | perpetual |
| BingX USDM | `bingx-usdm-futures.js` | perpetual |
| BingX COINM | `bingx-coinm-futures.js` | perpetual |
| Bitget | `bitget-futures.js` | usdt-futures, coin-futures |

## Dependencies

| Package | Purpose |
|---------|---------|
| `mysql2` | MySQL connection pool (promise API) |
| `axios` | HTTP client for exchange API requests |
| `node-cron` | Cron scheduling for fetch cycles and daily maintenance |
| `moment` | UTC date/time formatting |
| `@sendgrid/mail` | Email error notifications |
| `tldjs` | Domain extraction from URLs for rate limiter |

## Production Environment

### Infrastructure

- **Cloud**: AWS EC2
- **Instance**: AMD EPYC 7R13 — 4 vCPUs, 7.6 GB RAM
- **Storage**: 500 GB NVMe SSD (`nvme0n1`)
- **OS**: Ubuntu 24.04.4 LTS (Noble Numbat), kernel 6.17
- **Private IP**: `172.31.41.117` (primary)
- **SSH access**: `ssh ubuntu@crypto-populators-volume` (hostname in local `/etc/hosts`)

### Networking — 4 Elastic IPs

The instance has 4 network interfaces (`ens5`–`ens8`), each with its own private IP, used for IP-rotated API requests:

| Interface | Private IP | Purpose |
|-----------|-----------|---------|
| `ens5` | `172.31.41.117` | Primary + API rotation |
| `ens6` | `172.31.47.55` | API rotation |
| `ens7` | `172.31.43.29` | API rotation |
| `ens8` | `172.31.47.202` | API rotation |

These IPs are configured in `settings.js` and multiplied into rate limit windows (e.g., Bybit: 10 req/s × 4 IPs = 40 req/s effective).

### Firewall

UFW is **inactive** and iptables has default ACCEPT policies. Security is managed at the AWS Security Group level.

### Process Management — PM2

- **Process manager**: PM2 (fork mode, single process)
- **PM2 process name**: `main` (id: 1)
- **Script path**: `/home/ubuntu/crypto-populators-volume/src/main.js`
- **Working directory**: `/home/ubuntu/crypto-populators-volume`
- **Node.js version**: v18.20.8 (system-installed at `/usr/bin/node`)
- **Auto-restart on boot**: Enabled via `pm2-ubuntu` systemd service + saved dump

**PM2 commands**:
```bash
pm2 status              # Check process status
pm2 logs main           # Tail stdout + stderr
pm2 logs main --err     # Tail stderr only
pm2 restart main        # Restart the service
pm2 stop main           # Stop the service
pm2 save                # Save current process list (for boot recovery)
```

### Log Management — pm2-logrotate

- **Module**: `pm2-logrotate` v3.0.0
- **Max file size**: 2048 MB (before rotation)
- **Retention**: 7 rotated files
- **Rotation schedule**: Daily at 00:00 UTC
- **Compression**: Disabled
- **Log location**: `~/.pm2/logs/`

Log files:
- `main-out.log` — stdout (high volume due to verbose ticker logging)
- `main-error.log` — stderr (exchange API errors and retries)

### MySQL Database

- **Version**: MySQL 8.0.45 (Ubuntu package)
- **Service**: Running via systemd (`systemctl status mysql`)
- **Database name**: `exchanges`
- **User**: `ardaga`
- **Connection pool**: 10 connections (app-level), max_connections: 151 (server-level)
- **InnoDB buffer pool**: 128 MB
- **Tables**: one per symbol per instrument (OI tables were moved to `crypto-populators-open-interest`)

**Data retention**: 60 days (configurable via `volume_days_to_keep` in `settings.js`). Old rows are purged daily at 00:00 UTC.

### Deployment

- **Git remote**: `git@github.com:gabrielgrijalva/crypto-populators-volume.git`
- **Deploy path**: `/home/ubuntu/crypto-populators-volume` (a full git clone tracking `origin/main`)
- **Git credentials**: SSH key configured on the server for `github.com` access (required for `git pull`)
- **Deployment process**: Manual — `git pull` to fetch latest changes, `npm install` if deps changed, `pm2 restart main`
- **Requirement**: The production directory must remain a git-tracked repository. All code updates are delivered via `git pull` from origin — never by copying files directly

## Common Tasks

- **Run the service**: `node src/main.js` (local) or `pm2 restart main` (production)
- **Install dependencies**: `npm install`
- **Config changes**: Edit `settings.js` (exchange list, rate limits, DB credentials, proxy IPs)
- **Symbol list is auto-generated**: `src/pairs.json` is written at startup and refreshed daily; do not edit manually
- **View production logs**: `ssh ubuntu@crypto-populators-volume "pm2 logs main --lines 100"`
- **Check production status**: `ssh ubuntu@crypto-populators-volume "pm2 status"`
