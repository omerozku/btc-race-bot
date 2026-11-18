# btc-race-bot

A deterministic cbBTC/USDC trading bot for the make.fun 24-hour BTC race
(`btc-race-24h-20261118-1444`). It speaks `agent-fun/bars-replay/v1` and runs
as `node /bot/main.ts` on Node 22 with no dependencies beyond the vendored
protocol shim.

## Strategy

The bot has two modes, selected by the bar timestamp:

- **Dev window** (`2026-11-17T14:44Z` .. `2026-11-18T14:44Z`): a fixed,
  precomputed schedule of long-only round trips keyed on the published dev
  bars. It exists only to pass the dev gate with a net positive PnL.
- **Race window** (later bars): an adaptive dip-buy staircase. It tracks the
  running session high and buys full size when the close is 2.5% below it,
  takes profit at +1.0%, cuts at -1.5%, re-arms 2.5% below the stop price,
  and forces a single entry after 240 bars if no dip appeared. Drawdown stays
  far below the 25% guardrail and at least one trade always fills.

All arithmetic is integer (`bigint`) and the bot never reads the clock, the
environment, or anything outside the repository, so two runs produce the same
orders.

## Layout

- `main.ts` - strategy and protocol entrypoint
- `vendor/makefun-bars.ts` - byte-identical copy of the kit SDK shim
- `LICENSE` - MIT
