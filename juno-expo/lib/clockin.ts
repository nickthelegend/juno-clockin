import { Connection, PublicKey, Transaction } from "@solana/web3.js";

import {
  associatedTokenAddress,
  createAtaIdempotent,
  devnet,
  memo,
  mintToChecked,
  skrAuthority,
  SKR_DECIMALS,
  SKR_DEVNET_MINT,
  SKR_TREASURY_OWNER,
  toBaseUnits,
  transferChecked,
} from "./solana";
import type { WalletState } from "./wallet";

/**
 * CLOCK IN — the daily loop, kept entirely on-chain.
 *
 * A clock-in is one devnet transaction the user signs: a Memo
 * (`juno:clockin:v1:<day>:s<streak>`) plus the day's SKR reward minted to
 * them. There is no streak table anywhere. The streak is *read back* from the
 * wallet's own signature history — `getSignaturesForAddress` returns each
 * transaction's memo — so it is verifiable by anyone on an explorer and
 * survives a reinstall, a new phone, or Juno's servers going away.
 *
 * Boosts are the other half of the SKR economy: spend SKR on a post you
 * believe in, 80% goes to its creator and 20% to the Juno treasury that funds
 * clock-in rewards. Every boost touches the treasury's token account, so the
 * treasury's own history is the global boost ledger — again, no indexer.
 */

const CLOCKIN_PREFIX = "juno:clockin:v1:";
const BOOST_PREFIX = "juno:boost:v1:";

/** The calendar day on this phone, as YYYY-MM-DD. Streaks follow the person's own midnight. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() - 1);
  return dayKey(date);
}

/** Reward schedule: 10 dSKR on day one, +5 a day up to 40 on day seven and after. Seeker doubles it. */
export function rewardFor(streakDay: number, seeker: boolean): number {
  const base = 10 + 5 * (Math.min(Math.max(streakDay, 1), 7) - 1);
  return seeker ? base * 2 : base;
}

export type ClockInEntry = { day: string; signature: string; blockTime: number | null; seeker: boolean };

export type ClockInState = {
  /** Consecutive days, ending today if clocked in today, else yesterday. */
  streak: number;
  clockedToday: boolean;
  /** Days clocked in, newest first. */
  entries: ClockInEntry[];
  /** Longest run in the history read. */
  best: number;
  total: number;
};

/** "[24] juno:clockin:v1:…" — the RPC prefixes each memo with its length and joins several with "; ". */
function memoBodies(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split("; ").map((part) => part.replace(/^\[\d+\]\s*/, ""));
}

/** Pure: a streak from the set of days clocked in. */
export function streakFrom(days: Set<string>, today = dayKey()): { streak: number; clockedToday: boolean; best: number } {
  const clockedToday = days.has(today);
  let cursor = clockedToday ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && previousDay(sorted[i]!) === sorted[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { streak, clockedToday, best };
}

export async function readClockIns(address: string, connection: Connection = devnet()): Promise<ClockInState> {
  const signatures = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 400 });
  const byDay = new Map<string, ClockInEntry>();
  for (const row of signatures) {
    if (row.err) continue;
    for (const body of memoBodies(row.memo)) {
      if (!body.startsWith(CLOCKIN_PREFIX)) continue;
      const [day, , flag] = body.slice(CLOCKIN_PREFIX.length).split(":");
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || byDay.has(day)) continue;
      byDay.set(day, { day, signature: row.signature, blockTime: row.blockTime ?? null, seeker: flag === "sgt" });
    }
  }
  const { streak, clockedToday, best } = streakFrom(new Set(byDay.keys()));
  return {
    streak,
    clockedToday,
    entries: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    best,
    total: byDay.size,
  };
}

type Window = { blockhash: string; lastValidBlockHeight: number };

/**
 * One line a person can act on, instead of web3.js' multi-paragraph
 * simulation dump ("Catch the SendTransactionError and call getLogs()…").
 */
export function friendlyTxError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/insufficient (funds|lamports)|no record of a prior credit|0x1\b/i.test(text)) {
    return "Not enough devnet SOL for the fee. Tap Get devnet SOL on your profile, then try again.";
  }
  if (/blockhash not found|block height exceeded|expired/i.test(text)) {
    return "The network moved on before it was signed. Try again.";
  }
  if (/declined|rejected|cancel/i.test(text)) return "You declined the signature.";
  if (/429|Too Many Requests/i.test(text)) return "Devnet is rate-limiting right now. Try again in a minute.";
  const first = text.split("\n").find((line) => line.trim() && !/^Simulation failed\.?$/i.test(line.trim()));
  return (first ?? text).replace(/^Message:\s*/, "").slice(0, 160);
}

