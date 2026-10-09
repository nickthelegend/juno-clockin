import { Connection, PublicKey } from "@solana/web3.js";

import { type Req, type Res, RPC, origin, parseBody, q, send } from "../../lib/http";
import { APP_URL, coinImage, getCoin, isMint, type CoinInfo } from "../../lib/juno";
import { associatedTokenAddress, SKR_DEVNET_MINT, SKR_LABEL } from "../../shared/solana";
import { buildBoostTransaction } from "../../shared/txbuild";

/**
 * "Boost this post with dSKR" (devnet). The same transaction as the app's
 * boost: a memo, 80% to the creator and 20% to the treasury that pays daily
 * clock-in rewards. dSKR is Juno's devnet stand-in for SKR.
 */
const AMOUNTS = [5, 10, 25];

export function createBoostHandler({ readCoin = getCoin, connect = (rpc: string) => new Connection(rpc, "confirmed") }: {
  readCoin?: typeof getCoin;
  connect?: (rpc: string) => Pick<Connection, 'getTokenAccountBalance' | 'getLatestBlockhash'>;
} = {}) {
return async function handler(req: Req, res: Res) {
  if (req.method === "OPTIONS") return send(res, 200);
  const mint = q(req, "post") ?? q(req, "mint");
  if (!isMint(mint)) return send(res, 400, { message: "Add ?post=<a Juno post's coin address>" });
  const base = `${origin(req)}/api/actions/boost?post=${mint}`;

  if (req.method === "GET") {
    let coin: CoinInfo | null = null;
    try {
      coin = await readCoin(mint);
    } catch {
      coin = null;
    }
    return send(res, 200, {
      type: "action",
      icon: coinImage(coin, `${origin(req)}/icon.png`),
      title: coin ? `Boost ${coin.name} on Juno` : "Boost a Juno post",
      description: `Back this post with ${SKR_LABEL}: 80% goes to the creator, 20% refills the daily clock-in reward treasury. Boosted posts lead the Juno feed. Earn dSKR by clocking in on Juno. Solana devnet.`,
      label: "Boost",
      links: {
        actions: [
          ...AMOUNTS.map((amount) => ({ type: "transaction", label: `${amount} dSKR`, href: `${base}&amount=${amount}` })),
          { type: "external-link", label: "Open in Juno", href: `${APP_URL}/coin/${mint}` },
        ],
      },
    });
  }

  if (req.method !== "POST") return send(res, 405, { message: "GET or POST" });
  try {
    const body = parseBody(req.body);
    let user: PublicKey;
    try {
      user = new PublicKey(typeof body?.account === "string" ? body.account : "");
    } catch {
      return send(res, 400, { message: "Missing or invalid account" });
    }
    const amount = Number(q(req, "amount"));
    if (!AMOUNTS.includes(amount)) return send(res, 400, { message: `Boost ${AMOUNTS.join(", ")} dSKR` });

    const coin = await readCoin(mint);
    const connection = connect(RPC);
    // A boost from a wallet without enough dSKR would only fail in the wallet; say why here instead.
    const balance = await connection
      .getTokenAccountBalance(associatedTokenAddress(user, SKR_DEVNET_MINT))
      .then((r) => r.value.uiAmount ?? 0)
      .catch((error: unknown) => {
        // A missing ATA is an empty balance; a failed RPC read is unknown.
        if (error instanceof Error && /could not find account|account not found|invalid param.*account/i.test(error.message)) return 0;
        throw new Error("Could not read this wallet's dSKR balance. Try again shortly.");
      });
    if (balance < amount) {
      return send(res, 422, { message: `This wallet has ${balance} dSKR. Clock in daily on Juno to earn dSKR, then boost.` });
    }
    const window = await connection.getLatestBlockhash("confirmed");
    const transaction = buildBoostTransaction({
      user,
      creator: new PublicKey(coin.creator.wallet),
      coinMint: mint,
      amount,
      ...window,
    });
    return send(res, 200, {
      type: "transaction",
      transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      message: user.equals(new PublicKey(coin.creator.wallet))
        ? `Boosting your own ${coin.name} with ${amount} dSKR (devnet): the whole amount goes to the reward treasury.`
        : `Boosting ${coin.name} with ${amount} dSKR (devnet): ${amount * 0.8} to the creator, ${amount * 0.2} to the treasury.`,
    });
  } catch (error) {
    return send(res, 400, { message: error instanceof Error ? error.message : "Could not build the boost" });
  }
}

}

export default createBoostHandler();
