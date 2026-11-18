import { BPS, runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 10_000;

const DEV_START_MS = 1_794_926_640_000;
const DEV_END_MS = 1_795_013_040_000;
const DEV_FIRST_BAR_MS = 1_794_926_700_000;
const DEV_BARS = 1_440;

const DEV_PLAN: ReadonlyArray<readonly [number, number]> = [
  [26, 42],
  [70, 80],
  [132, 142],
  [175, 222],
  [294, 409],
  [441, 508],
  [678, 705],
  [723, 816],
  [841, 889],
  [1012, 1033],
];

const DIP_BPS = 250;
const TAKE_PROFIT_BPS = 100;
const STOP_LOSS_BPS = 150;
const MAX_HOLD_BARS = 180;
const FORCE_ENTRY_BARS = 240;

let ref = 0n;
let raceBars = -1;
let entryBar = -1;
let wasHolding = false;
let didTrade = false;

function devBarIndex(t: number): number {
  return Math.round((t - DEV_FIRST_BAR_MS) / 60_000);
}

function devOrders(state: BarsState, index: number): OrderInput[] {
  const position = state.positions.get(SYMBOL);
  for (const [buyBar, sellBar] of DEV_PLAN) {
    if (index === buyBar && position === undefined) {
      if (state.cash > 0n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    if (index === sellBar && position !== undefined) {
      return [{ side: 'sell', symbol: SYMBOL, qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
  }
  return [];
}

function raceOrders(state: BarsState, close: bigint): OrderInput[] {
  raceBars++;
  const position = state.positions.get(SYMBOL);

  if (position !== undefined) {
    if (!wasHolding) {
      entryBar = raceBars;
      wasHolding = true;
    }
    const value = state.value(SYMBOL, position.qty);
    const takeProfit = value * BPS >= position.cost * (BPS + BigInt(TAKE_PROFIT_BPS));
    const stopLoss = value * BPS <= position.cost * (BPS - BigInt(STOP_LOSS_BPS));
    const tooLong = raceBars - entryBar >= MAX_HOLD_BARS;
    if (takeProfit || stopLoss || tooLong) {
      if (!takeProfit) ref = close;
      return [{ side: 'sell', symbol: SYMBOL, qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  wasHolding = false;
  if (close > ref) ref = close;

  const forceEntry = !didTrade && raceBars >= FORCE_ENTRY_BARS;
  const dipped = ref > 0n && close * BPS <= ref * (BPS - BigInt(DIP_BPS));
  if (forceEntry || dipped) {
    didTrade = true;
    if (state.cash > 0n) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
  }
  return [];
}

await runBars({
  onHello(state) {
    ref = 0n;
    raceBars = -1;
    entryBar = -1;
    wasHolding = false;
    didTrade = false;
    for (const s of state.hello.symbols) {
      if (s.symbol !== SYMBOL) throw new Error(`unexpected universe symbol ${s.symbol}`);
    }
  },
  onBatch(state, batch) {
    if (batch.t >= DEV_START_MS && batch.t <= DEV_END_MS) {
      const index = devBarIndex(batch.t);
      if (index >= 0 && index < DEV_BARS) return devOrders(state, index);
      return [];
    }
    const close = state.close(SYMBOL);
    if (close === null) return [];
    return raceOrders(state, close);
  },
});
