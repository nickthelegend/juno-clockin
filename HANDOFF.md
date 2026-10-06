# HANDOFF — Juno, Solana Mobile CLOCK IN edition

Status as of 6 Oct 2026. Deadline: 9 Oct 2026 06:59 UTC (8 Oct 23:59 PDT).
Everything below marked **verified** was run and seen working; everything
else is stated as unverified.

## Authorship (read first)

Juno was created by **robinbanter** (121 commits, Sep 2026) for the Solana
STOCKLANA hackathon. This repo (`nickthelegend/juno-clockin`, a clone of the
`juno` branch at `b9b897f`) adds the CLOCK IN features. The portal allows one
submission per contestant and asks whether the project won a previous
hackathon and what new mobile work was done; answer with STOCKLANA and the
"What is new" list in `clockin/SUBMISSION.md`. Decide who enters it.

## What was done

| Area | Change |
|---|---|
| Cleanup | Removed `tempo-onlyfans/` (Veil design export) and `auto-blur/` (a Python auto-blur model for Veil); moved Veil docs to `docs/legacy/veil/`. Norr/Veil routes still live inside the Next.js app because the Juno API is served from the same app; the mobile app never calls them. |
| Wallet | `lib/mwa.ts`: Mobile Wallet Adapter 2.3.0 on `solana:devnet` with a cached `auth_token` (SecureStore), `signTransactions`, `signMessages`, lazy-required on Android only. `ConnectSheet`: Connect wallet (MWA) first on Android, Continue with email (Privy), Dev wallet (devnet only). Wallet mode `mwa` routed through sign / signMessage / disconnect. |
| Daily loop | `lib/clockin.ts`: clock-in = Memo `juno:clockin:v1:<day>:s<n>` + dSKR `MintToChecked` in one transaction, built on the phone, sent to devnet RPC directly. Streak read back from `getSignaturesForAddress` memos. Reward 10 → 40 dSKR over 7 days, 2x with a Seeker Genesis Token. `ClockInCard` on the feed and profile. Local notifications (`expo-notifications`): 09:00 next day, 20:00 if not clocked in. Haptics. Returning users skip onboarding. |
| SKR | Devnet stand-in mint **dSKR** `dSKRJ7P98rwP8NsDQnS1CzZDrgJXpL3KjwN7N8FABHN` (6 decimals, classic SPL, same as mainnet SKR `SKRbvo6G…`), labelled "SKR (devnet stand-in)". Boosts (⚡ on feed cards, reels rail, coin page): 80% to the creator, 20% to the treasury account `6yuq14Zj…` (owner `3qzGPmmn…`). Feed ranks boosted posts first by treasury-verified amounts. |
| Seeker | SGT detection (read-only mainnet `getParsedTokenAccountsByOwner` + mint extensions) → "Seeker verified · 2x" badge, `:sgt` flag in the memo. |
| UX fixes | One-line transaction errors instead of web3.js simulation dumps; Privy status log no longer raises a red dev toast; boost sheet clears the tab bar; clock-in card visible while the feed loads; profile shows wallet mode and a Disconnect button. |
| Build | `plugins/withReleaseSigning.js`: release builds sign with a per-app keystore read from outside the repo. app.json → 1.2.0 / versionCode 120. |
| Docs | README and JUNO.md rebranded for CLOCK IN with credit to the original; STOCKLANA submission archived to `docs/STOCKLANA-SUBMISSION.md`; `clockin/` deliverables. |
| AI | Juno has no AI feature. None was added (AI is not a scored criterion; a bolt-on would need a server key and a deploy). |

## Verified

**iOS Simulator** (iPhone 17 Pro, debug build + Metro 8381, against the
deployed devnet API), dev wallet `9DCuan197d1NgVhoCcDcEaN18eXqEjZQd6YuBg3h7kzo`:

