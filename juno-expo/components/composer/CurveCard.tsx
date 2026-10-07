import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";

import { PRESET_WEIGHTS } from "../CurvePreview";
import { useReducedMotion } from "../../lib/motion";
import { theme } from "../../theme";

/**
 * One curve preset, as a card you choose with your thumb.
 *
 * The curve is drawn from the same sixteen liquidity weights the launch uses,
 * so the picture is the market's real shape. On select it draws itself in
 * (stroke dash offset), which is the one moment on this screen worth moving:
 * it tells you this is the shape your post's price will follow.
 */

export const CURVE_PRESETS = [
  { id: "content", label: "Content", bestFor: "Best for photos and reels", detail: "Cheap to get in early, steepens as attention arrives." },
  { id: "thin-name", label: "Thin name", bestFor: "Best for a small, early following", detail: "Deep at the start so early buyers fill near the opening price." },
  { id: "ipo-book", label: "IPO book", bestFor: "Best for a launch with a crowd waiting", detail: "Deep at both ends, quicker in the middle. Book-building." },
  { id: "tight-nav", label: "Tight NAV", bestFor: "Best for tracking something steady", detail: "Even all the way. Moves like a spread, not a launch." },
] as const;

export type PresetId = (typeof CURVE_PRESETS)[number]["id"];

const AnimatedPath = Animated.createAnimatedComponent(Path);
const H = 84;

function curvePoints(preset: string, width: number) {
  const weights = PRESET_WEIGHTS[preset] ?? PRESET_WEIGHTS.content!;
  const steps: number[] = [];
  let total = 0;
  for (const weight of weights) {
    total += 1 / Math.max(weight, 0.001);
    steps.push(total);
  }
  const peak = steps[steps.length - 1] || 1;
  const pts = [[0, H - 4], ...steps.map((v, i) => [((i + 1) / steps.length) * width, H - 4 - (v / peak) * (H - 14)])] as Array<[number, number]>;
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const line = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  return { line, area: `${line} L${width},${H} L0,${H} Z`, length: Math.ceil(length), end: pts[pts.length - 1]! };
}

function PresetIcon({ id, color }: { id: string; color: string }) {
  const common = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      {id === "content" ? (
        <Path d="M4 19c6 0 9-3 16-15" {...common} />
      ) : id === "thin-name" ? (
        <Path d="M4 19c7-12 10-14 16-15" {...common} />
      ) : id === "ipo-book" ? (
        <Path d="M4 19c3-1 4-4 8-8s5-6 8-7" {...common} />
      ) : (
        <Path d="M4 19 20 5" {...common} />
      )}
    </Svg>
  );
}

export function CurveCard({
  preset,
  selected,
  width,
  onSelect,
}: {
  preset: (typeof CURVE_PRESETS)[number];
  selected: boolean;
  width: number;
  onSelect: () => void;
}) {
  const reduced = useReducedMotion();
  const graphW = width - 32;
  const { line, area, length, end } = useMemo(() => curvePoints(preset.id, graphW), [preset.id, graphW]);
  const draw = useRef(new Animated.Value(selected ? 0 : length)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!selected) {
      draw.setValue(0);
      return;
    }
    if (reduced) {
      draw.setValue(0);
      return;
    }
    draw.setValue(length);
    Animated.timing(draw, {
      toValue: 0,
      duration: 700,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: false,
    }).start();
  }, [selected, length, reduced, draw]);

  const stroke = selected ? theme.colors.ink : theme.colors.faint;

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onSelect();
      }}
      onPressIn={() => Animated.spring(press, { toValue: 0.98, useNativeDriver: true, speed: 40 }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preset.label} curve. ${preset.bestFor}`}
    >
      <Animated.View style={[styles.card, selected ? styles.cardOn : null, { transform: [{ scale: press }] }]}>
        <View style={styles.head}>
          <View style={[styles.icon, selected ? styles.iconOn : null]}>
            <PresetIcon id={preset.id} color={theme.colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{preset.label}</Text>
            <Text style={styles.bestFor}>{preset.bestFor}</Text>
          </View>
          <View style={[styles.check, selected ? styles.checkOn : null]}>
            {selected ? (
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path d="M5 12.5 10 17 19 7.5" stroke={theme.colors.onLime} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            ) : null}
          </View>
        </View>

        <View style={styles.graph}>
          <Svg width={graphW} height={H}>
            <Defs>
              <LinearGradient id={`fill-${preset.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={selected ? theme.colors.lime : theme.colors.lineStrong} stopOpacity={selected ? 0.55 : 0.35} />
                <Stop offset="1" stopColor={selected ? theme.colors.lime : theme.colors.lineStrong} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} y1={H - 4} x2={graphW} y2={H - 4} stroke={theme.colors.line} strokeWidth={1} />
            <Path d={area} fill={`url(#fill-${preset.id})`} />
            <AnimatedPath
              d={line}
              stroke={stroke}
              strokeWidth={selected ? 3 : 2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={selected ? [length, length] : undefined}
              strokeDashoffset={selected ? draw : 0}
            />
            {selected ? <Circle cx={end[0] - 2} cy={end[1]} r={4.5} fill={theme.colors.ink} /> : null}
          </Svg>
          <View style={styles.axis}>
            <Text style={styles.axisText}>↑ price</Text>
            <Text style={styles.axisText}>supply sold →</Text>
          </View>
        </View>

        {selected ? <Text style={styles.detail}>{preset.detail}</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: "transparent",
    ...theme.shadow.card,
  },
  cardOn: {
    borderColor: theme.colors.lime,
    shadowColor: "#9DBF1E",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  iconOn: { backgroundColor: theme.colors.lime },
  label: { fontSize: theme.type.lead.size, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.3 },
  bestFor: { fontSize: theme.type.caption.size, color: theme.colors.muted, marginTop: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: theme.colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  graph: { gap: 4 },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontSize: 12, color: theme.colors.faint, fontWeight: "600" },
  detail: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.text },
});
