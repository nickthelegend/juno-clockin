import { Image, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

import { theme } from "../theme";

const colors = theme.colors;

/**
 * Illustrations, drawn in code.
 *
 * These are vector rather than bitmap for a specific reason: every figure here
 * is derived from the product — the network is people around a market, the
 * portfolio object is a stack of positions — and a vector version stays sharp
 * at any size, themes with the palette, and adds nothing to the bundle.
 *
 * They are also not placeholders standing in for missing art. If generated
 * artwork replaces them later it should be because it says something these
 * cannot, not because these are unfinished.
 */

/**
 * A market with people around it.
 *
 * The centre is the thing being traded; the ring is the audience holding a
 * position in it. That is the entire product in one figure, which is why the
 * connecting lines are drawn *to* the centre rather than between the people.
 */
export function OnboardingArt({ size = 280 }: { size?: number }) {
  const people = [
    { x: 140, y: 34, r: 24, fill: theme.colors.lime },
    { x: 232, y: 86, r: 20, fill: "#8B5CF6" },
    { x: 214, y: 196, r: 22, fill: "#2E5BFF" },
    { x: 74, y: 196, r: 26, fill: "#0E9F6E" },
    { x: 44, y: 88, r: 19, fill: "#C77700" },
  ];

  return (
    <Svg width={size} height={size} viewBox="0 0 280 260">
      <Defs>
        <LinearGradient id="core" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={theme.colors.lime} />
          <Stop offset="100%" stopColor="#0E9F6E" />
        </LinearGradient>
      </Defs>

      {/* Each person is connected to the market, not to each other. */}
      <G opacity={0.35}>
        {people.map((person) => (
          <Line
            key={`link-${person.x}-${person.y}`}
            x1={person.x}
            y1={person.y}
            x2={140}
            y2={128}
            stroke={colors.lineStrong}
            strokeWidth={2}
          />
        ))}
      </G>

      {/* The market itself: a rising book. */}
      <Circle cx={140} cy={128} r={54} fill="url(#core)" />
      <G>
        {[0, 1, 2, 3].map((i) => (
          <Rect
            key={`bar-${i}`}
            x={118 + i * 12}
            y={142 - i * 13}
            width={8}
            height={14 + i * 13}
            rx={3}
            fill={colors.surface}
            opacity={0.92}
          />
        ))}
      </G>

      {people.map((person) => (
        <G key={`person-${person.x}-${person.y}`}>
          <Circle cx={person.x} cy={person.y} r={person.r} fill={person.fill} />
          <Circle cx={person.x} cy={person.y - person.r * 0.22} r={person.r * 0.34} fill={colors.surface} opacity={0.95} />
          <Path
            d={`M${person.x - person.r * 0.55} ${person.y + person.r * 0.62}
                a ${person.r * 0.55} ${person.r * 0.48} 0 0 1 ${person.r * 1.1} 0`}
            fill={colors.surface}
            opacity={0.95}
          />
        </G>
      ))}
    </Svg>
  );
}

/**
 * The portfolio object: positions stacked into one value.
 *
 * Deliberately an object rather than a chart. A chart here would imply a
 * performance history the app has not measured for a new wallet, whereas a
 * stack reads as "what you hold" and stays honest when that is nothing.
 */
export function PortfolioArt({ size = 130 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Defs>
        <LinearGradient id="coinTop" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#F7EE73" />
          <Stop offset="100%" stopColor="#E6D21C" />
        </LinearGradient>
      </Defs>

      {/* Lower discs are the older positions; the top one is the newest. */}
      {[
        { y: 104, fill: "#2E5BFF", opacity: 0.9 },
        { y: 86, fill: "#8B5CF6", opacity: 0.92 },
        { y: 68, fill: "#0E9F6E", opacity: 0.95 },
      ].map((disc) => (
        <G key={`disc-${disc.y}`}>
          <Rect x={30} y={disc.y} width={100} height={20} rx={10} fill={disc.fill} opacity={disc.opacity} />
        </G>
      ))}

      <Rect x={30} y={44} width={100} height={26} rx={13} fill={theme.colors.lime} />
      <Circle cx={80} cy={57} r={8} fill={colors.surface} opacity={0.9} />

      {/* A small upward mark, because a portfolio screen is about direction. */}
      <Path
        d="M108 34 L120 22 M120 22 L120 31 M120 22 L111 22"
        stroke={colors.pos}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Shown where a coin has no artwork of its own. */
export function CoinGlyph({ size = 48, seed = "" }: { size?: number; seed?: string }) {
  // Derived from the mint so the same coin always gets the same figure — the
  // address is the data, not a random fallback.
  const hash = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  const palette = [colors.series[0], colors.series[1], colors.series[2], colors.series[3]];
  const fill = palette[hash % palette.length];
  const second = palette[(hash + 2) % palette.length];

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={14} fill={colors.surfaceAlt} />
      <Circle cx={18 + (hash % 7)} cy={20 + (hash % 5)} r={11} fill={fill} opacity={0.9} />
      <Circle cx={30 - (hash % 5)} cy={30 - (hash % 6)} r={9} fill={second} opacity={0.75} />
    </Svg>
  );
}


/**
 * A coin's artwork, or the mark derived from its mint when there is none.
 *
 * Most Juno coins carry real media. The ones that do not get the server's
 * identicon, which arrives as an SVG data URI — and those crash the iOS image
 * loader outright ("URI parsing error"), so `juno.media` strips them. What was
 * left behind was an empty grey square on every unmediated coin in the market
 * list, which reads as a broken image rather than as a coin without a picture.
 *
 * Drawing the same seed as SVG gives the coin a stable identity here without
 * asking the image loader to parse anything.
 */
export function CoinArt({
  uri,
  seed,
  size = 48,
  radius = 16,
}: {
  /** Already passed through `juno.media` — null when there is no loadable image. */
  uri: string | null;
  /** The coin's mint, so the drawn mark is the same one everywhere. */
  seed: string;
  size?: number;
  radius?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.surfaceAlt,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <CoinGlyph seed={seed} size={size} />
    </View>
  );
}

/**
 * A seeded avatar, drawn rather than fetched.
 *
 * The server's identicon is an `data:image/svg+xml` URI. That renders in a
 * browser and makes iOS throw "URI parsing error" out of RCTImageManager,
 * which takes the screen down with it — so on native the same idea is drawn
 * directly. The figure is derived from the wallet address, so the same person
 * always gets the same mark: the address *is* the data, not a placeholder
 * standing in for a missing avatar.
 */
export function Identicon({ seed, size = 26, label }: { seed: string; size?: number; label?: string | null }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = h >>> 0;
  // Two hues a fixed step apart, so every wallet gets a harmonious pair rather
  // than two random colours fighting; saturation and lightness stay in the
  // band where white text on top still reads.
  const hue = n % 360;
  const hue2 = (hue + 38 + ((n >>> 9) % 50)) % 360;
  const angle = (n >>> 17) % 4;
  const id = `id${n.toString(36)}`;
  const [x1, y1, x2, y2] = [["0", "0", "1", "1"], ["1", "0", "0", "1"], ["0", "1", "1", "0"], ["0", "0", "1", "0.4"]][angle]!;
  const monogram = label?.trim() ? label.trim().slice(0, 2).toUpperCase() : null;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
          <Stop offset="0" stopColor={`hsl(${hue}, 72%, 58%)`} />
          <Stop offset="1" stopColor={`hsl(${hue2}, 78%, 46%)`} />
        </LinearGradient>
      </Defs>
      <Circle cx={24} cy={24} r={24} fill={`url(#${id})`} />
      {/* A soft highlight, so the disc reads as a surface rather than a flat dot. */}
      <Circle cx={17} cy={14} r={13} fill="#FFFFFF" opacity={0.14} />
      {monogram ? (
        <SvgText
          x={24}
          y={30.5}
          fontSize={monogram.length > 1 ? 17 : 20}
          fontWeight="800"
          fill="#FFFFFF"
          textAnchor="middle"
          letterSpacing={-0.5}
        >
          {monogram}
        </SvgText>
      ) : null}
    </Svg>
  );
}
