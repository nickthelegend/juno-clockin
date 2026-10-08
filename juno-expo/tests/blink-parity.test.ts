import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import * as appSolana from "../lib/solana";
import * as appTx from "../lib/txbuild";
import * as blinkTx from "../../juno-actions/shared/txbuild";

/**
 * A Blink must build the same transaction the app builds. The Blinks server
 * (juno-actions/) vendors the app's builders; these tests fail if the copies
 * drift or if the boost layout changes.
 */
const root = join(__dirname, "..", "..");

describe("Blink and app share one transaction builder", () => {
  it("vendors solana.ts and txbuild.ts byte for byte", () => {
    for (const file of ["solana.ts", "txbuild.ts"]) {
      expect(readFileSync(join(root, "juno-actions/shared", file), "utf8")).toBe(
        readFileSync(join(root, "juno-expo/lib", file), "utf8"),
      );
    }
  });

  const user = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey;
  const creator = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey;
  const input = {
    user,
    creator,
    coinMint: "Ag79NjwC4wEM5hoxW8AasAjjwiphRyZqP7BQyqd8tiD3",
    amount: 5,
    blockhash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1aaaaaaaaaaaa",
    lastValidBlockHeight: 100,
  };

  it("builds a byte-identical boost from the app and from the Blink", () => {
    const fromApp = appTx.buildBoostTransaction(input).serializeMessage().toString("base64");
    const fromBlink = blinkTx.buildBoostTransaction(input).serializeMessage().toString("base64");
    expect(fromBlink).toBe(fromApp);
  });

  it("pays 80% to the creator and 20% to the treasury, after a memo", () => {
    const tx = appTx.buildBoostTransaction(input);
    expect(tx.feePayer?.equals(user)).toBe(true);
    const [memoIx, ataIx, toCreator, toTreasury] = tx.instructions;
    expect(memoIx!.programId.equals(appSolana.MEMO_PROGRAM_ID)).toBe(true);
    expect(memoIx!.data.toString("utf8")).toBe(`juno:boost:v1:${input.coinMint}:5`);
    expect(ataIx!.programId.equals(appSolana.ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    const amountOf = (data: Buffer) => data.readBigUInt64LE(1);
    expect(toCreator!.data[0]).toBe(12); // TransferChecked
    expect(amountOf(toCreator!.data)).toBe(4_000_000n);
    expect(amountOf(toTreasury!.data)).toBe(1_000_000n);
    expect(toCreator!.keys[2]!.pubkey.equals(appSolana.associatedTokenAddress(creator, appSolana.SKR_DEVNET_MINT))).toBe(true);
    expect(toTreasury!.keys[2]!.pubkey.equals(appTx.treasuryAccount())).toBe(true);
  });

  it("sends a self-boost entirely to the treasury", () => {
    const tx = appTx.buildBoostTransaction({ ...input, creator: user });
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[1]!.data.readBigUInt64LE(1)).toBe(5_000_000n);
  });

  it("asks the Juno API for a buy with the same body from the app and the Blink", () => {
    const owner = new PublicKey(user).toBase58();
    const req = { mint: input.coinMint, owner, side: "buy" as const, amountIn: 0.01 };
    expect(blinkTx.swapRequestBody(req)).toEqual(appTx.swapRequestBody(req));
    expect(appTx.swapRequestBody(req)).toEqual({ mint: input.coinMint, owner, side: "buy", amountIn: 0.01 });
    expect(appTx.swapRequestBody({ ...req, amountOut: 1000 })).toEqual({ mint: input.coinMint, owner, side: "buy", amountOut: 1000 });
  });
});
