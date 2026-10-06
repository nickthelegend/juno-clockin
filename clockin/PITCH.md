# Juno: pitch outline

Nine slides. The content belongs on the slides themselves (the portal reads
the slides, not speaker notes), so each slide lists its on-slide text first.

---

## 1. Juno

**On slide:** Juno. Every post is a market. Every day is a clock-in.
Solana Mobile CLOCK IN · devnet · Android APK.
Screenshot: the feed with the dark clock-in card on top.

**Notes:** Juno is a social feed where every photo and reel is its own market
on Solana, and a daily clock-in that pays SKR you spend backing creators.

---

## 2. The problem

**On slide:**
- Creators are paid by ad revenue, months after the attention.
- Early fans get nothing for spotting a post first.
- Crypto social apps have no reason to open them tomorrow.

**Notes:** Three problems, one app. The third is the one CLOCK IN cares about:
trading apps get opened when there is news, not every day.

---

## 3. Every post is a market

**On slide:** Post a photo or reel → it launches a Meteora Dynamic Bonding
Curve pool. Buy into the post as you scroll. The creator earns the fees. A full
curve graduates to Meteora DAMM v2. Screenshot: post card + buy sheet.

**Notes:** This is the original Juno, built for STOCKLANA by robinbanter:
four measured curve presets, depth quotes, exact-out buys, a full devnet
lifecycle to DAMM v2, and all presets also live on mainnet.

---

## 4. The daily clock-in

**On slide:** One tap, one Seed Vault signature, once a day.
Memo `juno:clockin:v1:<day>:s<n>` + SKR reward in the same transaction.
10 → 40 SKR across a 7-day streak. Seeker owners earn 2x.
Screenshot: clock-in card before / after.

**Notes:** There is no streak database. The app reads the streak back from
your own wallet's transaction memos, so it is verifiable on Solscan and
survives a reinstall.

---

## 5. SKR: earn, boost, rank

**On slide:** Earn SKR by clocking in → spend it boosting posts.
80% to the creator · 20% refills the reward treasury.
Boosted posts lead everyone's feed, ranked by what the treasury actually received.
Screenshot: boost sheet + lime bolt on a reel.

**Notes:** A closed loop: showing up pays you, you pay creators, creators'
posts rise, the treasury refills tomorrow's rewards. The boost amount is
verified against the treasury's token balance change, not the memo's claim.
On devnet SKR is a stand-in mint (dSKR, 6 decimals like mainnet SKR), labelled
in the app.

---

## 6. Built for Seeker

**On slide:**
- Mobile Wallet Adapter first: Seed Vault on Seeker, any wallet elsewhere
- Cached auth token: no reconnect prompt on a daily open
- Seeker Genesis Token check (read-only mainnet) → "Seeker verified" + 2x
- Morning and evening streak notifications, haptics

**Notes:** The phone is the product: signing sheet, notifications, haptics,
full-screen reels.

---

## 7. How it works

**On slide:** Diagram. Phone (Expo, MWA) → devnet RPC for clock-in and boosts
(Memo + SPL Token, built on the phone). Phone → Juno API (Next.js) → Meteora
DBC for markets (server builds, phone signs). Treasury account history = boost
ledger; wallet memo history = streak.

**Notes:** The CLOCK IN features need no server: they are plain SPL Token and
Memo instructions. Markets keep the server-built-transaction design.

---

## 8. Proof

**On slide:** Devnet transactions from the app: clock-in `ofkBaiVz…`, boost
`3frCMap4…`, DBC buy `59wHu1gq…`. Earlier: launch → 100% → DAMM v2 migration,
creator fee claim. Repo: github.com/nickthelegend/juno-clockin.

**Notes:** Every number on the slide is a Solscan link in SUBMISSION.md.

---

## 9. What's next

**On slide:** Real SKR on mainnet with a server-held reward treasury and
per-SGT claim limits · dApp Store listing · creator boost leaderboards ·
`.skr` names on posts.

**Notes:** Moving to mainnet means the reward key leaves the phone: the
treasury signs rewards server-side, keyed to one claim per Seeker Genesis Token.
