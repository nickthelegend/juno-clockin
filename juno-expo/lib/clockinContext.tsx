import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";

import { juno } from "./api";
import {
  boost as sendBoost,
  clockIn as sendClockIn,
  findSeekerGenesisToken,
  readBoosts,
  readClockIns,
  rewardFor,
  type BoostTotals,
  type ClockInResult,
  type ClockInState,
} from "./clockin";
import { afterClockIn, enableReminders, streakAtRisk } from "./reminders";
import { skrAuthority, SKR_DEVNET_MINT, solBalance, tokenBalance } from "./solana";
import { useWallet } from "./wallet";

/**
 * Everything the daily loop needs, shared by the feed, the coin page and the
 * profile so they agree on one streak and one SKR balance.
 */

type Loadable<T> = { data: T | null; loading: boolean; error: string | null };

export type ClockInContext = {
  state: Loadable<ClockInState>;
  skr: number | null;
  sol: number | null;
  /** The Seeker Genesis Token mint when this wallet holds one (mainnet read), else null. */
  seekerMint: string | null;
  seekerChecked: boolean;
  boosts: BoostTotals;
  /** Whether this build can mint SKR rewards (the devnet authority is baked in). */
  rewardsEnabled: boolean;
  /** The reward the next clock-in pays. */
  nextReward: number;
  busy: "funding" | "signing" | null;
  lastResult: ClockInResult | null;
  refresh: () => Promise<void>;
  /** Resolves null when it only connected a wallet: the next tap clocks in. */
  clockIn: () => Promise<ClockInResult | null>;
  boost: (input: { coinMint: string; creator: string; amount: number }) => Promise<string>;
};

const Context = createContext<ClockInContext | null>(null);

const MIN_SOL_FOR_CLOCKIN = 0.003;

export function ClockInProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const [state, setState] = useState<Loadable<ClockInState>>({ data: null, loading: false, error: null });
  const [skr, setSkr] = useState<number | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [seekerMint, setSeekerMint] = useState<string | null>(null);
  const [seekerChecked, setSeekerChecked] = useState(false);
  const [boosts, setBoosts] = useState<BoostTotals>(new Map());
  const [busy, setBusy] = useState<ClockInContext["busy"]>(null);
  const [lastResult, setLastResult] = useState<ClockInResult | null>(null);
  const address = wallet.address;
  const generation = useRef(0);
  const clockInLock = useRef(false);

  const refresh = useCallback(async () => {
    const mine = ++generation.current;
    readBoosts()
      .then((totals) => mine === generation.current && setBoosts(totals))
      .catch(() => undefined);
    if (!address) {
      setState({ data: null, loading: false, error: null });
      setSkr(null);
      setSol(null);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [clockins, skrNow, solNow] = await Promise.all([
        readClockIns(address),
        tokenBalance(address, SKR_DEVNET_MINT),
        solBalance(address),
      ]);
      if (mine !== generation.current) return;
      setState({ data: clockins, loading: false, error: null });
      setSkr(skrNow);
      setSol(solNow);
      if (!clockins.clockedToday) void streakAtRisk(clockins.streak);
    } catch (error) {
      if (mine !== generation.current) return;
      setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  }, [address]);

  useEffect(() => {
    setLastResult(null);
    void refresh();
  }, [refresh]);

  // Seeker check: a read-only mainnet lookup, once per wallet.
  useEffect(() => {
    setSeekerMint(null);
    setSeekerChecked(false);
    if (!address) return;
    let cancelled = false;
    findSeekerGenesisToken(address)
      .then((mint) => !cancelled && setSeekerMint(mint))
      .catch(() => undefined)
      .finally(() => !cancelled && setSeekerChecked(true));
    return () => {
      cancelled = true;
    };
  }, [address]);

  const nextReward = rewardFor((state.data?.streak ?? 0) + 1, Boolean(seekerMint));

  const clockIn = useCallback(async () => {
    if (!address) {
      await wallet.connect();
      return null;
    }
    if(clockInLock.current)throw new Error("A clock-in is already in progress.");
    clockInLock.current=true;
    const target = address;
    try {
      const current = state.data ?? (await readClockIns(target));
      // A brand-new wallet has no SOL for the fee: fund it from Juno's devnet faucet first.
      const balance = await solBalance(target);
      if (balance !== null && balance < MIN_SOL_FOR_CLOCKIN) {
        setBusy("funding");
        await juno.faucet(target);
      }
      setBusy("signing");
      const result = await sendClockIn(wallet, current, { seeker: Boolean(seekerMint) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setLastResult(result);
      void enableReminders().then((ok) => { if (ok) void afterClockIn(result.streak, rewardFor(result.streak + 1, Boolean(seekerMint))); });
      // Optimistic: the RPC's signature index can trail a confirmed transaction by a few seconds.
      setState((s) =>
        s.data
          ? {
              ...s,
              data: {
                ...s.data,
                clockedToday: true,
                streak: result.streak,
                total: s.data.total + 1,
                best: Math.max(s.data.best, result.streak),
              },
            }
          : s,
      );
      if (result.rewarded) setSkr((value) => (value === null ? null : value + result.reward));
      setTimeout(() => void refresh(), 4000);
      return result;
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      throw error;
    } finally {
      clockInLock.current=false;
      setBusy(null);
    }
  }, [address, wallet, state.data, seekerMint, refresh]);

  const boost = useCallback(
    async (input: { coinMint: string; creator: string; amount: number }) => {
      const signature = await sendBoost(wallet, input);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setSkr((value) => (value === null ? null : Math.max(0, value - input.amount)));
      setBoosts((totals) => {
        const next = new Map(totals);
        const entry = next.get(input.coinMint) ?? { amount: 0, count: 0, unverified: 0 };
        next.set(input.coinMint, { ...entry, amount: entry.amount + input.amount, count: entry.count + 1 });
        return next;
      });
      setTimeout(() => void refresh(), 5000);
      return signature;
    },
    [wallet, refresh],
  );

  const value = useMemo<ClockInContext>(
    () => ({
      state,
      skr,
      sol,
      seekerMint,
      seekerChecked,
      boosts,
      rewardsEnabled: skrAuthority() !== null,
      nextReward,
      busy,
      lastResult,
      refresh,
      clockIn,
      boost,
    }),
    [state, skr, sol, seekerMint, seekerChecked, boosts, nextReward, busy, lastResult, refresh, clockIn, boost],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useClockIn(): ClockInContext {
  const context = useContext(Context);
  if (!context) throw new Error("useClockIn must be used inside a ClockInProvider");
  return context;
}
