import { describe, expect, it } from "vitest";

import { money, smallDecimal, tokens } from "../lib/format";

/**
 * Juno's number formatting. Coins launch around 1e-7, so tiny prices are the
 * normal case, and they must read correctly in any font weight: plain
 * decimals, three significant figures, no subscript glyphs, no exponents.
 */
describe("smallDecimal", () => {
  it("writes tiny prices out in full with three significant figures", () => {
    expect(smallDecimal(0.000000186)).toBe("0.000000186");
    expect(smallDecimal(0.00000099)).toBe("0.00000099");
    expect(smallDecimal(0.0000224)).toBe("0.0000224");
  });

  it("carries when rounding crosses a power of ten", () => {
    expect(smallDecimal(0.0000009999)).toBe("0.000001");
  });

  it("trims trailing zeros", () => {
    expect(smallDecimal(0.0000001)).toBe("0.0000001");
    expect(smallDecimal(0.00000012)).toBe("0.00000012");
  });

  it("never uses subscripts, commas or exponents", () => {
    for (const value of [1e-9, 3.3e-8, 9.9e-7, 1.234e-5]) {
      const text = smallDecimal(value);
      expect(text).toMatch(/^0\.0*\d+$/);
      expect(text).not.toMatch(/[₀-₉,e]/);
    }
  });
});

describe("money", () => {
  it("formats a reel's tiny unit price readably (the $0.0,990 bug)", () => {
    expect(money(0.00000099, "USD", { compact: false })).toBe("$0.00000099");
    expect(money(0.000000186, "USD", { compact: false })).toBe("$0.000000186");
  });

  it("signs negatives", () => {
    expect(money(-0.000000186, "USD", { compact: false })).toBe("-$0.000000186");
  });

  it("leaves readable decimals alone", () => {
    expect(money(0.000224, "USD", { compact: false })).toBe("$0.0002");
    expect(money(0.89, "USD", { compact: false })).toBe("$0.8900");
    expect(money(144.54, "USD", { compact: false })).toBe("$144.54");
  });

  it("compacts market caps and labels non-USD quotes", () => {
    expect(money(990.24)).toBe("$990.24");
    expect(money(1_010)).toBe("$1.01k");
    expect(money(225_118)).toBe("$225.12k");
    expect(money(1_240_000)).toBe("$1.24M");
    expect(money(2.5, "SOL", { compact: false })).toBe("2.50 SOL");
    expect(money(0.00000099, "SOL", { compact: false })).toBe("0.00000099 SOL");
  });

  it("returns a dash for unmeasured values and 0 for a true zero", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money(Number.NaN)).toBe("—");
    expect(money(0, "USD", { compact: false })).toBe("$0");
  });
});

describe("tokens", () => {
  it("compacts millions, groups thousands and keeps small balances", () => {
    expect(tokens(3_650_000)).toBe("3.65M");
    expect(tokens(16_481)).toBe("16,481");
    expect(tokens(0.5)).toBe("0.5000");
    expect(tokens(0)).toBe("0");
  });
});
