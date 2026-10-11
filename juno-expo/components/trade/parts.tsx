import { Image as ExpoImage } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

import { juno, type Coin } from "../../lib/api";
import { aliasFor, useName } from "../../lib/names";
import { theme } from "../../theme";
import { Identicon } from "../art";
import { HeartGlyph, ReplyBubble } from "../icons";
import { Tappable } from "../Press";

const c = theme.colors;

/* ------------------------------------------------------------------ */
/* Per-coin detail: price history and 24h change                       */
/* ------------------------------------------------------------------ */

/**
 * The list endpoint carries no swap history, so each card reads its own coin
 * once — two at a time, cached for the session — and draws what came back.
 * Nothing here is invented: no history means the card says so.
 */
export type CoinDetail = {
  points: number[];
  times: number[];
  change: number | null;
};

const details = new Map<string, Promise<CoinDetail>>();
const settled = new Map<string, CoinDetail | "error">();
let active = 0;
const waiting: Array<() => void> = [];

function limited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
    };
    if (active < 2) run();
    else waiting.push(run);
  });
}

function loadDetail(address: string): Promise<CoinDetail> {
  let pending = details.get(address);
  if (!pending) {
    const once = () => limited(() => juno.coin(address));
    // One quiet retry: the server's chain reads are rate-limited at busy moments.
    const read = once().catch(() => new Promise((r) => setTimeout(r, 3000)).then(once));
    pending = read.then(({ coin }) => ({
      ...(() => {
        const rows = (coin.priceHistory ?? []).filter((p) => Number.isFinite(p.price) && p.price > 0);
        return { points: rows.map((p) => p.price), times: rows.map((p) => Date.parse(p.t)) };
      })(),
      change: coin.marketCapChangePct ?? null,
    }));
    pending.then(
      (value) => settled.set(address, value),
      () => {
        settled.set(address, "error");
        details.delete(address);
      },
    );
    details.set(address, pending);
  }
  return pending;
}

export function clearCoinDetails() {
  details.clear();
  settled.clear();
}

export function useCoinDetail(address: string): { data: CoinDetail | null; error: boolean } {
  const initial = settled.get(address);
  const [state, setState] = useState<{ data: CoinDetail | null; error: boolean }>(
    initial && initial !== "error" ? { data: initial, error: false } : { data: null, error: false },
  );
  useEffect(() => {
    let live = true;
    loadDetail(address).then(
      (data) => live && setState({ data, error: false }),
      () => live && setState({ data: null, error: true }),
    );
    return () => {
      live = false;
    };
  }, [address]);
  return state;
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A readable handle: the wallet's .skr or Juno name when it has one, else a stable alias. Never base58. */
export function useCreatorHandle(wallet: string): string {
  const name = useName(wallet);
  if (name) return name.includes(".") || name.startsWith("@") ? name : `@${name}`;
  return `@${aliasFor(wallet)}`;
}

/* ------------------------------------------------------------------ */
/* Thumbnails                                                          */
/* ------------------------------------------------------------------ */

function initials(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "J";
}

/** Gradient tile with the ticker's initials, for a coin without loadable media. */
export function GradientTile({ seed, symbol, w, h, radius }: { seed: string; symbol: string; w: number; h: number; radius: number }) {
  const n = hash(seed);
  const hue = n % 360;
  const hue2 = (hue + 40 + ((n >>> 9) % 60)) % 360;
  const id = `gt${n.toString(36)}`;
  const label = initials(symbol);
  const size = Math.min(w, h);
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={`hsl(${hue}, 70%, 60%)`} />
          <Stop offset="1" stopColor={`hsl(${hue2}, 75%, 40%)`} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={radius} fill={`url(#${id})`} />
      <Circle cx={w * 0.28} cy={h * 0.22} r={size * 0.32} fill="#FFFFFF" opacity={0.12} />
      <SvgText
        x={w / 2}
        y={h / 2 + size * 0.13}
        fontSize={size * 0.36}
        fontWeight="800"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        {label}
      </SvgText>
    </Svg>
  );
}

