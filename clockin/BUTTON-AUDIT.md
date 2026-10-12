# Juno 1.7.0: every-button audit (no mocks)

Run on 2026-10-12 with a **Release** build (`xcodebuild -configuration Release`, embedded bundle, the existing devnet
API `juno-web-production-bd2e.up.railway.app`, read and used as a normal client, not modified or redeployed) on the
iPhone 17 Pro simulator (`5CE49A2A-…`), dev wallet `9DCuan197d1NgVhoCcDcEaN18eXqEjZQd6YuBg3h7kzo` (labelled "Dev wallet
(devnet only)"). On-chain rows were checked with `solana confirm -u devnet <sig>` (all `Finalized`).

## Are the feed and the coins real?

- **Coins:** all 25 pools the API lists exist on devnet as Meteora DBC pools (`getMultipleAccounts`: 25/25, owner
  `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`). Each was launched by a real transaction from its creator wallet, e.g.
  $NEON by @lena: `58pgyJG38rJdqekY8PBGgaB6mFvdoNWuTU438tmTLhAAJUF1vfCq1UoUwfrrmDWwuxQfJSAbGsPN1oZVyVbAnQNr`
  (`InitializeVirtualPoolWithSplToken`).
- **The people:** @lena, @kai, @rio and @ana are wallets the seed scripts created; their names carry a `demo_` prefix in
  the names registry and the app used to hide it, so they read as real people. They now show as "lena (demo)" etc.
  Their coins and trades stay, because those are real devnet launches and fills.
- "$SAVE" on Reels is the ticker chip of **$AVE** (Midnight Avenue), a real coin; nothing named SAVE exists.
- Posts in the feed are by the launcher wallet that opened those pools and describe them; trades come from chain.
- **Pre-IPO marks/holders/valuations** come from Tessera's public API (labelled on screen); Stocks use Pyth.
- **Clock-in rewards:** the dSKR mint authority was removed from the app in 1.6.0, so clock-ins mint nothing. The
  clock-in card already said so; the profile bio, the boosts empty state, the Seeker sheet, the onboarding sentence,
  the boost balance hint and a "2x on Seeker" chip still promised dSKR. All are now conditional on a reward authority
  being present (it is not), so no reward is promised.

## A real launch through the app's own flow (this session)

| Step | Signature |
|---|---|
| Launch "Green Hour" ($GREENHR): config | `W88PL2wLQDoeZK3Pd2Xrciw3CxiekpUu2VQfZZnetnURVdvAtX1HUiHBn2izHNEuZSdfuzTTzQBdKxQiZMcx8QA` |
| Launch: bonding-curve pool (`InitializeVirtualPoolWithSplToken`), mint `Gauw4MPEZpMYKaWfZWvZAKbgG6SRqmAsRuRSNscZAdXZ` | `2Xbpq4fQHScbA3stwmEHMm5j2wRi525p6FMZ2qxJMRgqQzTJ3MMbYEhY9xpqnx5fpD63cGuKob1KHCvjJoDU3eFp` |
| Buy 0.0178 SOL (~$2) with a trade comment | `bumCcfK54m6HaXgZCNgSCsJwoBpjUpG9KfG3XvhXwFr3R4irrKNtkLz9n1yfgjTZkb3KdVo1XuoCPHXKyBGXg8V` |
| Sell 50% (927,844 GREENHR for 0.0080 SOL) | `52v6xpioUTSsK9f4eyWaehmYSzRVdysYGo4UWkB6sRiUAeo3t563mt3REoYumeLpZBPVm3DtXtT1hcJLskG5Fhya` |
| Boost 5 dSKR (self-boost → treasury) | `4nxAW5exMbcGH8kjJ37UMTKr2pEqgcPEC8bBAxHiVHtJVytz8x2WYLm8twuqMnfQLgEd29ZGeVWcLvfi14SPPFDk` |
| Claim creator fees (0.0006 SOL) | `2fisL5JcPuu3EqLy2KmaRnQefPpw9vg2oq7QqYri2pUwTVh5ETtN7PPZw8n65qaYtXgz2qKsUNPgoGt26mxsBiMe` |
| Clock-in (memo, today's, from the 1.6.1 round; one per local day) | `JCfFbXt9ntXTPBQx1VhbNZGUNUSorr2BWduatoAV23G7RUHtweieNhWV5AfJZ5pLrg45wbj77sSHL2uRvrzG8Kq` |

## Controls

| Screen | Control | Expected | Result | Tx | Fix |
|---|---|---|---|---|---|
| Home | Streak ring → clock-in sheet | Today's state from chain | Pass (already clocked in today) | `JCfFbXt9…zG8Kq` | Hash text and "2x on Seeker" promise removed |
| Home | Coin stories | Coin pages | Pass | | |
| Home | For you / Following | Switch feed | Pass | | |
| Home | Follow (feed header) | Backend follow | Pass (server shows `viewerFollows: true`) | | |
| Home | Like, comment count, share, boost, Buy on a card | Work | Like pass (1); others same components as below | | |
| Composer | Post a photo → picker → Crop/Change → Next | Media step | Pass | | |
| Composer | Name, ticker (availability check), caption | Details step | Pass ("$GREENHR is available") | | |
| Composer | Pick a curve, Launch | Two launch transactions | Pass | `W88PL2wL…cx8QA`, `2Xbpq4fQ…DU3eFp` | |
| Composer | View your market / Share / Post another | Navigate / share | View your market pass | | |
| Coin | Buy sheet: presets, keypad, quote, comment, Buy | Swap | Pass | `bumCcfK5…XKyBGXg8V` | |
| Coin | Sell tab: 25/50/75/100%, Sell | Swap | Pass | `52v6xpio…G5Fhya` | Switching Buy/Sell after a trade showed the old receipt as a fake "Sold 0 … — confirmed"; now starts a new trade |
| Coin | Boost (bolt): amount, Boost 5 dSKR | dSKR transfer | Pass | `4nxAW5ex…SPPFDk` | |
| Coin | Share boost Blink | Share sheet with a dial.to Blink; the Action answers GET | Pass | | |
| Coin | Comments: read, Post | Backend comment | Pass | | |
| Coin | Watch | Watchlist | Pass ("Watching") | | |
| Coin | Claim creator fees | On-chain claim | Pass | `2fisL5Jc…6mxsBiMe` | Receipt shows "View on Solscan", not a hash |
| Coin | Activity / Holders / Comments / Details tabs | Real data | Activity, Holders pass | | Details: mint and pool rows say "Tap to copy" instead of addresses |
| Trade | Search, Pre-IPO/Stocks/Memes/Traders, sort chips | Filter real markets | Pass | | |
| Trade | Trader row | Trader profile | Pass | | Demo personas labelled "(demo)" |
| Reels | Follow, avatar +, coin chip, Buy/Sell dock | Work | Follow pass (server confirmed) | | |
| Profile | Settings (wallet sheet): Choose a name → Save | Wallet-signed name claim | Pass ("@greenhou") | | |
| Profile | Wallet sheet: Get devnet SOL | Backend/public faucet | Faucets dry; honest message + faucet link | | |
| Profile | Wallet sheet: Signed in with Solana | SIWS proof | Shown after the fix | | A restored dev wallet had no proof; it now signs in again on launch |
| Profile | Edit profile, Share profile | Name sheet / share sheet | Pass | | |
| Profile | Delete dev wallet | Destructive | Not tapped (would delete the test wallet) | | |

## Mocks and dev text removed

- Reward promises the build cannot keep (dSKR from clock-ins, Seeker 2x) — six places.
- Seeded demo personas passing as people → labelled "(demo)".
- A fake trade receipt when switching Buy/Sell after a trade.
- Transaction hashes on receipts (TxRow, clock-in, claim) and mint/pool addresses on the coin page.
- The receipt journal lockout (shared fix with Polaris, XORV and XORR).

## Sponsor tech

- **MWA** (Seed Vault on Seeker) with the labelled iOS dev wallet; **SIWS** on connect, now also for a restored dev wallet;
  **.skr** name lookup (mainnet, read-only); **Seeker Genesis Token** check (read-only, no promised bonus);
  **SKR**: dSKR devnet stand-in for boosts (80% creator / 20% treasury), **Blinks** for buy/boost.

## Still not real

- Clock-ins mint no dSKR (the authority is deliberately not shipped); a new wallet therefore has no dSKR to boost with.
- The backend faucet and the public faucet were dry during this run.
