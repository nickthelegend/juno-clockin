import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { BottomSheet } from "./BottomSheet";
import { ClockInCard } from "./ClockInCard";
import { useClockIn } from "../lib/clockinContext";
import { SKR_LABEL, SKR_SHORT } from "../lib/solana";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";

/**
 * The daily clock-in, sized for the top of a feed.
 *
 * The full card was a black block that owned the first screen of the feed
 * even after you had clocked in, which is most of the day. Now the feed gets
 * one slim row while there is something to do (connect, or clock in today),
 * and once today is on-chain the row collapses into a streak bubble at the
 * front of the stories strip. The full card, with the week strip and the
 * reward rules, lives one tap away in a sheet.
 */

function Flame({ size = 18, color = theme.colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.4 2.5 1.6 0 2.6-1.3 2.3-3.3C17.6 10.5 19 13 19 15.5 19 19.1 15.9 22 12 22s-7-2.9-7-6.5c0-4.6 4.1-6.6 7-13.5z"
        fill={color}
      />
    </Svg>
  );
}

/** The slim row shown while today's clock-in is still open. */
export function ClockInStrip({ onOpen }: { onOpen: () => void }) {
  const wallet = useWallet();
  const daily = useClockIn();
  const [error, setError] = useState<string | null>(null);
  const streak = daily.state.data?.streak ?? 0;

  const press = async () => {
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      await daily.clockIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const title = !wallet.address ? "Start a streak" : streak > 0 ? `${streak}-day streak` : "Day 1 is open";
  const sub = !wallet.address
    ? `Clock in daily to earn ${SKR_SHORT}`
    : streak > 0
      ? "Clock in before midnight to keep it"
      : `Clock in daily to earn ${SKR_SHORT}`;
  const cta = !wallet.address
    ? "Connect"
    : daily.busy === "funding"
      ? "Funding…"
      : daily.busy === "signing"
        ? wallet.mode === "mwa"
          ? "Approve…"
          : "Signing…"
        : daily.rewardsEnabled
          ? `Clock in · +${daily.nextReward}`
          : "Clock in";

  return (
    <View style={styles.stripWrap}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.strip, pressed ? { opacity: 0.92 } : null]}
        accessibilityRole="button"
        accessibilityLabel="Daily clock-in details"
      >
        <View style={[styles.flame, streak > 0 ? styles.flameLit : null]}>
          <Flame size={18} color={streak > 0 ? theme.colors.ink : theme.colors.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stripTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.stripSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Pressable
          onPress={daily.busy ? undefined : () => void press()}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={cta}
          style={({ pressed }) => [styles.cta, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
        >
          {daily.busy ? <ActivityIndicator size="small" color={theme.colors.onLime} /> : null}
          <Text style={styles.ctaText}>
            {cta}
            {wallet.address && daily.rewardsEnabled && !daily.busy ? ` ${SKR_SHORT}` : ""}
          </Text>
        </Pressable>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Once today is on-chain: a story-style bubble leading the stories row. */
export function StreakBubble({ onOpen }: { onOpen: () => void }) {
  const daily = useClockIn();
  const streak = daily.state.data?.streak ?? 0;
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.bubbleWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`${streak}-day streak, clocked in today`}
    >
      <View style={styles.bubbleOuter}>
        <Svg width={70} height={70} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="streakRing" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={theme.colors.pos} />
              <Stop offset="1" stopColor={theme.colors.lime} />
            </LinearGradient>
          </Defs>
          <Circle cx={35} cy={35} r={33.5} stroke="url(#streakRing)" strokeWidth={3} fill="none" />
        </Svg>
        <View style={styles.bubbleInner}>
          <Flame size={20} color={theme.colors.ink} />
          <Text style={styles.bubbleCount}>{streak}</Text>
        </View>
      </View>
      <Text style={styles.bubbleLabel} numberOfLines={1}>
        {streak === 1 ? "1 day" : `${streak} days`}
      </Text>
    </Pressable>
  );
}

/** The full clock-in card and its rules, in a sheet. */
export function ClockInSheet({
  visible,
  onClose,
  bottomInset = 0,
}: {
  visible: boolean;
  onClose: () => void;
  bottomInset?: number;
}) {
  const daily = useClockIn();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: 28 + bottomInset }]}>
        <Text style={styles.sheetTitle}>Daily clock-in</Text>
        <ClockInCard compact />
        <Text style={styles.rules}>
          {daily.rewardsEnabled
            ? `Rewards are ${SKR_LABEL}: 10 on day one, +5 a day up to 40 on day seven. Seeker owners earn double. Each clock-in is a memo on Solana devnet, so your streak is read back from the chain. Spend rewards boosting posts.`
            : "This build records clock-ins on-chain but has no devnet reward key, so it mints no SKR."}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stripWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, gap: 6 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.ink,
    ...theme.shadow.card,
  },
  flame: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  flameLit: { backgroundColor: theme.colors.lime },
  stripTitle: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onInk, letterSpacing: -0.2 },
  stripSub: { fontSize: theme.type.caption.size, color: "rgba(243,247,238,0.7)", marginTop: 1 },
  cta: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.lime,
  },
  ctaText: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.onLime },
  error: { fontSize: theme.type.caption.size, color: theme.colors.neg, paddingHorizontal: 4 },
  bubbleWrap: { alignItems: "center", gap: 6, width: 72 },
  bubbleOuter: { width: 70, height: 70, alignItems: "center", justifyContent: "center" },
  bubbleInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.lime,
  },
  bubbleCount: { fontSize: 17, fontWeight: "900", color: theme.colors.ink, fontVariant: ["tabular-nums"] },
  bubbleLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  sheet: { gap: 14, paddingHorizontal: 20, paddingTop: 4 },
  sheetTitle: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.4 },
  rules: { fontSize: theme.type.caption.size, lineHeight: 17, color: theme.colors.muted },
});
