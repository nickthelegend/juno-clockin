import { describe, expect, it } from "vitest";

import { checkTicker, cleanTicker, suggestTicker } from "../lib/ticker";

describe("ticker", () => {
  it("suggests from the name", () => {
    expect(suggestTicker("Night Market")).toBe("NIGHT");
    expect(suggestTicker("A to B")).toBe("ATB");
    expect(suggestTicker("bloom")).toBe("BLOOM");
    expect(suggestTicker("  ")).toBe("");
    expect(suggestTicker("Café à l'aube!")).toBe("CAF");
  });

  it("cleans typed input", () => {
    expect(cleanTicker("ni ght$1")).toBe("NIGHT1");
    expect(cleanTicker("abcdefghijklmn")).toBe("ABCDEFGHIJ");
  });

  it("checks format and availability", () => {
    const taken = new Set(["BLOOM"]);
    expect(checkTicker("", taken)).toBe("empty");
    expect(checkTicker("A", taken)).toBe("format");
    expect(checkTicker("BLOOM", taken)).toBe("taken");
    expect(checkTicker("NIGHT", taken)).toBe("ok");
    expect(checkTicker("NIGHT", null)).toBe("checking");
  });
});