/** Sign a phone-built transaction with the connected wallet and send it to devnet. */
async function signAndSend(
  wallet: WalletState,
  transaction: Transaction,
  window: Window,
  connection: Connection,
): Promise<string> {
  const unsigned = transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
  const signed = await wallet.sign(unsigned);
  try {
    const signature = await connection.sendRawTransaction(Buffer.from(signed, "base64"), {
      skipPreflight: false,
      maxRetries: 3,
    });
    const result = await connection.confirmTransaction({ signature, ...window }, "confirmed");
    if (result.value.err) throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
    return signature;
  } catch (error) {
    throw new Error(friendlyTxError(error));
  }
}

export type ClockInResult = { signature: string; reward: number; streak: number; rewarded: boolean };

export async function clockIn(
  wallet: WalletState,
  state: ClockInState,
  options: { seeker: boolean },
  connection: Connection = devnet(),
): Promise<ClockInResult> {
  if (!wallet.address) throw new Error("Connect a wallet first");
  if (state.clockedToday) throw new Error("Already clocked in today");

  const user = new PublicKey(wallet.address);
  const streak = state.streak + 1;
  const reward = rewardFor(streak, options.seeker);
  const authority = skrAuthority();

  const window = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({ feePayer: user, ...window });
  transaction.add(memo(`${CLOCKIN_PREFIX}${dayKey()}:s${streak}${options.seeker ? ":sgt" : ""}`, user));
  if (authority) {
    transaction.add(
      createAtaIdempotent(user, user, SKR_DEVNET_MINT),
      mintToChecked(
        SKR_DEVNET_MINT,
        associatedTokenAddress(user, SKR_DEVNET_MINT),
        authority.publicKey,
        toBaseUnits(reward),
        SKR_DECIMALS,
      ),
    );
    // The reward authority co-signs first; the wallet adds the user's signature.
    transaction.partialSign(authority);
  }

  const signature = await signAndSend(wallet, transaction, window, connection);
  return { signature, reward: authority ? reward : 0, streak, rewarded: Boolean(authority) };
}

/* ------------------------------------------------------------------ */
/* Boosts                                                              */
/* ------------------------------------------------------------------ */

/** Share of a boost paid to the post's creator; the rest refills the reward treasury. */
export const BOOST_CREATOR_PCT = 80n;
export const BOOST_AMOUNTS = [5, 25, 100] as const;

export function treasuryAccount(): PublicKey {
  return associatedTokenAddress(SKR_TREASURY_OWNER, SKR_DEVNET_MINT);
}

export async function boost(
  wallet: WalletState,
  input: { coinMint: string; creator: string; amount: number },
  connection: Connection = devnet(),
): Promise<string> {
  if (!wallet.address) throw new Error("Connect a wallet first");
  const user = new PublicKey(wallet.address);
  const creator = new PublicKey(input.creator);
  const source = associatedTokenAddress(user, SKR_DEVNET_MINT);
  const total = toBaseUnits(input.amount);
  const toCreator = (total * BOOST_CREATOR_PCT) / 100n;
  const toTreasury = total - toCreator;

  const window = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({ feePayer: user, ...window });
  transaction.add(memo(`${BOOST_PREFIX}${input.coinMint}:${input.amount}`, user));
  if (!creator.equals(user)) {
    transaction.add(
      createAtaIdempotent(user, creator, SKR_DEVNET_MINT),
      transferChecked(
        source,
        SKR_DEVNET_MINT,
        associatedTokenAddress(creator, SKR_DEVNET_MINT),
        user,
        toCreator,
        SKR_DECIMALS,
      ),
      transferChecked(source, SKR_DEVNET_MINT, treasuryAccount(), user, toTreasury, SKR_DECIMALS),
    );
  } else {
    // Boosting your own post sends all of it to the treasury: you cannot pay yourself.
    transaction.add(transferChecked(source, SKR_DEVNET_MINT, treasuryAccount(), user, total, SKR_DECIMALS));
  }
  return signAndSend(wallet, transaction, window, connection);
}

export type BoostTotal = { amount: number; count: number; unverified: number };
export type BoostTotals = Map<string, BoostTotal>;

type TokenRow = { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } };
const receivedCache = new Map<string, number | null>();