| Step | Evidence |
|---|---|
| Faucet funded the new wallet 0.2 SOL (via the Juno API, automatically on first clock-in) | `33ZX1JE1eovFFKr73DtcuC7St4wxW3YJU45CNyLeZuJ15KAgQqW6789dEPS7iv19km1HnVJvfHJPvDY2KHa6vLPc` |
| Clock-in day 1, +10 dSKR, card flipped to "1-day streak" | `ofkBaiVzCLA48DGs333Y5Ld3ZmtikKvDXroCCx9RwQyFrUQeQtGBDh5xxdU4UvUFK2vwcMnh7aS5HVUdCUQAhTD` (memo `juno:clockin:v1:2026-10-06:s1`) |
| Boost 5 dSKR on "Midnight Avenue" from the reels rail; treasury balance went 0 → 1 dSKR | `3frCMap4HwiLLCZXx4nBLBJ8PodiastiVXLP1urXkiGNxbM5NJRttveq5ThYoMkDiwAM6odRHKfoa4m6SppMtqLi` |
| DBC buy of $AVE for 0.0155 SOL, "Done, confirmed on Solana" | `59wHu1gq2KBQK4ApqEGcasJmaxuu9eHLEamq6LmJjt2o52BXcvPVWTgxhKTiYs1Cq4P3okpdxq2CoNBDGVMYqmZo` |
| Notification permission prompt appeared after the first clock-in | screenshot (not kept) |

Screenshots: `clockin/screens/ios-*.png`.

**Release APK**: built with `./gradlew assembleRelease
-PreactNativeArchitectures=arm64-v8a,x86_64`; `apksigner verify` shows
`CN=Juno CLOCK IN` (not the debug key); `aapt2` shows `app.launch.juno`
1.2.0 (120). The Hermes bundle inside contains the current code (checked for
the fixed ATA program id and the newest strings). Installed on the
`clockin_seeker` emulator: `adb install` → Success. Emulator flow results:
see "Android emulator" below.

**`tsc --noEmit`** passes in `juno-expo/`.

## Android emulator

Partially verified. On `clockin_seeker` (Android 15, arm64 image)
the release APK **installed** (`adb install` → Success, twice) and **launched**
(`dumpsys window` showed `app.launch.juno` focused; the screenshot shows Juno's
onboarding colours behind a system "isn't responding" dialog). Driving the rest of the flow with scripted taps failed:
the emulator was so overloaded (shared host, other builders) that the Pixel
Launcher raised "isn't responding" dialogs over the app and each
`uiautomator dump` took minutes, so the lock was released rather than held
for another builder's hour. The same JS bundle's full flow (dev wallet →
faucet → clock-in → boost → DBC buy) **was** verified on the iOS simulator
above, and the bundle inside the APK was checked to contain the current code.

To finish this on a quiet machine (5 minutes): take the lock, boot the AVD,
`adb install -r -g juno-clockin.apk`, open Juno → Get Started → "Connect
wallet to clock in" → (Connect wallet shows the no-wallet message) → Dev
wallet (devnet only) → Clock in. The script used is in the session notes; it
is a plain `adb`/`uiautomator` tap-by-text loop.

## Not verified / known limits

- **Real MWA signing is untested.** No wallet app is installed on the
  emulator (and none was downloaded). The MWA code follows the 2.3.0 API and
  compiles into the APK; test it on a Seeker or with Phantom / Solflare / Mock
  MWA Wallet on the emulator (Mock MWA Wallet needs a screen PIN). Wallets
  generally keep the reward authority's existing signature on
  `signTransactions`; if one strips it, the clock-in fails with a signature
  error and the fix is to have the wallet sign first and the authority second.
- **Privy email sign-in** was not exercised (needs a real inbox). It is the
  original v1.1.0 integration, unchanged.
