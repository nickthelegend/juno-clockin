import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

/**
 * Direct devnet access, for the CLOCK IN features.
 *
 * Markets, trades and launches still go through the Juno API, which builds
 * every DBC transaction server-side. The daily clock-in, SKR rewards and SKR
 * tips do not need a server at all: they are plain SPL Token + Memo
 * instructions, so the phone builds them, the wallet signs them, and they go
 * straight to the devnet RPC. That is also why they keep working against the
 * already-deployed API, which predates them.
 */

export const DEVNET_RPC =
  process.env.EXPO_PUBLIC_SOLANA_RPC?.trim() || "https://api.devnet.solana.com";

let shared: Connection | null = null;
export function devnet(): Connection {
  if (!shared) shared = new Connection(DEVNET_RPC, "confirmed");
  return shared;
}

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/* ------------------------------------------------------------------ */
/* SKR                                                                 */
/* ------------------------------------------------------------------ */

/**
 * SKR is the Solana Seeker token. Its real mint, on **mainnet**, is
 * `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (6 decimals; read from chain
 * on 6 Oct 2026). Juno runs on devnet, where SKR does not exist, so every
 * SKR figure in the app is a **devnet stand-in mint** with the same decimals,
 * labelled "SKR (devnet)" wherever it appears. Switching to the real token is
 * a one-line change here plus a server-held reward treasury (see HANDOFF.md).
 */
export const SKR_MAINNET_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
export const SKR_DEVNET_MINT = new PublicKey(
  process.env.EXPO_PUBLIC_SKR_DEVNET_MINT?.trim() || "dSKRJ7P98rwP8NsDQnS1CzZDrgJXpL3KjwN7N8FABHN",
);
export const SKR_DECIMALS = 6;
export const SKR_LABEL = "SKR (devnet stand-in)";
export const SKR_SHORT = "dSKR";

/**
 * The Juno treasury: owner of the account that receives the treasury share of
 * every SKR boost. On devnet it is the stand-in mint's authority, so boosts
 * literally refill the pool that pays clock-in rewards.
 */
export const SKR_TREASURY_OWNER = new PublicKey(
  process.env.EXPO_PUBLIC_SKR_TREASURY?.trim() || "3qzGPmmn4FaLZGDCmeJE7da3CfZRuhWNF3WbMPmuu3Vm",
);

/**
 * Mobile builds never carry a mint-authority private key. Clock-ins still
 * record on devnet, but token rewards remain unavailable until a genuine
 * server-owned reward integration exists. Keep the return shape for callers.
 */
export function skrAuthority(): Keypair | null {
  return null;
}

/* ------------------------------------------------------------------ */
/* Instructions, built by hand so the app needs no @solana/spl-token    */
/* ------------------------------------------------------------------ */

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** CreateIdempotent: a no-op when the account already exists. */
export function createAtaIdempotent(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  const ata = associatedTokenAddress(owner, mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/** Little-endian u64, written by hand: Hermes' Buffer polyfill is not guaranteed BigInt helpers. */
function u64(amount: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let value = amount;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

/** SPL Token MintToChecked (14). */
export function mintToChecked(
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint,
  decimals: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([14]), u64(amount), Buffer.from([decimals])]),
  });
}

/** SPL Token TransferChecked (12). */
export function transferChecked(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([12]), u64(amount), Buffer.from([decimals])]),
  });
}

export function memo(text: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, "utf8"),
  });
}

export function toBaseUnits(amount: number, decimals = SKR_DECIMALS): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/** A token balance in whole units, or null when the read failed (not zero). */
export async function tokenBalance(owner: string, mint: PublicKey): Promise<number | null> {
  try {
    const ata = associatedTokenAddress(new PublicKey(owner), mint);
    const info = await devnet().getTokenAccountBalance(ata);
    return info.value.uiAmount ?? 0;
  } catch (error) {
    // No account yet is a real zero; anything else is unknown.
    if (error instanceof Error && /could not find account|Invalid param/i.test(error.message)) return 0;
    return null;
  }
}

export async function solBalance(owner: string): Promise<number | null> {
  try {
    return (await devnet().getBalance(new PublicKey(owner))) / 1e9;
  } catch {
    return null;
  }
}

export const explorerTx = (signature: string) =>
  `https://solscan.io/tx/${signature}?cluster=devnet`;
