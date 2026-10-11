import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { QuickTrade } from "../../components/QuickTrade";
import { CoinCard, CompanyCard, stockName, TraderCard, Trending } from "../../components/trade/cards";
import {
  Banner,
  CardSkeleton,
  clearCoinDetails,
  EmptyState,
  IconButton,
  PillTabs,
  SearchField,
} from "../../components/trade/parts";
import { juno, type Coin, type Trader } from "../../lib/api";
import { useLinkedState } from "../../lib/linked";
import { invalidateMarkets, loadMarkets } from "../../lib/markets";
import { useApi } from "../../lib/useApi";
import { useViewerOnce } from "../../lib/social";
import { theme } from "../../theme";

type Sort = "preipo" | "stocks" | "memes" | "traders";
type Order = "top" | "new" | "graduating";

const SORTS = [
  { id: "preipo" as const, label: "Pre-IPO" },
  { id: "stocks" as const, label: "Stocks" },
  { id: "memes" as const, label: "Memes" },
  { id: "traders" as const, label: "Traders" },
];

const ORDERS = [
  { id: "top" as const, label: "Top" },
  { id: "new" as const, label: "Newest" },
  { id: "graduating" as const, label: "Near graduation" },
];

const BANNERS: Record<Exclude<Sort, "traders">, string> = {
  preipo: "Own the curve before the IPO, priced against each company's Tessera mark.",
  stocks: "Listed names on a curve, marked against the live Pyth price.",
  memes: "Every post is a market. Early buyers ride the curve, creators earn the fees.",
};

const COMPANY_LOGOS: Record<string, number> = {
  "T-OpenAI": require("../../assets/logos/openai.png"),
  "T-Kalshi": require("../../assets/logos/kalshi.png"),
  "T-SpaceX": require("../../assets/logos/spacex.png"),
};