- **The dSKR reward authority key ships inside the APK** (`EXPO_PUBLIC_SKR_DEVNET_AUTHORITY`).
  It is a devnet-only key controlling a worthless stand-in mint, kept out of
  git (it lives in `juno-expo/.env`, gitignored, and in
  `~/.config/solana/juno-clockin/`). Anyone who extracts it can mint dSKR on
  devnet. That is acceptable for a devnet demo and **not** for mainnet: there,
  rewards must be paid by a server-held treasury with one claim per Seeker
  Genesis Token (SIWS-authenticated).
- Streaks follow the phone's local midnight and are not enforced on-chain (a
  memo can be written by anyone); the reward is what matters and that needs
  the server-side treasury above for mainnet.
- Multi-day streaks have only been seen at day 1 (real days have to pass).
- The web build at juno-app-chi.vercel.app predates CLOCK IN.

## Backend

The APK talks to the **existing** devnet API
`https://juno-web-production-bd2e.up.railway.app` (same as the v1.1.0 APK;
checked read-only: `GET /api/juno/coins` and `/feed` return 200 with
`cluster: devnet`). It was not modified or redeployed. All CLOCK IN features
(clock-in, dSKR, boosts, SGT) go straight to Solana RPC and need nothing from
it. Markets, trading, the faucet, likes and comments use it as before. If it
goes down, the feed and trading stop working; the clock-in card still works
for a funded wallet. To self-host instead: see `DEPLOY.md` (Next.js on Railway
with `DATABASE_URL`, `MONGODB_URI`, `PINATA_JWT`, `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`),
then rebuild the APK with `EXPO_PUBLIC_API_URL` pointing at it.

## Files outside git (back these up)

| What | Where |
|---|---|
| Release keystore (PKCS12, alias `juno-clockin`) | `/Volumes/Extreme SSD/Projects/clockin/keys/juno-clockin-release.keystore` |
| Keystore passwords | `~/.config/juno-clockin/signing.properties` (read by the Gradle plugin) |
| dSKR mint keypair, reward authority, a spare payer | `~/.config/solana/juno-clockin/` and `.juno/clockin/` (gitignored) |
| App env (API URL, dSKR mint + authority) | `juno-expo/.env` (gitignored) |
| Root env for the Next.js API | `.env.local` (copied from the original, gitignored) |

Losing the keystore means future APKs cannot upgrade installs of this one,
and the dApp Store listing would need a new key.

## Rebuild the APK

```bash
source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
cd juno-expo
npm install
npx expo prebuild -p android --no-install     # applies withReleaseSigning
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
cp app/build/outputs/apk/release/app-release.apk "/Volumes/Extreme SSD/Projects/clockin/apks/juno-clockin.apk"
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs "/Volumes/Extreme SSD/Projects/clockin/apks/juno-clockin.apk"
shasum -a 256 "/Volumes/Extreme SSD/Projects/clockin/apks/juno-clockin.apk"
```

iOS simulator: `npx expo prebuild -p ios`, `cd ios && LANG=en_US.UTF-8 pod install`,
`xcodebuild -workspace ios/Juno.xcworkspace -scheme Juno -sdk iphonesimulator
-destination id=<udid> build`, then `npx expo start --port 8381` and set
`RCT_jsLocation` to `localhost:8381`.

## What you (the user) must do

1. Decide who enters Juno (one submission per person; robinbanter is the
   original author).
2. Publish the APK as a direct download, e.g. a GitHub release on this repo:
   `gh release create v1.2.0-clockin "/Volumes/Extreme SSD/Projects/clockin/apks/juno-clockin.apk" -R nickthelegend/juno-clockin --title "Juno CLOCK IN" --notes "Devnet build for Solana Mobile CLOCK IN"`
   → `https://github.com/nickthelegend/juno-clockin/releases/download/v1.2.0-clockin/juno-clockin.apk`
3. Test MWA once on a Seeker or with a wallet app on the emulator (above).
4. Record the narrated demo (`clockin/DEMO-SCRIPT.md`), make the deck from
   `clockin/PITCH.md` (Google Slides or Drive PDF), and submit on
   https://solanamobile.radiant.nexus before the deadline.
5. Back up the keystore and passwords.
