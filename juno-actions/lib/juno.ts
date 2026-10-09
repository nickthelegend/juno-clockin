import { PublicKey } from "@solana/web3.js";

import { swapRequestBody } from "../shared/txbuild";

/**
 * The Juno API (the same deployed devnet API the app talks to). Buys are built
 * by its `/api/juno/tx/swap`, exactly as the app's trade sheet asks for them,
 * so a Blink buy and an in-app buy are the same Meteora DBC transaction.
 */
export const JUNO_API = (process.env.JUNO_API_URL || "https://juno-web-production-bd2e.up.railway.app").replace(/\/$/, "");
export const APP_URL = "https://juno-app-chi.vercel.app";

export type CoinInfo = {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  creator: { wallet: string; handle: string };
  media: { kind: "image" | "video"; url: string; posterUrl?: string };
  marketCap: number;
  quote: { mint: string; symbol: string; decimals: number };
  curve: { progress: number; graduated: boolean };
};

async function getJson<T>(path: string, init: RequestInit = {}, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${JUNO_API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !body) throw new Error(body?.error ?? `Juno API ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; coin: CoinInfo }>();

export function isMint(value: string | undefined): value is string {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/** One coin (a post), cached for a minute per warm function. */
export async function getCoin(mint: string): Promise<CoinInfo> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 60_000) return hit.coin;
  const { coin } = await getJson<{ coin: CoinInfo }>(`/api/juno/coins/${mint}`);
  cache.set(mint, { at: Date.now(), coin });
  return coin;
}

/** An absolute image URL for the Blink card: the post's poster, or the Juno icon. */
export function coinImage(coin: CoinInfo | null, fallback: string): string {
  const path = coin ? (coin.media.posterUrl ?? (coin.media.kind === "image" ? coin.media.url : null)) : null;
  if (!path) return fallback;
  return path.startsWith("http") ? path : `${JUNO_API}${path}`;
}

/** The unsigned buy, from the same builder and request body the app uses. */
export async function buildBuy(mint: string, owner: string, amountIn: number): Promise<{ transaction: string; amountOut: number; symbol: string; quoteSymbol: string }> {
  const built = await getJson<{
    unsigned: { transaction: string };
    quote: { amountOut: number };
    symbol: string;
    quoteSymbol: string;
  }>(
    "/api/juno/tx/swap",
    { method: "POST", body: JSON.stringify(swapRequestBody({ mint, owner, side: "buy", amountIn })) },
    20_000,
  );
  return { transaction: built.unsigned.transaction, amountOut: built.quote.amountOut, symbol: built.symbol, quoteSymbol: built.quoteSymbol };
}
