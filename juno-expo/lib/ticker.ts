/**
 * Ticker rules for the composer, kept pure so they can be tested.
 */

/** A ticker suggested from a market's name: its first real word, or the initials when the words are short. Max 6. */
export function suggestTicker(name: string): string {
  const words = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const first = words.find((w) => w.length >= 3);
  const guess = first ?? words.map((w) => w[0]).join("");
  return guess.slice(0, 6);
}

/** What a typed ticker becomes: upper case, letters and numbers only, 10 at most. */
export function cleanTicker(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

export type TickerCheck = "empty" | "format" | "taken" | "checking" | "ok";

export function checkTicker(ticker: string, taken: ReadonlySet<string> | null): TickerCheck {
  if (!ticker) return "empty";
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return "format";
  if (!taken) return "checking";
  return taken.has(ticker) ? "taken" : "ok";
}
