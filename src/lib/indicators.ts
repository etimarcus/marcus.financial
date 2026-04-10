export function sma(values: number[], period: number): number[] {
  if (period <= 0) throw new Error("period must be > 0");
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push(sum / period);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  if (period <= 0) throw new Error("period must be > 0");
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    const curr = values[i] * k + prev * (1 - k);
    out.push(curr);
    prev = curr;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  if (values.length <= period) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  const out: number[] = [];
  out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }
  const signalLine = ema(macdLine, signal);
  const sigOffset = macdLine.length - signalLine.length;
  const histogram: number[] = signalLine.map(
    (s, i) => macdLine[i + sigOffset] - s
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

export type IndicatorSnapshot = {
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema12?: number;
  ema26?: number;
  rsi14?: number;
  macd?: { macd: number; signal: number; histogram: number };
};

export function snapshot(closes: number[]): IndicatorSnapshot {
  const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];
  const result: IndicatorSnapshot = {};
  if (closes.length >= 20) result.sma20 = last(sma(closes, 20));
  if (closes.length >= 50) result.sma50 = last(sma(closes, 50));
  if (closes.length >= 200) result.sma200 = last(sma(closes, 200));
  if (closes.length >= 12) result.ema12 = last(ema(closes, 12));
  if (closes.length >= 26) result.ema26 = last(ema(closes, 26));
  if (closes.length > 14) result.rsi14 = last(rsi(closes, 14));
  if (closes.length >= 35) {
    const m = macd(closes);
    const macdVal = last(m.macd);
    const sigVal = last(m.signal);
    const histVal = last(m.histogram);
    if (macdVal !== undefined && sigVal !== undefined && histVal !== undefined) {
      result.macd = { macd: macdVal, signal: sigVal, histogram: histVal };
    }
  }
  return result;
}
