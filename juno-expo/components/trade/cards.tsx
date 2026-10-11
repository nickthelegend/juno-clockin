import { Image as ExpoImage } from "expo-image";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { Coin, TesseraCompany, Trader } from "../../lib/api";
import { bigMoney, count } from "../../lib/markets";
import { money } from "../../lib/useApi";
import { theme } from "../../theme";
import { Identicon } from "../art";
import { Tappable } from "../Press";
import {
  BuyPill,
  ChangeChip,
  CoinThumb,
  CreatorLine,
  curveInfo,
  GradientTile,
  Social,
  Sparkline,
  styles as s,
  useCreatorHandle,
} from "./parts";

const c = theme.colors;

/** The company behind a listed ticker, where the tracker's own name is only "NVDAx Issuance". */
const LISTED: Record<string, { name: string; venue: string }> = {
  AAPL: { name: "Apple", venue: "Nasdaq" },
  MSFT: { name: "Microsoft", venue: "Nasdaq" },
  NVDA: { name: "NVIDIA", venue: "Nasdaq" },
  TSLA: { name: "Tesla", venue: "Nasdaq" },
  AMZN: { name: "Amazon", venue: "Nasdaq" },
  GOOGL: { name: "Alphabet", venue: "Nasdaq" },
  META: { name: "Meta", venue: "Nasdaq" },
};

export function stockTicker(coin: Coin): string | null {
  // `Equity.US.NVDA/USD` → `NVDA`.
  return coin.reference ? (coin.reference.id.split(".").pop()?.split("/")[0] ?? null) : null;
}

export function stockName(coin: Coin): string {
  const t = stockTicker(coin);
  return (t && LISTED[t]?.name) || coin.name;
}

