# Juno: Solana Mobile CLOCK IN submission

**Every post is a market, and every day is a clock-in.** Juno is a social feed
where each photo or reel launches its own Meteora bonding curve on Solana. For
Seeker it adds a daily habit: clock in with one Seed Vault signature, earn SKR,
and spend it boosting the posts you believe in. Creators get 80% of every boost.

| | |
|---|---|
| Name | Juno |
| One-liner | A feed where every post is a market, with an on-chain daily clock-in that pays SKR you spend backing creators. |
| Repository | https://github.com/nickthelegend/juno-clockin |
| Android APK | `juno-clockin.apk`, release build, arm64-v8a + x86_64, signed with a per-app release key. sha256 below. |
| Network | Solana devnet only |
| Authorship | Juno was created by **robinbanter** (github.com/robinbanter) for the Solana STOCKLANA hackathon in Sep 2026. The CLOCK IN additions listed below were built in Oct 2026 on top of it. Whoever enters this must answer the portal's "previous hackathon" question with STOCKLANA. |

## The problem

Creators are paid by platforms, in proportion to ads, long after the attention
has moved on. Fans who spot a post early get nothing for it. And crypto social
apps have no reason to open them tomorrow: you trade once, and leave.

## The solution

1. **Every post is a market.** Posting a photo or reel launches a Meteora
   Dynamic Bonding Curve pool for it from the phone. People buy into the post
   as they scroll; the creator earns the trading fees; a curve that fills
   graduates into a Meteora DAMM v2 pool.
2. **A daily clock-in that lives on-chain.** The dark card at the top of the
   feed. One signature writes `juno:clockin:v1:<day>:s<n>` in a Memo and mints
   the day's SKR reward in the same transaction. There is no streak table: the
   app reads your streak back from your own wallet's transaction memos
   (`getSignaturesForAddress`), so anyone can check it on an explorer, and it
   survives a reinstall or a new phone.
