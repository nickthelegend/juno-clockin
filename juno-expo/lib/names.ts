import { useEffect, useState } from "react";

import { api } from "./api";

/**
 * Names for wallets, read in batches and remembered.
 *
 * Every card, reel, comment and ranking shows a person. Asking the server one
 * wallet at a time would be a request per row; instead the wallets a screen
 * asks about in the same tick are collected into one request, and the answer
 * is kept for the session. A wallet with no name is remembered as having
 * none, so it is not asked about again on every render.
 */
const known = new Map<string, string | null>();
const listeners = new Map<string, Set<(name: string | null) => void>>();
let queue = new Set<string>();
let scheduled = false;

function flush() {
  scheduled = false;
  const batch = [...queue];
  queue = new Set();
  if (batch.length === 0) return;
  api
    .get<{ names: Record<string, string> }>(`/api/juno/profiles?wallets=${batch.join(",")}`)
    .then(({ names }) => {
      for (const wallet of batch) publish(wallet, names[wallet] ?? null);
    })
    // A failed read leaves these unknown, so a later screen can ask again.
    .catch(() => undefined);
}

function publish(wallet: string, name: string | null) {
  known.set(wallet, name);
  listeners.get(wallet)?.forEach((listener) => listener(name));
}

function request(wallet: string) {
  if (known.has(wallet) || queue.has(wallet)) return;
  queue.add(wallet);
  // A microtask, not a timer: every effect in one render commit runs before
  // it, so a whole screen's wallets still go in one request — and it is not
  // subject to the throttling browsers apply to timers in background tabs.
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

/** After a successful claim, so every row showing this wallet updates at once. */
export function rememberName(wallet: string, name: string) {
  publish(wallet, name);
}

/** The short form of an address, for anyone without a name. */
export function shortAddress(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

const ADJ = ["lime", "quiet", "brave", "sunny", "swift", "lucky", "bold", "calm", "neon", "wild", "mellow", "keen"];
const NOUN = ["otter", "falcon", "panda", "comet", "maple", "tiger", "koala", "heron", "lynx", "orca", "fox", "wren"];

/** A stable, readable alias for a wallet with no name, so the UI never prints base58 as a person. */
export function aliasFor(wallet: string): string {
  let h = 2166136261;
  for (let i = 0; i < wallet.length; i += 1) {
    h ^= wallet.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = h >>> 0;
  return `${ADJ[n % ADJ.length]}${NOUN[(n >>> 8) % NOUN.length]}`;
}

/** Seeded demo accounts carry a `demo_` prefix in the registry; people never see it. */
export function cleanName(name: string | null): string | null {
  return name ? name.replace(/^demo[_-]/i, "") : name;
}

/** This wallet's name, or null while unknown or when it has none. */
export function useName(wallet: string | null | undefined): string | null {
  const [name, setName] = useState<string | null>(wallet ? (known.get(wallet) ?? null) : null);

  useEffect(() => {
    if (!wallet) {
      setName(null);
      return;
    }
    setName(known.get(wallet) ?? null);
    const set = listeners.get(wallet) ?? new Set();
    set.add(setName);
    listeners.set(wallet, set);
    request(wallet);
    return () => {
      set.delete(setName);
    };
  }, [wallet]);

  return cleanName(name);
}

/** What to print for a person: their name, or a stable alias (never the address). */
export function useHandle(wallet: string | null | undefined): string {
  const name = useName(wallet);
  if (!wallet) return "";
  return name ?? aliasFor(wallet);
}
