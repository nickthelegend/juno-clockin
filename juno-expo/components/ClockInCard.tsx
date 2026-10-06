import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { dayKey, previousDay } from "../lib/clockin";
import { useClockIn } from "../lib/clockinContext";
import { explorerTx, SKR_LABEL, SKR_SHORT } from "../lib/solana";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";

/**
 * The daily clock-in: the reason to open Juno every day.
 *
 * One tap signs a devnet transaction that records today on-chain and pays the
 * day's SKR. The streak above the button is read back from the wallet's own
 * transaction history, so the number is the chain's, not the app's.
 */
export function ClockInCard({ compact = false }: { compact?: boolean }) {
  const wallet = useWallet();
  const daily = useClockIn();
  const [error, setError] = useState<string | null>(null);
  const pop = useRef(new Animated.Value(1)).current;

  const data = daily.state.data;
  const streak = data?.streak ?? 0;
  const clocked = data?.clockedToday ?? false;
  const result = daily.lastResult;

  useEffect(() => {
    if (!result) return;
    pop.setValue(0.85);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [result, pop]);

  // The last seven days, oldest first, for the week strip.
  const days: string[] = [];
  let cursor = dayKey();
  for (let i = 0; i < 7; i++) {
    days.unshift(cursor);
    cursor = previousDay(cursor);
  }
  const done = new Set(data?.entries.map((entry) => entry.day) ?? []);
  if (clocked) done.add(dayKey());

  const press = async () => {
    setError(null);
    try {
      await daily.clockIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const label = !wallet.address
    ? "Connect wallet to clock in"
    : daily.busy === "funding"
      ? "Getting devnet SOL for the fee…"
      : daily.busy === "signing"
        ? wallet.mode === "mwa"
          ? "Approve in your wallet…"
          : "Signing on devnet…"
        : clocked
          ? `Clocked in · back tomorrow for +${daily.nextReward}`
          : daily.rewardsEnabled
            ? `Clock in · +${daily.nextReward} ${SKR_SHORT}`
            : "Clock in on-chain";

  return (
    <View style={[styles.card, compact ? styles.compact : null]} accessibilityLabel="Daily clock-in">
      <View style={styles.top}>
        <Text style={styles.kicker}>DAILY CLOCK-IN</Text>
        <SeekerBadge mint={daily.seekerMint} checked={daily.seekerChecked} connected={Boolean(wallet.address)} />
      </View>

      <View style={styles.hero}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Flame lit={streak > 0} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.streak}>
            {!wallet.address
              ? "Start a streak"
              : daily.state.loading && !data
                ? "…"
                : streak === 0
                  ? "No streak yet"
                  : `${streak}-day streak`}
          </Text>
          <Text style={styles.sub}>
            {!wallet.address
              ? `Clock in once a day to earn ${SKR_SHORT}. Your streak lives on Solana.`
              : data
                ? `Best ${data.best} · ${data.total} ${data.total === 1 ? "day" : "days"} on-chain`
                : daily.state.error
                  ? "Could not read your history from devnet"
                  : "Reading your history from devnet…"}
          </Text>
        </View>
        {wallet.address ? (
          <View style={styles.balance}>
            <Text style={styles.balanceValue}>{daily.skr === null ? "—" : formatSkr(daily.skr)}</Text>
            <Text style={styles.balanceUnit}>{SKR_SHORT}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.week}>
        {days.map((day) => {
          const on = done.has(day);
          const today = day === dayKey();
          return (
            <View key={day} style={styles.dayCol}>
              <View style={[styles.dot, on ? styles.dotOn : null, today && !on ? styles.dotToday : null]}>
                {on ? <Text style={styles.tick}>✓</Text> : null}
              </View>
              <Text style={[styles.dayLabel, today ? styles.dayLabelToday : null]}>
                {today ? "Today" : weekday(day)}
              </Text>
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={clocked || daily.busy ? undefined : () => void press()}
        accessibilityRole="button"
        accessibilityState={{ disabled: clocked || daily.busy !== null, busy: daily.busy !== null }}
        style={({ pressed }) => [
          styles.button,
          clocked ? styles.buttonDone : null,
          { transform: [{ scale: pressed && !clocked ? 0.97 : 1 }] },
        ]}
      >
        {daily.busy ? <ActivityIndicator color={theme.colors.onLime} style={{ marginRight: 8 }} /> : null}
        <Text style={[styles.buttonText, clocked ? styles.buttonTextDone : null]}>{label}</Text>
      </Pressable>

      {result ? (
        <Text style={styles.result} onPress={() => void Linking.openURL(explorerTx(result.signature))}>
          {result.rewarded ? `+${result.reward} ${SKR_SHORT} minted · ` : "Recorded · "}
          <Text style={styles.link}>view transaction</Text>
        </Text>
      ) : clocked && data?.entries[0] ? (
        <Text style={styles.result} onPress={() => void Linking.openURL(explorerTx(data.entries[0]!.signature))}>
          Today is on-chain · <Text style={styles.link}>view transaction</Text>
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!compact ? (
        <Text style={styles.fine}>
          {daily.rewardsEnabled
            ? `Rewards are ${SKR_LABEL}: 10 on day one, +5 a day to 40. Seeker owners earn double. Spend them boosting posts.`
            : "This build records clock-ins on-chain but has no devnet reward key, so it mints no SKR."}
        </Text>
      ) : null}
    </View>
  );
}

function SeekerBadge({ mint, checked, connected }: { mint: string | null; checked: boolean; connected: boolean }) {
  if (!connected) return null;
  if (mint) {
    return (
      <View style={[styles.badge, styles.badgeOn]}>
        <Text style={[styles.badgeText, { color: theme.colors.onLime }]}>Seeker verified · 2x</Text>
      </View>
    );
  }
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{checked ? "2x on Seeker" : "Checking Seeker…"}</Text>
    </View>
  );
}

function Flame({ lit }: { lit: boolean }) {
  return (
    <View style={[styles.flame, lit ? styles.flameLit : null]}>
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path
          d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.4 2.5 1.6 0 2.6-1.3 2.3-3.3C17.6 10.5 19 13 19 15.5 19 19.1 15.9 22 12 22s-7-2.9-7-6.5c0-4.6 4.1-6.6 7-13.5z"
          fill={lit ? theme.colors.ink : "rgba(255,255,255,0.35)"}
        />
      </Svg>
    </View>
  );
}

function weekday(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(y!, m! - 1, d!).getDay()]!;
}

export function formatSkr(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    padding: 18,
    gap: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.ink,
    ...theme.shadow.raised,
  },
  compact: { marginHorizontal: 0, marginTop: 0, marginBottom: 0 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "800", color: theme.colors.lime },
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  flame: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  flameLit: { backgroundColor: theme.colors.lime },
  streak: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.onInk, letterSpacing: -0.4 },
  sub: { fontSize: theme.type.caption.size, lineHeight: 16, color: "rgba(243,247,238,0.66)", marginTop: 2 },
  balance: { alignItems: "flex-end" },
  balanceValue: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.lime, fontVariant: ["tabular-nums"] },
  balanceUnit: { fontSize: 11, fontWeight: "700", color: "rgba(243,247,238,0.66)" },
  week: { flexDirection: "row", justifyContent: "space-between" },
  dayCol: { alignItems: "center", gap: 5, width: 40 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dotOn: { backgroundColor: theme.colors.lime },
  dotToday: { borderWidth: 1.5, borderColor: theme.colors.lime, borderStyle: "dashed" },
  tick: { fontSize: 14, fontWeight: "900", color: theme.colors.onLime },
  dayLabel: { fontSize: 10, fontWeight: "600", color: "rgba(243,247,238,0.5)" },
  dayLabelToday: { color: theme.colors.lime },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.lime,
    paddingHorizontal: 16,
  },
  buttonDone: { backgroundColor: "rgba(255,255,255,0.1)" },
  buttonText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onLime },
  buttonTextDone: { color: theme.colors.onInk },
  result: { fontSize: theme.type.caption.size, color: "rgba(243,247,238,0.75)", textAlign: "center" },
  link: { color: theme.colors.lime, fontWeight: "700" },
  error: { fontSize: theme.type.caption.size, color: "#FF8A80", textAlign: "center" },
  fine: { fontSize: 11, lineHeight: 15, color: "rgba(243,247,238,0.5)" },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  badgeOn: { backgroundColor: theme.colors.lime },
  badgeText: { fontSize: 10, fontWeight: "700", color: "rgba(243,247,238,0.8)" },
});
