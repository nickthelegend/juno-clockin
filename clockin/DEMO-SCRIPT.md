# Juno demo script

Target: about 3 minutes, narrated (judges read the transcript), recorded on the
Android emulator (`clockin_seeker`) or a Seeker. A 90-second cut is the first
six shots. Everything below is something the app really does today.

**Prep**
- Release APK installed (`adb install -r juno-clockin.apk`).
- For real MWA signing, record on a Seeker or install a wallet app (Phantom,
  Solflare or Mock MWA Wallet) on the emulator. Without one, show the
  "Connect wallet" option and its "no wallet app" message, then use
  **Dev wallet (devnet only)** and say so on camera.
- Start from a fresh install so the first clock-in shows the faucet step.

| # | Time | Shot | Narration |
|---|---|---|---|
| 1 | 0:00 | Launch Juno. Onboarding: "Every post is a market." | "Juno is a social feed on Solana where every post is its own market, and a daily clock-in pays you SKR to back creators." |
| 2 | 0:12 | Get Started → feed. The dark **Daily clock-in** card on top: "Start a streak", the week strip. | "This card is the reason to open Juno every day." |
| 3 | 0:20 | Tap **Connect wallet to clock in**. The chooser: Connect wallet (MWA), Continue with email, Dev wallet (devnet only). Tap **Connect wallet** → Seed Vault / wallet sheet → approve. | "On a Seeker, Mobile Wallet Adapter opens Seed Vault. No seed phrase in the app; the wallet holds the key." |
| 4 | 0:35 | Tap **Clock in · +10 dSKR**. Label changes to "Getting devnet SOL for the fee…" then "Approve in your wallet…". Approve. Card flips: flame lights up, "1-day streak", +10 dSKR, Today ticked. | "One signature writes today's clock-in into a Solana memo and mints the reward in the same transaction. A new wallet gets devnet SOL for the fee automatically." |
| 5 | 0:55 | Tap **view transaction** → Solscan shows the Memo `juno:clockin:v1:…:s1` and the dSKR mint. Back. | "There's no streak database. Juno reads your streak back from your own transaction history, so anyone can verify it." |
| 6 | 1:10 | Allow the notification prompt. Point at "back tomorrow for +15". | "Tomorrow pays 15, day seven pays 40, and Seeker owners earn double. A reminder comes in the morning, and another before midnight if you haven't clocked in." |
| 7 | 1:25 | Scroll the feed. Tap the ⚡ on a post → **Boost with SKR** sheet: 5 / 25 / 100, "80% to the creator, 20% refills the treasury". Boost 5. "Boosted +5 dSKR". | "You spend what you earn backing posts you believe in. Most of it goes straight to the creator." |
| 8 | 1:45 | Back on the feed: the boosted post is at the top with a lime bolt and its total. | "Boosted posts lead everyone's feed, ranked by what the treasury actually received on-chain." |
| 9 | 1:55 | Reels tab: full-screen video, rail with Like, Say, **Boost**, Share; the market dock with Sell and Buy. Tap **Buy** → trade sheet → **Use** the 1% suggestion → Buy → approve → "Done, confirmed on Solana". | "Every reel is a Meteora bonding-curve market. Buy straight from the video; the sheet tells you the most you can buy before the price moves one percent." |
| 10 | 2:20 | Profile: identity with wallet mode ("Mobile Wallet Adapter · devnet"), the compact clock-in card, SOL balance, holdings with cost basis and P&L. | "Your streak, your SKR and your positions, all read from chain." |
| 11 | 2:35 | + → Post a photo (optional, slower on devnet): pick a photo, a curve shape, sign. | "Posting launches a new pool from the phone." |
| 12 | 2:50 | End card: Juno · github.com/nickthelegend/juno-clockin · devnet · SKR stand-in labelled. | "Juno: every post is a market, every day is a clock-in." |

**Honesty notes for the edit**
- Say "devnet" and "SKR devnet stand-in" at least once on camera.
- If the dev wallet is used, caption it "Dev wallet (devnet only), standing in
  for Seed Vault on the emulator".
- A streak longer than one day needs real days to pass; do not fake it.