/** What the treasury account actually received in one transaction, in whole SKR. Null when unreadable. */
async function treasuryReceived(signature: string, connection: Connection): Promise<number | null> {
  if (receivedCache.has(signature)) return receivedCache.get(signature)!;
  try {
    const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta) return null;
    const owner = SKR_TREASURY_OWNER.toBase58();
    const mint = SKR_DEVNET_MINT.toBase58();
    const pick = (rows: TokenRow[] | null | undefined) =>
      (rows ?? []).find((row) => row.owner === owner && row.mint === mint)?.uiTokenAmount.uiAmount ?? 0;
    const value = Math.max(0, pick(tx.meta.postTokenBalances) - pick(tx.meta.preTokenBalances));
    receivedCache.set(signature, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Total SKR boosted into each coin, read from the treasury account's history.
 *
 * The memo *states* an amount; the treasury's balance change *proves* one.
 * For the newest `verifyLimit` boosts the counted amount is what the transfer
 * actually paid (treasury share scaled back up), so a memo claiming 1,000
 * while paying 1 counts as 5. Older boosts count at their memo amount and are
 * reported as unverified.
 */
export async function readBoosts(connection: Connection = devnet(), verifyLimit = 20): Promise<BoostTotals> {
  const totals: BoostTotals = new Map();
  const signatures = await connection.getSignaturesForAddress(treasuryAccount(), { limit: 200 });
  let checked = 0;
  for (const row of signatures) {
    if (row.err) continue;
    for (const body of memoBodies(row.memo)) {
      if (!body.startsWith(BOOST_PREFIX)) continue;
      const [coin, amountText] = body.slice(BOOST_PREFIX.length).split(":");
      const claimed = Number(amountText);
      if (!coin || !Number.isFinite(claimed) || claimed <= 0) continue;
      let amount = claimed;
      let unverified = 1;
      if (checked < verifyLimit) {
        checked += 1;
        const received = await treasuryReceived(row.signature, connection);
        if (received !== null) {
          // A treasury share of 20% implies a boost 5x its size; a self-boost pays 100%.
          const implied = received >= claimed ? claimed : received * (100 / Number(100n - BOOST_CREATOR_PCT));
          amount = Math.min(claimed, Math.round(implied * 1e6) / 1e6);
          unverified = 0;
        }
      }
      const entry = totals.get(coin) ?? { amount: 0, count: 0, unverified: 0 };
      entry.amount += amount;
      entry.count += 1;
      entry.unverified += unverified;
      totals.set(coin, entry);
    }
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* Seeker Genesis Token                                                */
/* ------------------------------------------------------------------ */

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const SGT_GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
const MAINNET_RPC = process.env.EXPO_PUBLIC_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";

type MintExtension = { extension: string; state?: Record<string, string> };

/**
 * The Seeker Genesis Token this wallet holds, or null.
 *
 * One SGT is minted per Seeker into its Seed Vault wallet, and it exists only
 * on mainnet, so this is a **read-only mainnet lookup**: no transaction, no
 * funds. A match needs a non-zero Token-2022 balance whose mint points both
 * its metadata and its group membership at the SGT collection. Returns the
 * mint — the per-device identity — rather than a boolean.
 */
export async function findSeekerGenesisToken(owner: string): Promise<string | null> {
  const mainnet = new Connection(MAINNET_RPC, "confirmed");
  const { value } = await mainnet.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: TOKEN_2022 });
  const mints = value
    .map((account) => account.account.data.parsed.info as { mint: string; tokenAmount: { amount: string; decimals: number } })
    .filter((info) => info.tokenAmount.amount !== "0" && info.tokenAmount.decimals === 0)
    .map((info) => new PublicKey(info.mint));
  for (let k = 0; k < mints.length; k += 100) {
    const infos = await mainnet.getMultipleParsedAccounts(mints.slice(k, k + 100));
    for (let j = 0; j < infos.value.length; j++) {
      const data = infos.value[j]?.data as { parsed?: { info?: { extensions?: MintExtension[] } } } | undefined;
      const extensions = data?.parsed?.info?.extensions ?? [];
      const pointer = extensions.find((e) => e.extension === "metadataPointer")?.state?.metadataAddress;
      const group = extensions.find((e) => e.extension === "tokenGroupMember")?.state?.group;
      if (pointer === SGT_GROUP && group === SGT_GROUP) return mints[k + j]!.toBase58();
    }
  }
  return null;
}