3. **SKR boosts.** The SKR you earn is spent on the ⚡ beside every post, reel
   and coin page: 80% goes straight to the creator, 20% refills the treasury
   that pays tomorrow's rewards. The feed puts boosted posts first, ranked by
   what the treasury account *actually received* (checked against its token
   balance changes, not the memo's claim). It is a closed loop: show up, earn,
   back creators, the treasury refills.

> **Reward status in 1.6.0:** the in-app dSKR reward mint is switched off.
> Earlier builds signed the daily reward with a devnet mint-authority key
> baked into the APK; anyone could extract it, so 1.6.0 ships no authority
> key. Clock-ins still record on-chain and the streak works; the reward needs
> a server-held treasury (see HANDOFF). Boosts and the boost Blink work for
> wallets that already hold dSKR.

## Why Seeker users come back daily

- The streak resets at midnight. The reward grows each consecutive day (10 → 40
  SKR on day seven) and doubles for Seeker owners, so a missed day costs
  something visible.
- A local notification the next morning says what today's clock-in pays; one
  at 20:00 warns when a streak is about to lapse.
- Clocking in takes one tap and one Seed Vault approval. The MWA auth token is
  cached, so a returning user is not asked to connect again, and a returning
  open skips onboarding and lands on the card.
- Boosting turns the reward into social status for creators you like, which is
  the reason to scroll the feed after clocking in.

## Solana, MWA, SKR

- **Mobile Wallet Adapter** (`@solana-mobile/mobile-wallet-adapter-protocol-web3js`
  2.3.0) is the first option on Android: `authorize` on `solana:devnet` with a
  cached `auth_token`, `signTransactions` and `signMessages`. On a Seeker that
  is Seed Vault. A missing wallet app gets a plain message instead of a crash.
  Email (Privy embedded wallet) and a clearly labelled **Dev wallet (devnet
  only)** are the alternatives; MWA does not exist on iOS.
- **SKR.** Mainnet SKR is `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (classic
  SPL, 6 decimals). It does not exist on devnet, so Juno uses a **devnet
  stand-in mint, `dSKRJ7P98rwP8NsDQnS1CzZDrgJXpL3KjwN7N8FABHN`, 6 decimals**,
  labelled "SKR (devnet stand-in)" / "dSKR" everywhere in the app. Uses:
  daily rewards (earn), boosts paid to creators and the treasury (spend),
  boost-ranked feed (status).
- **Seeker Genesis Token.** A read-only mainnet lookup finds a Token-2022 SGT
  (metadata pointer and group = `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`)
  in the connected wallet; holders are badged "Seeker verified" and earn 2x.
  The memo records `:sgt` so the bonus is visible on-chain.
- **DBC trading** (from the original Juno): launch, buy, sell, exact-out buys,
  depth quotes, graduation to DAMM v2, creator fee claims. Transactions are
  built by the Juno API and signed on the phone (MWA, Privy or dev wallet).
- **AI:** Juno has no AI feature, and we did not bolt one on.

## Devnet program IDs and transactions

| What | Address / transaction |
|---|---|
| Meteora DBC program | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| Memo program | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |
| dSKR mint (SKR devnet stand-in) | [`dSKRJ7P98rwP8NsDQnS1CzZDrgJXpL3KjwN7N8FABHN`](https://solscan.io/token/dSKRJ7P98rwP8NsDQnS1CzZDrgJXpL3KjwN7N8FABHN?cluster=devnet) |
| Reward treasury dSKR account | [`6yuq14Zjymds3XsLAvELwz1ZF5NPstsBVAJTtoF5JESH`](https://solscan.io/account/6yuq14Zjymds3XsLAvELwz1ZF5NPstsBVAJTtoF5JESH?cluster=devnet) (owner `3qzGPmmn4FaLZGDCmeJE7da3CfZRuhWNF3WbMPmuu3Vm`) |
| Clock-in, day 1, +10 dSKR (from the app) | [`ofkBaiVz…CUQAhTD`](https://solscan.io/tx/ofkBaiVzCLA48DGs333Y5Ld3ZmtikKvDXroCCx9RwQyFrUQeQtGBDh5xxdU4UvUFK2vwcMnh7aS5HVUdCUQAhTD?cluster=devnet) |
| Boost, 5 dSKR on "Midnight Avenue" (from the app) | [`3frCMap4…SppMtqLi`](https://solscan.io/tx/3frCMap4HwiLLCZXx4nBLBJ8PodiastiVXLP1urXkiGNxbM5NJRttveq5ThYoMkDiwAM6odRHKfoa4m6SppMtqLi?cluster=devnet) |
| DBC buy of $AVE, 0.0155 SOL (from the app) | [`59wHu1gq…GVMYqmZo`](https://solscan.io/tx/59wHu1gq2KBQK4ApqEGcasJmaxuu9eHLEamq6LmJjt2o52BXcvPVWTgxhKTiYs1Cq4P3okpdxq2CoNBDGVMYqmZo?cluster=devnet) |
| Blink buy, 0.01 SOL of $AVE (via juno-actions) | [`mLxa8McK…`](https://solscan.io/tx/mLxa8McKXvqg2fQF6G1WmJP5U13Eobn6ues3MmjyYHN6XjRtSmrmeW6MAvW3dysqHdDUxBonypCkr9tLpurWMpt?cluster=devnet) |
| Blink boost, 5 dSKR on $AVE (via juno-actions) | [`4RJHosYm…`](https://solscan.io/tx/4RJHosYm7BJ19B3uFvJqukZUy9pz8snBFyW1gZzpZMia4U7Kr1oi2W25GyJasqARctgzRk6r73fuuvYpzMPcQqQB?cluster=devnet) |
| Earlier proof (launch, graduation to DAMM v2, fee claim) | [JUNO.md → On-chain proof](../JUNO.md#on-chain-proof-devnet) |

## Install the APK

1. Download `juno-clockin.apk`:
   https://github.com/nickthelegend/juno-clockin/releases/download/clockin-v1/juno-clockin.apk
2. On the phone, open it and allow installs from that source, or
   `adb install -r juno-clockin.apk`.
3. Open Juno → **Get Started** → tap **Connect wallet to clock in** → **Connect
   wallet** (Seed Vault / Phantom / Solflare). A new wallet is funded with
   devnet SOL from Juno's faucet automatically on its first clock-in.

APK: package `app.launch.juno`, version 1.5.0 (versionCode 126).
sha256: `1a27543bc97e764848cdce0cd0f5010caad252f8695c4f311712ec46b1fc4958`

## What is new for CLOCK IN (significant new mobile development)

- Mobile Wallet Adapter wallet path with a cached auth token, and a wallet
  chooser (MWA / email / labelled dev wallet)
- On-chain daily clock-in with streak read back from memos, rewards minted in
  the same transaction
- dSKR (SKR devnet stand-in) rewards, boosts with an 80/20 creator/treasury
  split, boost-ranked feed with on-chain verification of amounts
- Seeker Genesis Token detection (read-only mainnet) with a 2x reward
- Solana Blinks for every post: buy (0.01 / 0.05 / 0.1 SOL or custom) and
  boost (5 / 10 / 25 dSKR), served by `juno-actions/` at
  https://juno-actions.vercel.app with the app's own transaction builders
- Sign In With Solana through Mobile Wallet Adapter (verified on-device),
  and read-only `.skr` name lookup for the connected wallet
- Local streak notifications, haptics on success and failure
- Instagram-style profile for you and every creator: story ring lit by
  today's clock-in, counts, highlights (streak, dSKR, boosts, Seeker, coins),
  posts/reels/boosted grids and holdings, all from real on-chain and API data
- Returning users skip onboarding; friendlier transaction errors
- Release-signed Android APK (per-app keystore kept outside git)

## Team

- **robinbanter** — created Juno (STOCKLANA, Sep 2026)
- **nickthelegend** — CLOCK IN edition (Oct 2026)
