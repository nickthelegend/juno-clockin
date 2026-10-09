import { PublicKey } from "@solana/web3.js";

import { type Req, type Res, origin, parseBody, q, send } from "../../lib/http";
import { APP_URL, buildBuy, coinImage, getCoin, isMint, type CoinInfo } from "../../lib/juno";

/**
 * "Buy this post" (devnet). Every Juno post is its own Meteora bonding-curve
 * market; this Blink buys into it with the transaction the app builds.
 */
const AMOUNTS = [0.01, 0.05, 0.1];
const MAX = 5;

export default async function handler(req: Req, res: Res) {
  if (req.method === "OPTIONS") return send(res, 200);
  const mint = q(req, "mint");
  if (!isMint(mint)) return send(res, 400, { message: "Add ?mint=<a Juno post's coin address>" });
  const base = `${origin(req)}/api/actions/buy?mint=${mint}`;

  if (req.method === "GET") {
    let coin: CoinInfo | null = null;
    try {
      coin = await getCoin(mint);
    } catch {
      coin = null;
    }
    const unit = coin?.quote.symbol ?? "SOL";
    const graduated = coin?.curve.graduated ?? false;
    return send(res, 200, {
      type: "action",
      icon: coinImage(coin, `${origin(req)}/icon.png`),
      title: coin ? `${coin.name} ($${coin.symbol}) on Juno` : "A Juno post",
      description: coin
        ? `${coin.description ? `${coin.description} ` : ""}Every post on Juno is its own market. Buy into this one on its Meteora bonding curve. Solana devnet, no real money.`
        : "Every post on Juno is its own market. Solana devnet, no real money.",
      label: "Buy",
      disabled: !coin || graduated,
      ...(!coin ? { error: { message: "This post is unavailable from the Juno API. Try again when its market is available." } } : {}),
      ...(graduated ? { error: { message: "This curve has graduated to Meteora DAMM v2; trade it there." } } : {}),
      links: {
        actions: [
          ...AMOUNTS.map((amount) => ({ type: "transaction", label: `${amount} ${unit}`, href: `${base}&amount=${amount}` })),
          {
            type: "transaction",
            label: "Buy",
            href: `${base}&amount={amount}`,
            parameters: [{ name: "amount", label: `Amount in ${unit}`, type: "number", required: true, min: 0.001, max: MAX }],
          },
          { type: "external-link", label: "Open in Juno", href: `${APP_URL}/coin/${mint}` },
        ],
      },
    });
  }

  if (req.method !== "POST") return send(res, 405, { message: "GET or POST" });
  try {
    const body = parseBody(req.body);
    const account = typeof body?.account === "string" ? body.account : "";
    try {
      new PublicKey(account);
    } catch {
      return send(res, 400, { message: "Missing or invalid account" });
    }
    const amount = Number(q(req, "amount"));
    if (!Number.isFinite(amount) || amount < 0.001 || amount > MAX) {
      return send(res, 400, { message: `Choose an amount between 0.001 and ${MAX}` });
    }
    const built = await buildBuy(mint, account, amount);
    return send(res, 200, {
      type: "transaction",
      transaction: built.transaction,
      message: `Buying about ${Math.round(built.amountOut).toLocaleString("en-US")} $${built.symbol} for ${amount} ${built.quoteSymbol} (devnet).`,
    });
  } catch (error) {
    return send(res, 400, { message: error instanceof Error ? error.message : "Could not build the buy" });
  }
}