export function CoinThumb({ coin, size = 56, height, radius = 16 }: { coin: Coin; size?: number; height?: number; radius?: number }) {
  const uri = juno.still(coin.media);
  const [failed, setFailed] = useState(false);
  const h = height ?? size;
  if (!uri || failed) return <GradientTile seed={coin.address} symbol={coin.symbol} w={size} h={h} radius={radius} />;
  return (
    <ExpoImage
      source={{ uri }}
      onError={() => setFailed(true)}
      style={{ width: size, height: h, borderRadius: radius, backgroundColor: c.surfaceAlt }}
      contentFit="cover"
      transition={150}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline and change chip                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({ address, height = 34 }: { address: string; height?: number }) {
  const { data, error } = useCoinDetail(address);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const points = data?.points ?? [];
  const up = points.length < 3 || points[points.length - 1]! >= points[0]!;
  const stroke = up ? c.pos : c.neg;

  const path = useMemo(() => {
    if (points.length < 3 || width === 0) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || max * 0.02 || 1;
    const pad = 3;
    // x by time, not by index, and held flat between fills: a curve only moves when someone trades.
    const times = data?.times ?? [];
    const t0 = times[0] ?? 0;
    const t1 = Math.max(Date.now(), times[times.length - 1] ?? 0);
    const byTime = times.length === points.length && t1 > t0;
    const xy = points.map((p, i) => [
      byTime ? ((times[i]! - t0) / (t1 - t0)) * width : (i / (points.length - 1)) * width,
      pad + (1 - (p - min) / span) * (height - pad * 2),
    ]);
    if (byTime) xy.push([width, xy[xy.length - 1]![1]!]);
    const line = xy
      .map(([x, y], i) => (i === 0 ? `M${x!.toFixed(1)},${y!.toFixed(1)}` : `H${x!.toFixed(1)} V${y!.toFixed(1)}`))
      .join(" ");
    return { line, area: `${line} L${width},${height} L0,${height} Z` };
  }, [points, data, width, height]);

  const note = !data && !error ? null : error ? "Chart is catching up" : points.length === 0 ? "No trades yet" : points.length < 3 ? "Just a few trades so far" : null;
  const id = `sp${hash(address).toString(36)}`;

  return (
    <View style={{ height, justifyContent: "center" }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {path ? (
            <>
              <Defs>
                <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={stroke} stopOpacity={0.18} />
                  <Stop offset="1" stopColor={stroke} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={path.area} fill={`url(#${id})`} />
              <Path d={path.line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <Line
              x1={0}
              y1={height / 2}
              x2={width}
              y2={height / 2}
              stroke={c.lineStrong}
              strokeWidth={1.5}
              strokeDasharray="4 5"
              opacity={data || error ? 1 : 0.5}
            />
          )}
        </Svg>
      ) : null}
      {note ? (
        <View style={styles.sparkNote}>
          <Text style={styles.sparkNoteText}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ChangeChip({ address }: { address: string }) {
  const { data, error } = useCoinDetail(address);
  if (error) return null;
  if (!data) return <View style={[styles.chip, { backgroundColor: c.surfaceAlt, width: 52 }]} />;
  if (data.points.length < 3) {
    return (
      <View style={[styles.chip, { backgroundColor: c.limeSoft }]}>
        <Text style={[styles.chipText, { color: c.onLime }]}>New</Text>
      </View>
    );
  }
  const pct = data.change;
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <View style={[styles.chip, { backgroundColor: c.surfaceAlt }]}>
        <Text style={[styles.chipText, { color: c.muted }]}>24h —</Text>
      </View>
    );
  }
  if (Math.abs(pct) < 0.0005) {
    return (
      <View style={[styles.chip, { backgroundColor: c.surfaceAlt }]}>
        <Text style={[styles.chipText, { color: c.muted }]}>0.0%</Text>
      </View>
    );
  }
  const up = pct >= 0;
  return (
    <View style={[styles.chip, { backgroundColor: up ? c.posSoft : c.negSoft }]}>
      <Text style={[styles.chipText, { color: up ? c.pos : c.neg }]}>
        {up ? "▲" : "▼"} {Math.abs(pct * 100).toFixed(1)}%
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

export function CreatorLine({ wallet }: { wallet: string }) {
  const handle = useCreatorHandle(wallet);
  return (
    <View style={styles.creator}>
      <Identicon seed={wallet} size={16} />
      <Text style={styles.creatorText} numberOfLines={1}>
        {handle}
      </Text>
    </View>
  );
}

export function curveInfo(pct: number, graduated: boolean) {
  const width = graduated ? 100 : pct > 0 ? Math.max(3, Math.min(100, pct)) : 0;
  const label = graduated
    ? "Graduated"
    : pct <= 0
      ? "Just launched"
      : pct < 1
        ? "Under 1% to graduation"
        : `${Math.floor(pct)}% to graduation`;
  return { width, label };
}

export function Social({ likes, replies }: { likes?: number; replies?: number }) {
  const l = likes ?? 0;
  const r = replies ?? 0;
  if (l <= 0 && r <= 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {l > 0 ? (
        <View style={styles.social}>
          <HeartGlyph size={13} color={c.heart} filled stroke={1.6} />
          <Text style={styles.socialText}>{l}</Text>
        </View>
      ) : null}
      {r > 0 ? (
        <View style={styles.social}>
          <ReplyBubble size={13} color={c.muted} stroke={1.8} />
          <Text style={styles.socialText}>{r}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function BuyPill({ onPress, label = "Buy", dim = false }: { onPress: () => void; label?: string; dim?: boolean }) {
  return (
    <Tappable onPress={onPress} to={0.94} hitSlop={8}>
      <View style={[styles.buy, dim ? { opacity: 0.5 } : null]} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={styles.buyText}>{label}</Text>
      </View>
    </Tappable>
  );
}

/* ------------------------------------------------------------------ */
/* Header, tabs, search, sort                                          */
/* ------------------------------------------------------------------ */

function SearchGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={2.2} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function FilterGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M7 12h10M10 17h4" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconButton({ kind, active, onPress, label }: { kind: "search" | "filter"; active: boolean; onPress: () => void; label: string }) {
  const color = active ? c.onLime : c.text;
  return (
    <Tappable onPress={onPress} to={0.92} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.iconButton, active ? { backgroundColor: c.lime } : null]}>
        {kind === "search" ? <SearchGlyph color={color} /> : <FilterGlyph color={color} />}
      </View>
    </Tappable>
  );
}

export function PillTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      style={{ flexGrow: 0 }}
    >
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Tappable key={item.id} onPress={() => onChange(item.id)} to={0.95} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View style={[styles.tab, on ? styles.tabOn : null]}>
              <Text style={[styles.tabText, on ? styles.tabTextOn : null]}>{item.label}</Text>
            </View>
          </Tappable>
        );
      })}
    </ScrollView>
  );
}

export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.search}>
      <SearchGlyph color={c.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search coins and companies"
        placeholderTextColor={c.faint}
        style={styles.searchInput}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Banner and empty states                                             */
/* ------------------------------------------------------------------ */

export function Banner({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerDot} />
      <Text style={styles.bannerText} numberOfLines={2}>
        {text}
      </Text>
      <Tappable onPress={onClose} to={0.9} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Text style={styles.bannerClose}>✕</Text>
      </Tappable>
    </View>
  );
}