/** A banner, once per tab: dismissed for good, or after it has been seen once. */
function useBanner(sort: Sort) {
  const key = `juno.trade.banner.v2.${sort}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    setShow(false);
    if (sort === "traders") return;
    SecureStore.getItemAsync(key)
      .then((seen) => {
        if (!live || seen) return;
        setShow(true);
        void SecureStore.setItemAsync(key, "1");
      })
      .catch(() => live && setShow(true));
    return () => {
      live = false;
    };
  }, [key, sort]);
  return { show, dismiss: () => setShow(false) };
}

function matches(query: string, ...fields: Array<string | null | undefined>) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function order(list: Coin[], by: Order): Coin[] {
  const copy = [...list];
  if (by === "new") copy.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  else if (by === "graduating") copy.sort((a, b) => b.curve.progress - a.curve.progress);
  else copy.sort((a, b) => b.marketCap - a.marketCap);
  return copy;
}

/** Heat for the trending rail: what people are doing with it, then how big it is. */
function trending(list: Coin[]): Coin[] {
  return [...list]
    .sort(
      (a, b) =>
        (b.likes ?? 0) + (b.commentCount ?? 0) * 2 - ((a.likes ?? 0) + (a.commentCount ?? 0) * 2) ||
        b.marketCap - a.marketCap,
    )
    .slice(0, 5);
}

/**
 * Trade: every market on Juno as a trading feed.
 *
 * Pre-IPO companies (Meteora curves marked against Tessera), listed stocks
 * (marked against Pyth), memes (posts launched as coins) and the traders
 * board. Every Buy opens the same quick-trade sheet over this screen.
 */
export default function TradeScreen() {
  const router = useRouter();
  const [sort, setSort] = useLinkedState<Sort>(
    "sort",
    SORTS.map((option) => option.id),
    "preipo",
  );
  const onTraders = sort === "traders";
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [by, setBy] = useState<Order>("top");
  const banner = useBanner(sort);

  const once = useViewerOnce();
  const markets = useApi(
    () => (onTraders || !once.ready ? Promise.resolve(null) : loadMarkets(once.viewer())),
    [onTraders, once.ready],
  );
  const tessera = useApi(() => (sort === "preipo" ? juno.tessera() : Promise.resolve(null)), [sort]);
  const board = useApi(() => (onTraders ? juno.leaderboard(25) : Promise.resolve(null)), [onTraders]);
  const [trade, setTrade] = useState<Coin | null>(null);

  const byAddress = useMemo(() => {
    const map = new Map<string, Coin>();
    for (const coin of [...(markets.data?.preipo ?? []), ...(markets.data?.stocks ?? []), ...(markets.data?.posts ?? [])]) {
      map.set(coin.address, coin);
    }
    return map;
  }, [markets.data]);

  const openTrade = (address: string) => {
    const coin = byAddress.get(address);
    if (coin) setTrade(coin);
    else router.push(`/coin/${address}`);
  };

  const refresh = () => {
    invalidateMarkets();
    clearCoinDetails();
    markets.refresh();
    tessera.refresh();
    if (onTraders) board.refresh();
  };

  const refreshControl = (
    <RefreshControl
      refreshing={markets.refreshing || tessera.refreshing || board.refreshing}
      onRefresh={refresh}
      tintColor={theme.colors.muted}
    />
  );

  const list = useMemo(() => {
    if (!markets.data || onTraders || sort === "preipo") return [];
    const source = sort === "stocks" ? markets.data.stocks : markets.data.posts;
    return order(
      source.filter((coin) => matches(query, coin.name, coin.symbol, sort === "stocks" ? stockName(coin) : null)),
      by,
    );
  }, [markets.data, sort, onTraders, query, by]);

  const top = useMemo(() => {
    if (!markets.data || query || sort === "preipo" || onTraders) return [];
    return trending(sort === "stocks" ? markets.data.stocks : markets.data.posts);
  }, [markets.data, sort, onTraders, query]);

  const skeletons = (
    <View style={styles.list}>
      {[0, 1, 2].map((i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );

  const bannerView =
    banner.show && sort !== "traders" ? <Banner text={BANNERS[sort]} onClose={banner.dismiss} /> : null;

  let body: React.ReactNode;
  if (onTraders) {
    const traders: Trader[] = (board.data?.traders ?? []).filter((t) => matches(query, t.wallet));
    body = board.loading ? (
      skeletons
    ) : board.error ? (
      <EmptyState tone="error" line="The leaderboard didn't load." cta="Try again" onPress={board.refresh} />
    ) : (
      <ScrollView key={sort} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {board.data?.partial ? (
          <Text style={styles.note}>Still catching up on a few pools. Pull down to refresh.</Text>
        ) : null}
        {traders.length === 0 ? (
          <EmptyState
            line={board.data?.partial ? "Trades are still loading." : "Nobody has traded yet. Be the first."}
            cta={board.data?.partial ? "Refresh" : "Browse memes"}
            onPress={board.data?.partial ? board.refresh : () => setSort("memes")}
          />
        ) : (
          traders.map((trader, index) => (
            <TraderCard
              key={trader.wallet}
              trader={trader}
              rank={index + 1}
              onOpen={() => router.push(`/trader/${trader.wallet}` as never)}
            />
          ))
        )}
      </ScrollView>
    );
  } else if (sort === "preipo") {
    const companies = (tessera.data?.tokens ?? []).filter((company) => matches(query, company.name, company.sector));
    body = tessera.loading ? (
      skeletons
    ) : tessera.error ? (
      <EmptyState tone="error" line="Pre-IPO marks didn't load." cta="Try again" onPress={tessera.refresh} />
    ) : (
      <ScrollView key={sort} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {bannerView}
        {companies.length === 0 ? (
          <EmptyState line={query ? `Nothing matches “${query}”.` : "No pre-IPO companies yet."} />
        ) : (
          companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              logo={COMPANY_LOGOS[company.id] ?? { uri: `https://cdn.tesseralab.co/tessera/tokenicon_${company.id}.svg` }}
              live={byAddress}
              pricing={!markets.data}
              onBuy={openTrade}
              onOpen={(address) => router.push(`/coin/${address}`)}
            />
          ))
        )}
        <Text style={styles.fine}>
          Marks are Tessera&apos;s published prices, read live. A T-token is a loan participation right, not a share.
        </Text>
      </ScrollView>
    );
  } else if (markets.loading || markets.data === null) {
    body = skeletons;
  } else if (markets.error) {
    body = <EmptyState tone="error" line="Markets didn't load." cta="Try again" onPress={markets.refresh} />;
  } else {
    body = (
      <ScrollView key={sort} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {bannerView}
        {top.length > 1 ? <Trending coins={top} onOpen={(coin) => router.push(`/coin/${coin.address}`)} /> : null}
        {(markets.data.missing ?? 0) > 0 ? (
          <Text style={styles.note}>
            {markets.data.missing} more {markets.data.missing === 1 ? "market is" : "markets are"} still loading. Pull down to refresh.
          </Text>
        ) : null}
        {top.length > 1 && list.length > 0 ? <Text style={styles.section}>{sort === "stocks" ? "All stocks" : "All memes"}</Text> : null}
        {list.length === 0 ? (
          query ? (
            <EmptyState line={`Nothing matches “${query}”.`} cta="Clear search" onPress={() => setQuery("")} />
          ) : sort === "stocks" ? (
            <EmptyState line="No stock markets yet." />
          ) : (
            <EmptyState line="No memes yet. Post something and it becomes a market." cta="Post" onPress={() => router.push("/(tabs)/post" as never)} />
          )
        ) : (
          list.map((coin) => (
            <CoinCard
              key={coin.address}
              coin={coin}
              stock={sort === "stocks"}
              onOpen={() => router.push(`/coin/${coin.address}`)}
              onBuy={() => setTrade(coin)}
            />
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Trade</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <IconButton
            kind="search"
            label="Search"
            active={searching}
            onPress={() => {
              if (searching) setQuery("");
              setSearching(!searching);
            }}
          />
          <IconButton kind="filter" label="Sort" active={filtering} onPress={() => setFiltering(!filtering)} />
        </View>
      </View>
      {searching ? <SearchField value={query} onChange={setQuery} /> : null}
      <PillTabs items={SORTS} value={sort} onChange={setSort} />
      {filtering && (sort === "memes" || sort === "stocks") ? (
        <View style={styles.orders}>
          {ORDERS.map((o) => (
            <Text
              key={o.id}
              onPress={() => setBy(o.id)}
              style={[styles.order, by === o.id ? styles.orderOn : null]}
              accessibilityRole="button"
            >
              {o.label}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ height: 12 }} />
      {body}

      {trade ? (
        <QuickTrade
          coin={trade}
          side="buy"
          onClose={() => setTrade(null)}
          onDone={() => {
            setTrade(null);
            invalidateMarkets();
            clearCoinDetails();
            markets.refresh();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "800", color: theme.colors.text, letterSpacing: -1 },
  list: { width: "100%", paddingHorizontal: 16, paddingBottom: 130, gap: 14 },
  section: { fontSize: 18, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.3, marginTop: 4 },
  note: { fontSize: 12, color: theme.colors.muted, paddingHorizontal: 4 },
  fine: { fontSize: 12, lineHeight: 16, color: theme.colors.faint, paddingHorizontal: 4 },
  orders: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 10 },
  order: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  orderOn: { backgroundColor: theme.colors.ink, color: theme.colors.onInk },
});
