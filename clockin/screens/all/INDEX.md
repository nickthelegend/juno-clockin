# Juno screen census (1.4.0, iPhone 17 Pro simulator, 7 Oct 2026)

Every screen and state reachable with the dev wallet `9DCu…7kzo` on devnet,
captured after the polish round. Images are half resolution (603 × 1311).

| # | File | Route | What it shows | How to reach | Known issues |
|---|---|---|---|---|---|
| 01 | `01-onboarding.png` | `/` | Onboarding: "Every post is a market.", devnet pill, Get Started | First launch with no wallet | Captured on 1.3.x (no visual change since). Returning users skip it. |
| 02 | `02-feed-loading-before-clockin-1.3.png` | `/(tabs)/social` | Feed skeleton while the market list loads, under the **old** full clock-in card | Launch while the API is slow | Old 1.3 card; the 1.4 slim strip replaces it before clock-in. The 1.4 strip state could not be captured today because the wallet had already clocked in (it appears each morning). |
| 03 | `03-feed-clocked-in.png` | `/(tabs)/social` | Feed after clocking in: streak story bubble ("2 days") leads the reels strip; first post card | Feed tab | — |
| 04 | `04-clockin-sheet.png` | sheet on feed | Full clock-in card, week strip, labelled tx row (Copy / Solscan), reward rules | Tap the streak bubble (or the strip before clocking in) | — |
| 05 | `05-feed-post-card.png` | `/(tabs)/social` | Post card actions: market cap, like, comments, share, boost (lime "15"), Buy; "Bought by", curve progress | Scroll the feed | — |
| 06 | `06-feed-following-empty.png` | `/(tabs)/social` (Following) | Empty Following feed with "Show everyone" | Header toggle → Following | Plain placeholder; acceptable. |
| 07 | `07-boost-sheet.png` | sheet on reels | Boost sheet: 5 / 25 / 100 dSKR, balance, 80/20 split | Bolt on a reel or post | — |
| 08 | `08-boost-done.png` | sheet on reels | Boost confirmed, tx row with Copy / Solscan (devnet tx `GX9v2LRm…k79FT`) | Boost 5 dSKR | — |
| 10 | `10-reels.png` | `/(tabs)/reels` | Full-screen reel, rail (like / say / boost / share), dock with price **$0.00000099** (was `$0.0,990`) | Reels tab | — |
| 11 | `11-trade-tab.png` | `/(tabs)/trade` | Pre-IPO: OpenAI / Kalshi from Tessera marks, tracker rows | Trade tab | — |
| 12 | `12-trade-memes.png` | `/(tabs)/trade?seg=memes` | Memes list: posts as markets with cap, likes, replies, curve progress | Trade → Memes | — |
| 13 | `13-trade-traders.png` | `/(tabs)/trade` (Traders) | Leaderboard by profit taken, with the partial-read note | Trade → Traders | — |
| 14 | `14-trade-traders-loading.png` | same | Skeleton rows while the leaderboard walks pools | Trade → Traders, first second | — |
| 15 | `15-coin-page.png` | `/coin/[mint]` | Coin page: media, price **$0.000000992**, chart, range, boost and Buy dock | Tap a market | — |
| 16 | `16-coin-page-details.png` | `/coin/[mint]` | Name, ticker, address copy, market cap / volume / creator rewards, Activity tab | Scroll the coin page | — |
| 17 | `17-comments-sheet.png` | sheet on coin | Empty comments with composer | Coin page → comment button | — |
| 18 | `18-create-sheet.png` | sheet on tabs | Post a photo / Post a reel | Centre + | — |
| 19 | `19-post-photo.png` | `/(tabs)/post?format=post` | Launch form: photo picker, name, ticker, caption | + → Post a photo | — |
| 20 | `20-post-curves.png` | same | Four curve presets drawn, disabled Launch until a photo is picked | Scroll the post form | — |
| 21 | `21-creator-page-loading.png` | `/trader/[wallet]` | Creator page while reads are in flight (dashes, not zeros) | Tap a creator | — |
| 22 | `22-creator-page.png` | `/trader/[wallet]` | Instagram-style creator page: monogram avatar, counts, coin chip, Follow / Buy, highlights, posts grid | Tap a creator name | — |
| 23 | `23-profile-own.png` | `/(tabs)/profile` | Own profile: "Your profile", streak ring, zero stats turned into actions (First post, Find creators), "Choose a name" prompt, highlights | Profile tab | — |
| 24 | `24-profile-boosted.png` | same, Boosted tab | Posts boosted, with dSKR amount badges | Profile → bolt tab | — |
| 25 | `25-profile-holdings.png` | same, Holdings | Portfolio total and positions | Profile → coins tab | — |
| 26 | `26-profile-watching-empty.png` | same, Watching | Empty watchlist copy | Holdings → Watching | — |
| 27 | `27-settings-sheet.png` | sheet on profile | Wallet type, wallet card, balances, faucet, Delete dev wallet | Profile → gear | — |
| 28 | `28-edit-name-sheet.png` | sheet on profile | Signed name claim | "Choose a name" or Edit profile | — |
| 30 | `30-buy-sheet-empty.png` | trade sheet | Buy, empty amount, presets, 1% depth suggestion | Buy on a reel / post / coin | — |
| 31 | `31-buy-sheet-quoted.png` | trade sheet | $2 preset quoted: fee, impact, tokens out | Tap $2 | — |
| 32 | `32-sell-sheet.png` | trade sheet | Sell 50% of a holding, quoted | Sell tab → 50% | Fixed in 1.4: switching Buy → Sell used to keep the SOL amount as a token count (100% impact). |

Not captured, and why:

- **Notification permission prompt:** already answered on this simulator; it
  only appears once, after the first clock-in (seen on 6 Oct).
- **Connect sheet / no-wallet states:** need the dev wallet deleted, which
  would lose the streak used for the demo. Seen working on 6 Oct.
- **Offline / error state:** the feed shows "You're offline" with Try again
  when the API cannot be reached (code path added in 1.4); not forced here.
- **Trade success sheet:** shown on 6 Oct (`clockin/screens/ios-05-buy-confirmed.png`,
  pre-1.4 layout); 1.4 replaces the hash text with the same tx row as 08.
