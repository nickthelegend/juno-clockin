import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, associatedTokenAddress, TOKEN_PROGRAM_ID } from "./solana";

/**
 * The clock-in reward, paid on chain with no key in this app.
 *
 * The CLOCK IN rewards program (deployed on devnet for the XORV app, `check_in`) owns its tSKR mint through a PDA, so it
 * mints the reward itself: the user signs, the program pays. tSKR is a devnet stand-in for SKR and is labelled so; it is
 * a separate token from Juno's dSKR (boosts keep using dSKR).
 */
export const REWARDS_PROGRAM_ID = new PublicKey("GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw");
export const REWARD_SHORT = "tSKR";
export const REWARD_DECIMALS = 6;

const CONFIG = PublicKey.findProgramAddressSync([Buffer.from("config")], REWARDS_PROGRAM_ID)[0];
export const REWARD_MINT = PublicKey.findProgramAddressSync([Buffer.from("skr-mint")], REWARDS_PROGRAM_ID)[0];
const statsOf = (user: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("user"), user.toBuffer()], REWARDS_PROGRAM_ID)[0];

// Anchor discriminator of `check_in` (sha256("global:check_in")[0..8]).
const CHECK_IN = Buffer.from([209, 253, 4, 217, 250, 241, 207, 50]);
const MAX_MULTIPLIER = 7;

export function rewardCheckIn(user: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: REWARDS_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: CONFIG, isSigner: false, isWritable: false },
      { pubkey: REWARD_MINT, isSigner: false, isWritable: true },
      { pubkey: statsOf(user), isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(user, REWARD_MINT), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: CHECK_IN,
  });
}

/** What today's reward would be (from the program's own config and this wallet's record), or null if already paid today. */
export async function rewardQuote(user: PublicKey, connection: Connection): Promise<number | null> {
  const [cfg, stats] = await connection.getMultipleAccountsInfo([CONFIG, statsOf(user)], "confirmed");
  if (!cfg || !cfg.owner.equals(REWARDS_PROGRAM_ID)) return null;
  // Config: disc 8 | admin 32 | mint 32 | daily_reward u64 | min_bond u64 | slash_bps u16 | job_timeout i64 | day_length i64
  const dailyReward = Number(cfg.data.readBigUInt64LE(72));
  const dayLength = Number(cfg.data.readBigInt64LE(98));
  const day = Math.floor(Date.now() / 1000 / dayLength);
  let streak = 1;
  if (stats && stats.data.length >= 60) {
    // UserStats: disc 8 | wallet 32 | streak u32 | best u32 | last_day i64 | checkins u32
    const prevStreak = stats.data.readUInt32LE(40);
    const lastDay = Number(stats.data.readBigInt64LE(48));
    const checkins = stats.data.readUInt32LE(56);
    if (checkins > 0 && day <= lastDay) return null;
    streak = checkins > 0 && day === lastDay + 1 ? prevStreak + 1 : 1;
  }
  return (dailyReward * Math.min(streak, MAX_MULTIPLIER)) / 10 ** REWARD_DECIMALS;
}

/** True when the transaction simulates cleanly (signatures are not checked), so a reward can never sink a clock-in. */
export async function simulatesClean(feePayer: PublicKey, instructions: TransactionInstruction[], connection: Connection): Promise<boolean> {
  try {
    // A throwaway copy: web3.js refreshes the blockhash of the transaction it simulates.
    const { value } = await connection.simulateTransaction(new Transaction({ feePayer }).add(...instructions));
    return value.err === null;
  } catch {
    return false;
  }
}

/** The reward actually minted by a confirmed clock-in, read from the transaction's own token balances. */
export async function mintedReward(signature: string, owner: PublicKey, connection: Connection): Promise<number | null> {
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
  if (!tx?.meta) return null;
  const mint = REWARD_MINT.toBase58();
  const who = owner.toBase58();
  const amount = (list: typeof tx.meta.postTokenBalances) =>
    Number(list?.find((b) => b.mint === mint && b.owner === who)?.uiTokenAmount.uiAmount ?? 0);
  const delta = amount(tx.meta.postTokenBalances) - amount(tx.meta.preTokenBalances);
  return delta > 0 ? Math.round(delta * 100) / 100 : null;
}
