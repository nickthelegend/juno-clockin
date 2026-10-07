import Svg, { Circle, Path, Rect } from "react-native-svg";

import { theme } from "../../theme";

type Glyph = { size?: number; color?: string };

/** 3x3 grid: the posts tab. */
export function GridGlyph({ size = 22, color = theme.colors.text }: Glyph) {
  const s = 5.4;
  const cells = [2.5, 9.3, 16.1];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {cells.flatMap((y) =>
        cells.map((x) => <Rect key={`${x}-${y}`} x={x} y={y} width={s} height={s} rx={1.2} fill={color} />),
      )}
    </Svg>
  );
}

/** A clapper-style play square: the reels tab. */
export function ReelsGlyph({ size = 22, color = theme.colors.text }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} strokeWidth={1.9} />
      <Path d="M3.5 8.5h17M8 3.5l3 5M14 3.5l3 5" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M10 12.2v5l4.3-2.5z" fill={color} />
    </Svg>
  );
}

/** The lightning bolt used for SKR boosts everywhere in Juno. */
export function BoltGlyph({ size = 22, color = theme.colors.text, filled = false }: Glyph & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M13.2 2.5 4.8 13.4h6l-1.1 8.1 8.5-11h-6.1l1.1-8z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Stacked coins: the holdings tab. */
export function CoinsGlyph({ size = 22, color = theme.colors.text }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={9} r={5.5} stroke={color} strokeWidth={1.8} />
      <Path d="M14.2 7.2a5.5 5.5 0 1 1-6.9 8.7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function CameraGlyph({ size = 34, color = theme.colors.text }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.4} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function GearGlyph({ size = 20, color = theme.colors.text }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function FlameGlyph({ size = 26, color = theme.colors.ink }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.4 2.5 1.6 0 2.6-1.3 2.3-3.3C17.6 10.5 19 13 19 15.5 19 19.1 15.9 22 12 22s-7-2.9-7-6.5c0-4.6 4.1-6.6 7-13.5z"
        fill={color}
      />
    </Svg>
  );
}

export function ShieldGlyph({ size = 26, color = theme.colors.ink }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.5 7.5 10 4.3-1.5 7.5-5.4 7.5-10v-6z" fill={color} />
      <Path d="m8.6 12.2 2.4 2.4 4.6-4.8" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LinkGlyph({ size = 14, color = theme.colors.text }: Glyph) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
