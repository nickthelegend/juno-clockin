import { PublicKey, Transaction } from "@solana/web3.js";

import {
  associatedTokenAddress,
  createAtaIdempotent,
  memo,
  SKR_DECIMALS,
  SKR_DEVNET_MINT,
  SKR_TREASURY_OWNER,
  toBaseUnits,
  transferChecked,
} from "./solana";

/**
 * Transaction builders shared by the app and the Juno Blinks (`juno-actions/`).
 *
 * Pure: no React Native, no wallet, no network. The Blinks server vendors this
 * file and `solana.ts` byte-for-byte (`npm run sync` in juno-actions, checked
 * by a test), so a boost or a buy started from a Blink is the same
 * transaction the app would have built.
 */

export const BOOST_PREFIX = "juno:boost:v1:";
/** Share of a boost paid to the post's creator; the rest refills the reward treasury. */
export const BOOST_CREATOR_PCT = 80n;

export function treasuryAccount(): PublicKey {
  return associatedTokenAddress(SKR_TREASURY_OWNER, SKR_DEVNET_MINT);
}

/** The split of a boost, in base units: creator 80%, treasury the rest. */
export function boostSplit(amount: number): { total: bigint; toCreator: bigint; toTreasury: bigint } {
  const total = toBaseUnits(amount);
  const toCreator = (total * BOOST_CREATOR_PCT) / 100n;
  return { total, toCreator, toTreasury: total - toCreator };
}

/**
 * A dSKR boost: memo `juno:boost:v1:<coin>:<amount>`, then 80% to the
 * creator (creating their token account if needed) and 20% to the treasury.
 * Boosting your own post pays it all to the treasury.
 */
export function buildBoostTransaction(input: {
  user: PublicKey;
  creator: PublicKey;
  coinMint: string;
  amount: number;
  blockhash: string;
  lastValidBlockHeight: number;
}): Transaction {
  const { user, creator, coinMint, amount } = input;
  const source = associatedTokenAddress(user, SKR_DEVNET_MINT);
  const { total, toCreator, toTreasury } = boostSplit(amount);
  const transaction = new Transaction({
    feePayer: user,
    blockhash: input.blockhash,
    lastValidBlockHeight: input.lastValidBlockHeight,
  });
  transaction.add(memo(`${BOOST_PREFIX}${coinMint}:${amount}`, user));
  if (!creator.equals(user)) {
    transaction.add(
      createAtaIdempotent(user, creator, SKR_DEVNET_MINT),
      transferChecked(source, SKR_DEVNET_MINT, associatedTokenAddress(creator, SKR_DEVNET_MINT), user, toCreator, SKR_DECIMALS),
      transferChecked(source, SKR_DEVNET_MINT, treasuryAccount(), user, toTreasury, SKR_DECIMALS),
    );
  } else {
    transaction.add(transferChecked(source, SKR_DEVNET_MINT, treasuryAccount(), user, total, SKR_DECIMALS));
  }
  return transaction;
}

/** What the Juno API's `/api/juno/tx/swap` builder is asked for a buy. */
export type SwapRequest = {
  mint: string;
  owner: string;
  side: "buy" | "sell";
  amountIn?: number;
  amountOut?: number;
  slippageBps?: number;
};

/** The swap request body, built one way for the app's trade sheet and for the buy Blink. */
export function swapRequestBody(input: SwapRequest): SwapRequest {
  const body: SwapRequest = { mint: input.mint, owner: input.owner, side: input.side };
  if (input.amountOut !== undefined) body.amountOut = input.amountOut;
  else body.amountIn = input.amountIn;
  if (input.slippageBps !== undefined) body.slippageBps = input.slippageBps;
  return body;
}
