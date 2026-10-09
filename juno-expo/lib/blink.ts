import { PublicKey } from '@solana/web3.js';

// Existing devnet Actions deployment, checked read-only during the takeover.
// Set an empty string to disable sharing Actions, or override with your own HTTPS host.
export const ACTIONS_URL = process.env.EXPO_PUBLIC_ACTIONS_URL ?? 'https://juno-actions.vercel.app';

/** The app keeps ordinary post links usable when an Actions host is not configured. */
export function coinBlink(mint: string, actionsHost: string | undefined, kind: 'buy' | 'boost' = 'buy'): string | null {
  if (!actionsHost) return null;
  try {
    new PublicKey(mint);
    const host = new URL(actionsHost);
    if (host.protocol !== 'https:' || host.username || host.password) return null;
    const action = new URL(`/api/actions/${kind}`, host.origin);
    action.searchParams.set(kind === 'boost' ? 'post' : 'mint', mint);
    return `https://dial.to/?action=${encodeURIComponent(`solana-action:${action.href}`)}&cluster=devnet`;
  } catch { return null; }
}
