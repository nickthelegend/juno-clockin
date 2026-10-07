import { describe, expect, it } from "vitest";

import { dayKey, previousDay, rewardFor, streakFrom } from "../lib/clockin";

describe("streakFrom", () => {
  const today = "2026-10-07";

  it("counts consecutive days ending today", () => {
    expect(streakFrom(new Set(["2026-10-05", "2026-10-06", "2026-10-07"]), today)).toEqual({
      streak: 3,
      clockedToday: true,
      best: 3,
    });
  });

  it("keeps yesterday's streak alive until midnight", () => {
    expect(streakFrom(new Set(["2026-10-05", "2026-10-06"]), today)).toMatchObject({ streak: 2, clockedToday: false });
  });

  it("resets after a missed day but remembers the best run", () => {
    expect(streakFrom(new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"]), today)).toEqual({
      streak: 0,
      clockedToday: false,
      best: 3,
    });
  });

  it("crosses month boundaries", () => {
    expect(streakFrom(new Set(["2026-09-30", "2026-10-01"]), "2026-10-01").streak).toBe(2);
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });

  it("formats the local day", () => {
    expect(dayKey(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
  });
});

describe("rewardFor", () => {
  it("grows by 5 a day to 40 and doubles on Seeker", () => {
    expect([1, 2, 3, 7, 30].map((d) => rewardFor(d, false))).toEqual([10, 15, 20, 40, 40]);
    expect(rewardFor(2, true)).toBe(30);
  });
});
