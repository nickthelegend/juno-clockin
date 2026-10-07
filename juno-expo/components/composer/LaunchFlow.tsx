import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { TxRow } from "../TxRow";
import { useReducedMotion } from "../../lib/motion";
import { theme } from "../../theme";

/**
 * The launch, step by step, then the moment it is live.
 *
 * A launch is two approvals (Solana cannot fit a sixteen-segment curve and
 * the pool in one transaction), wrapped in an upload and a listing. Each step
 * shows its state and, once it lands, its receipt, so the progress is the
 * chain's answers rather than a spinner. Then a full-screen lime burst and the
 * two things you want next: your market, and a way to share it.
 */

export type StepState = "pending" | "active" | "done" | "error";
export type LaunchStep = { id: string; label: string; detail: string; state: StepState; signature?: string };

function StepIcon({ state, index }: { state: StepState; index: number }) {
  if (state === "active") return <ActivityIndicator color={theme.colors.ink} />;
  if (state === "done") {
    return (
      <View style={[styles.dot, styles.dotDone]}>
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path d="M5 12.5 10 17 19 7.5" stroke={theme.colors.onLime} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    );
  }
  return (
    <View style={[styles.dot, state === "error" ? styles.dotError : null]}>
      <Text style={[styles.dotText, state === "error" ? { color: theme.colors.onInk } : null]}>{state === "error" ? "!" : index + 1}</Text>
    </View>
  );
}

export function LaunchProgress({
  visible,
  steps,
  error,
  onRetry,
  onClose,
  busy,
}: {
  visible: boolean;
  steps: LaunchStep[];
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const insets = useSafeAreaInsets();
  const doneCount = steps.filter((s) => s.state === "done").length;
  const last = useRef(doneCount);
  useEffect(() => {
    if (doneCount > last.current) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    last.current = doneCount;
  }, [doneCount]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <Text style={styles.title}>{error ? "Launch paused" : "Launching your market"}</Text>
          <Text style={styles.sub}>
            {error ? "Nothing you signed is lost. Fix the issue and try again." : "Two quick approvals in your wallet. Keep Juno open."}
          </Text>

          <View style={{ gap: 14, marginTop: 6 }}>
            {steps.map((step, index) => (
              <View key={step.id} style={{ gap: 8 }}>
                <View style={styles.row}>
                  <View style={styles.iconBox}>
                    <StepIcon state={step.state} index={index} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepLabel, step.state === "pending" ? { color: theme.colors.faint } : null]}>{step.label}</Text>
                    <Text style={styles.stepDetail}>{step.detail}</Text>
                  </View>
                </View>
                {step.signature ? (
                  <View style={{ marginLeft: 44 }}>
                    <TxRow signature={step.signature} label={step.label} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {error ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Text style={styles.error}>{error}</Text>
              <Pressable onPress={onRetry} style={({ pressed }) => [styles.cta, { transform: [{ scale: pressed ? 0.98 : 1 }] }]} accessibilityRole="button">
                <Text style={styles.ctaText}>Try again</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.ghost} accessibilityRole="button">
                <Text style={styles.ghostText}>Back to editing</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const BURST = 14;

/** A lime burst: rings and sparks thrown out from the centre, once. */
function Burst() {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      t.setValue(1);
      return;
    }
    Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start();
  }, [reduced, t]);
  const sparks = Array.from({ length: BURST }, (_, i) => {
    const angle = (i / BURST) * Math.PI * 2;
    const dist = 120 + (i % 3) * 30;
    return { angle, dist, size: 8 + (i % 4) * 3, color: i % 3 === 0 ? theme.colors.ink : i % 3 === 1 ? theme.colors.lime : theme.colors.pos };
  });
  return (
    <View pointerEvents="none" style={styles.burst}>
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.8, 0.3, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.4] }) }],
          },
        ]}
      />
      {sparks.map((s, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: s.color,
            opacity: reduced ? 0 : t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(s.angle) * s.dist] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(s.angle) * s.dist] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export function LaunchSuccess({
  visible,
  name,
  symbol,
  imageUri,
  onView,
  onShare,
  onDone,
}: {
  visible: boolean;
  name: string;
  symbol: string;
  imageUri: string | null;
  onView: () => void;
  onShare: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    if (!visible) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    pop.setValue(reduced ? 1 : 0.85);
    if (!reduced) Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [visible, reduced, pop]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone}>
      <View style={[styles.success, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <StatusBar style="light" />
        <View style={styles.successTop}>
          <Burst />
          <Animated.View style={[styles.poster, { transform: [{ scale: pop }] }]}>
            {imageUri ? <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.posterChip}>
              <Text style={styles.posterChipText}>${symbol}</Text>
            </View>
          </Animated.View>
        </View>
        <View style={{ gap: 8, marginBottom: 20 }}>
          <Text style={styles.successTitle}>Your market is live</Text>
          <Text style={styles.successSub}>
            {name} is trading on its own bonding curve on Solana devnet. Every buy pays you the creator fee.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Pressable onPress={onView} style={({ pressed }) => [styles.cta, { transform: [{ scale: pressed ? 0.98 : 1 }] }]} accessibilityRole="button">
            <Text style={styles.ctaText}>View your market</Text>
          </Pressable>
          <Pressable onPress={onShare} style={({ pressed }) => [styles.ghostDark, { opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <Text style={styles.ghostDarkText}>Share</Text>
          </Pressable>
          <Pressable onPress={onDone} style={styles.ghost} accessibilityRole="button">
            <Text style={[styles.ghostText, { color: "rgba(243,247,238,0.7)" }]}>Post another</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(18,21,14,0.5)" },
  sheet: {
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 24,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    backgroundColor: theme.colors.surface,
  },
  title: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.4 },
  sub: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 32, alignItems: "center" },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
  },
  dotDone: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  dotError: { backgroundColor: theme.colors.neg, borderColor: theme.colors.neg },
  dotText: { fontSize: 13, fontWeight: "800", color: theme.colors.muted },
  stepLabel: { fontSize: theme.type.body.size, fontWeight: "700", color: theme.colors.text },
  stepDetail: { fontSize: theme.type.caption.size, color: theme.colors.muted },
  error: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.neg },
  cta: {
    minHeight: 54,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.lime,
  },
  ctaText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onLime },
  ghost: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.muted },
  ghostDark: {
    minHeight: 54,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(243,247,238,0.3)",
  },
  ghostDarkText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onInk },
  success: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between", backgroundColor: theme.colors.ink },
  successTop: { flex: 1, alignItems: "center", justifyContent: "center" },
  burst: { position: "absolute", alignItems: "center", justifyContent: "center", width: 1, height: 1 },
  ring: { position: "absolute", width: 220, height: 220, borderRadius: 110, borderWidth: 6, borderColor: theme.colors.lime },
  poster: {
    width: 200,
    height: 200,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: theme.colors.inkSoft,
    borderWidth: 4,
    borderColor: theme.colors.lime,
  },
  posterChip: {
    position: "absolute",
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.lime,
  },
  posterChipText: { fontSize: 14, fontWeight: "900", color: theme.colors.onLime },
  successTitle: { fontSize: theme.type.screen.size, fontWeight: "900", color: theme.colors.onInk, letterSpacing: -0.8 },
  successSub: { fontSize: theme.type.body.size, lineHeight: 23, color: "rgba(243,247,238,0.72)" },
});