function EmptyArt({ tone }: { tone: "empty" | "error" }) {
  return (
    <Svg width={120} height={96} viewBox="0 0 120 96">
      <Rect x={14} y={12} width={92} height={72} rx={20} fill={c.surface} />
      <Path
        d={tone === "error" ? "M30 64 L48 46 L60 58 L72 40 L90 56" : "M30 66 C46 66 54 60 62 50 S80 30 90 28"}
        stroke={tone === "error" ? c.neg : c.ink}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={tone === "error" ? "6 7" : undefined}
      />
      <Circle cx={90} cy={tone === "error" ? 56 : 28} r={9} fill={c.lime} stroke={c.ink} strokeWidth={3} />
    </Svg>
  );
}

export function EmptyState({
  tone = "empty",
  line,
  cta,
  onPress,
}: {
  tone?: "empty" | "error";
  line: string;
  cta?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <EmptyArt tone={tone} />
      <Text style={styles.emptyLine}>{line}</Text>
      {cta && onPress ? (
        <Tappable onPress={onPress} to={0.95}>
          <View style={styles.emptyCta}>
            <Text style={styles.buyText}>{cta}</Text>
          </View>
        </Tappable>
      ) : null}
    </View>
  );
}

export function CardSkeleton() {
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={[styles.bone, { width: 56, height: 56, borderRadius: 16 }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.bone, { width: "60%", height: 14 }]} />
          <View style={[styles.bone, { width: "35%", height: 11 }]} />
        </View>
        <View style={{ gap: 8, alignItems: "flex-end" }}>
          <View style={[styles.bone, { width: 70, height: 16 }]} />
          <View style={[styles.bone, { width: 48, height: 18, borderRadius: 9 }]} />
        </View>
      </View>
      <View style={[styles.bone, { height: 30 }]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={[styles.bone, { flex: 1, height: 6 }]} />
        <View style={[styles.bone, { width: 64, height: 34, borderRadius: 17 }]} />
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 14,
    ...theme.shadow.card,
  },
  bone: { backgroundColor: c.line, borderRadius: 8 },
  name: { fontSize: 16, fontWeight: "800", color: c.text, letterSpacing: -0.3 },
  ticker: { fontSize: 13, fontWeight: "600", color: c.faint, marginTop: 1 },
  value: { fontSize: 17, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
  valueCaption: { fontSize: 11, color: c.faint, fontWeight: "600" },
  creator: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  creatorText: { fontSize: 12, fontWeight: "600", color: c.muted, flexShrink: 1 },
  chip: { height: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", marginTop: 6 },
  chipText: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  sparkNote: { alignSelf: "center", backgroundColor: c.surface, paddingHorizontal: 8 },
  sparkNoteText: { fontSize: 11, fontWeight: "600", color: c.faint },
  track: { height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.ink },
  meta: { fontSize: 12, color: c.muted, fontWeight: "600" },
  social: { flexDirection: "row", alignItems: "center", gap: 4 },
  socialText: { fontSize: 12, fontWeight: "700", color: c.muted, fontVariant: ["tabular-nums"] },
  buy: { height: 34, paddingHorizontal: 20, borderRadius: 17, backgroundColor: c.lime, alignItems: "center", justifyContent: "center" },
  buyText: { fontSize: 14, fontWeight: "800", color: c.onLime },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...theme.shadow.card },
  tab: { height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: c.lime },
  tabText: { fontSize: 15, fontWeight: "700", color: c.muted },
  tabTextOn: { color: c.onLime, fontWeight: "800" },
  search: { marginHorizontal: 16, marginBottom: 10, height: 44, borderRadius: 22, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 0 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.ink, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  bannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.lime },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 17, color: c.onInk, fontWeight: "600" },
  bannerClose: { fontSize: 14, color: "rgba(243,247,238,0.6)", fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 14 },
  emptyLine: { fontSize: 15, fontWeight: "600", color: c.muted, textAlign: "center", lineHeight: 21 },
  emptyCta: { height: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: c.lime, alignItems: "center", justifyContent: "center" },
});