/** The company's own logo by ticker, falling back to a gradient tile with its initials. */
function StockLogo({ ticker, seed, size = 56 }: { ticker: string; seed: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <GradientTile seed={seed} symbol={ticker} w={size} h={size} radius={16} />;
  return (
    <View style={[local.logoTile, { width: size, height: size }]}>
      <ExpoImage
        source={{ uri: `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png` }}
        style={{ width: size * 0.62, height: size * 0.62 }}
        contentFit="contain"
        accessibilityLabel={`${LISTED[ticker]?.name ?? ticker} logo`}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

/**
 * One coin, as a trading-feed row: art, name and creator, the number that
 * matters with its 24h move, a sparkline of real fills, the curve in words,
 * and a Buy pill.
 */
export function CoinCard({
  coin,
  stock,
  onOpen,
  onBuy,
}: {
  coin: Coin;
  stock: boolean;
  onOpen: () => void;
  onBuy: () => void;
}) {
  const ticker = stock ? stockTicker(coin) : null;
  const listed = ticker ? LISTED[ticker] : undefined;
  const nav = coin.nav ?? null;
  const curve = curveInfo(coin.curve.progress * 100, coin.curve.graduated);

  return (
    <Tappable onPress={onOpen} to={0.985}>
      <View style={s.card}>
        <View style={local.head}>
          {stock ? <StockLogo ticker={ticker ?? coin.symbol} seed={coin.address} /> : <CoinThumb coin={coin} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>
              {stock ? (listed?.name ?? coin.name) : coin.name}
            </Text>
            <Text style={s.ticker} numberOfLines={1}>
              ${coin.symbol}
            </Text>
            {stock ? (
              <Text style={[s.creatorText, { marginTop: 5 }]} numberOfLines={1}>
                {listed?.venue ?? "Listed"} · {ticker ?? coin.symbol} · Pyth
              </Text>
            ) : (
              <CreatorLine wallet={coin.creator.wallet} />
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {stock && nav ? (
              <>
                <Text style={s.value}>{money(nav.priceUsd, "USD", { compact: false })}</Text>
                <Text style={s.valueCaption}>{nav.state === "closed" ? "last close" : "live price"}</Text>
              </>
            ) : (
              <>
                <Text style={s.value}>{money(coin.marketCap, coin.marketCapCurrency)}</Text>
                <Text style={s.valueCaption}>market cap</Text>
              </>
            )}
            <ChangeChip address={coin.address} />
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Sparkline address={coin.address} />
        </View>

        <View style={local.foot}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={s.track}>
              <View style={[s.fill, { width: `${curve.width}%` }]} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={s.meta}>{curve.label}</Text>
              {stock && nav && nav.deviation !== null ? (
                <Text style={[s.meta, { color: nav.withinBand ? c.pos : c.neg }]}>
                  {nav.deviation >= 0 ? "+" : ""}
                  {(nav.deviation * 100).toFixed(2)}% vs price
                </Text>
              ) : (
                <Social likes={coin.likes} replies={coin.commentCount} />
              )}
            </View>
          </View>
          {coin.curve.graduated ? (
            <View style={local.gradPill}>
              <Text style={local.gradText}>Graduated</Text>
            </View>
          ) : (
            <BuyPill onPress={onBuy} label="Buy" />
          )}
        </View>
      </View>
    </Tappable>
  );
}

/** Top coins as big thumbnail cards. */
export function Trending({ coins, onOpen }: { coins: Coin[]; onOpen: (coin: Coin) => void }) {
  if (coins.length < 2) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={local.section}>Trending</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
        style={{ marginHorizontal: -16 }}
        decelerationRate="fast"
        snapToInterval={160}
      >
        {coins.map((coin, index) => (
          <TrendingCard key={coin.address} coin={coin} rank={index + 1} onPress={() => onOpen(coin)} />
        ))}
      </ScrollView>
    </View>
  );
}

function TrendingCard({ coin, rank, onPress }: { coin: Coin; rank: number; onPress: () => void }) {
  const W = 148;
  const H = 196;
  const ticker = stockTicker(coin);
  const handle = useCreatorHandle(coin.creator.wallet);
  return (
    <Tappable onPress={onPress} to={0.97}>
      <View style={local.trend}>
        {ticker ? (
          <View style={{ width: W, height: H, backgroundColor: c.surface, alignItems: "center", paddingTop: 34 }}>
            <StockLogo ticker={ticker} seed={coin.address} size={72} />
          </View>
        ) : (
          <CoinThumb coin={coin} size={W} radius={0} />
        )}
        {!ticker ? <View style={{ position: "absolute", left: 0, right: 0, top: W, height: H - W, backgroundColor: c.ink }} /> : null}
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={`tg${rank}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.35" stopColor={c.ink} stopOpacity={0} />
              <Stop offset="0.78" stopColor={c.ink} stopOpacity={0.92} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill={`url(#tg${rank})`} />
        </Svg>
        <View style={local.rank}>
          <Text style={local.rankText}>#{rank}</Text>
        </View>
        <View style={local.trendBody}>
          <Text style={local.trendName} numberOfLines={1}>
            {ticker ? stockName(coin) : coin.name}
          </Text>
          <Text style={local.trendMeta} numberOfLines={1}>
            {ticker ? `$${coin.symbol}` : handle}
          </Text>
          <Text style={local.trendValue}>{money(coin.marketCap, coin.marketCapCurrency)}</Text>
        </View>
      </View>
    </Tappable>
  );
}

/** A pre-IPO company and the Juno markets that track it. */
export function CompanyCard({
  company,
  logo,
  live,
  pricing,
  onBuy,
  onOpen,
}: {
  company: TesseraCompany;
  logo: number | { uri: string };
  live: Map<string, Coin>;
  pricing: boolean;
  onBuy: (address: string) => void;
  onOpen: (address: string) => void;
}) {
  const name = company.name.replace(/^T-/, "");
  return (
    <View style={s.card}>
      <View style={local.head}>
        <View style={[local.logoTile, { width: 56, height: 56 }]}>
          <ExpoImage source={logo} style={{ width: 56, height: 56 }} contentFit="cover" accessibilityLabel={`${name} logo`} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={s.ticker} numberOfLines={1}>
            {company.sector}
          </Text>
          <Text style={[s.creatorText, { marginTop: 5 }]} numberOfLines={1}>
            {count(company.holders)} holders · mark {money(company.markPrice, "USD", { compact: false })}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.value}>{bigMoney(company.markValuation)}</Text>
          <Text style={s.valueCaption}>valuation</Text>
        </View>
      </View>

      {company.markets.length === 0 ? (
        <Text style={[s.meta, { marginTop: 12 }]}>No Juno market on {name} yet.</Text>
      ) : (
        company.markets.map((market) => {
          const coin = live.get(market.address);
          const curve = curveInfo((coin?.curve.progress ?? market.progress ?? 0) * 100, Boolean(market.graduated));
          const nav = coin?.nav ?? null;
          return (
            <Tappable key={market.address} onPress={() => onOpen(market.address)} to={0.985}>
              <View style={local.market}>
                <View style={local.head}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.name, { fontSize: 15 }]} numberOfLines={1}>
                      ${market.symbol}
                    </Text>
                    <Text style={s.meta} numberOfLines={1}>
                      {money(coin?.marketCap ?? market.marketCap, coin?.marketCapCurrency ?? market.currency ?? "USD")} cap
                      {nav && nav.impliedUsd !== null ? ` · ${money(nav.impliedUsd, "USD", { compact: false })}/share` : ""}
                    </Text>
                  </View>
                  {nav && nav.deviation !== null ? (
                    <View style={[s.chip, { marginTop: 0, backgroundColor: nav.withinBand ? c.posSoft : c.negSoft }]}>
                      <Text style={[s.chipText, { color: nav.withinBand ? c.pos : c.neg }]}>
                        {nav.deviation >= 0 ? "+" : ""}
                        {(nav.deviation * 100).toFixed(1)}% vs mark
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ marginTop: 8 }}>
                  <Sparkline address={market.address} height={30} />
                </View>
                <View style={local.foot}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={s.track}>
                      <View style={[s.fill, { width: `${curve.width}%` }]} />
                    </View>
                    <Text style={s.meta}>{curve.label}</Text>
                  </View>
                  {market.graduated ? null : <BuyPill onPress={() => onBuy(market.address)} dim={pricing && !coin} />}
                </View>
              </View>
            </Tappable>
          );
        })
      )}
    </View>
  );
}

/** One ranked trader. */
export function TraderCard({ trader, rank, onOpen }: { trader: Trader; rank: number; onOpen: () => void }) {
  const handle = useCreatorHandle(trader.wallet);
  const medal = rank === 1 ? c.lime : rank === 2 ? "#E4E9DF" : rank === 3 ? "#F3DDB8" : null;
  const tone = trader.realised > 0 ? c.pos : trader.realised < 0 ? c.neg : c.text;
  return (
    <Tappable onPress={onOpen} to={0.985}>
      <View style={[s.card, { paddingVertical: 12 }]}>
        <View style={local.head}>
          <View style={[local.rankBadge, medal ? { backgroundColor: medal } : null]}>
            <Text style={local.rankBadgeText}>{rank}</Text>
          </View>
          <Identicon seed={trader.wallet} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[s.name, { fontSize: 15, flexShrink: 1 }]} numberOfLines={1}>
                {handle}
              </Text>
              {trader.isCreator ? (
                <View style={local.creatorTag}>
                  <Text style={local.creatorTagText}>Creator</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.meta} numberOfLines={1}>
              {trader.trades} {trader.trades === 1 ? "trade" : "trades"} · {trader.coins} {trader.coins === 1 ? "coin" : "coins"}
              {trader.winRate === null ? "" : ` · ${Math.round(trader.winRate * 100)}% wins`}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.value, { color: tone }]}>
              {trader.realised > 0 ? "+" : ""}
              {money(trader.realised, "USD")}
            </Text>
            <Text style={s.valueCaption}>holding {money(trader.holding, "USD")}</Text>
          </View>
        </View>
      </View>
    </Tappable>
  );
}

const local = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  foot: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  logoTile: { borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  market: { marginTop: 14, paddingTop: 14, borderTopWidth: theme.hairline, borderTopColor: c.line },
  gradPill: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  gradText: { fontSize: 13, fontWeight: "700", color: c.muted },
  section: { fontSize: 18, fontWeight: "800", color: c.text, letterSpacing: -0.3 },
  trend: { width: 148, height: 196, borderRadius: 20, overflow: "hidden", backgroundColor: c.ink, ...theme.shadow.card },
  rank: { position: "absolute", top: 10, left: 10, height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: c.lime, justifyContent: "center" },
  rankText: { fontSize: 12, fontWeight: "800", color: c.onLime },
  trendBody: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 1 },
  trendName: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.2 },
  trendMeta: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  trendValue: { fontSize: 16, fontWeight: "800", color: c.lime, marginTop: 4, fontVariant: ["tabular-nums"] },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  rankBadgeText: { fontSize: 12, fontWeight: "800", color: c.text },
  creatorTag: { height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: c.limeSoft, justifyContent: "center" },
  creatorTagText: { fontSize: 11, fontWeight: "800", color: c.onLime },
});
