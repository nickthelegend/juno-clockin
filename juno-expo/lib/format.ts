/**
 * Formatting, with no dependencies at all.
 *
 * Split out of `useApi` so it can be tested: that module reaches `./api`,
 * which reaches `expo-constants` and from there into React Native's Flow
 * source, which the repo's test runner cannot parse. These are pure functions
 * over numbers and strings and there was never a reason for them to sit behind
 * a React hook.
 */

/** Relative time, short enough for a feed row. */
export function since(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * A money figure in whatever unit it is actually in.
 *
 * Never assumes dollars. A SOL-quoted pool with no USD feed is reported in SOL,
 * and printing a `$` in front of that number would overstate it by the SOL
 * price.
 */
export function money(
  value: number | null | undefined,
  currency = "USD",
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const compact = opts.compact !== false;

  const figure =
    compact && abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(2)}M`
      : compact && abs >= 1_000
        ? `${(abs / 1_000).toFixed(2)}k`
        : abs === 0
          ? "0"
          : abs < 0.0001
            ? smallDecimal(abs)
            : abs < 1
              ? abs.toFixed(4)
              : abs.toFixed(2);

  return currency === "USD" ? `${sign}$${figure}` : `${sign}${figure} ${currency}`;
}

/**
 * A price too small for four decimals, written out in full.
 *
 * `0.000000186` stays `0.000000186`: three significant figures, trailing
 * zeros trimmed. This used subscript notation (`0.0₆186`), which is what
 * traders write, but the subscript digits are a font feature: in the bold
 * weights used on the reel dock and the price pills they rendered as
 * `0.0,990`, a number nobody can read correctly. Plain decimals are longer
 * but never wrong, and every coin here launches around 1e-7, so this is the
 * normal case. `toFixed` does the rounding, including the carry when
 * 9.999e-7 becomes 0.000001.
 */
export function smallDecimal(abs: number): string {
  if (abs === 0) return "0";
  const zeros = -Math.floor(Math.log10(abs)) - 1;
  if (zeros <= 0) return abs.toFixed(4);
  const fixed = abs.toFixed(Math.min(zeros + 3, 20));
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/**
 * Token balances and trade sizes.
 *
 * Four decimals under one, because a curve's tokens are often worth a
 * hundred-thousandth of anything and two would round a real balance to
 * nothing. Zero is the exception: `0.0000` is four digits of precision about a
 * quantity that has none, and it read especially badly beside a figure at a
 * different scale — "0.0000 of 50.00 SOL" in a savings goal.
 */
export function tokens(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value).toLocaleString("en-US")}`;
  return value.toFixed(value < 1 ? 4 : 2);
}
