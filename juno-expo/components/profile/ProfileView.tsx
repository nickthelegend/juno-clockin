import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { CoinArt, Identicon } from "../art";
import { BottomSheet } from "../BottomSheet";
import { ClockInCard, formatSkr } from "../ClockInCard";
import { ChevronLeft, Delta, Segmented } from "../kit";
import { QuickTrade } from "../QuickTrade";
import { NameEditor, WalletCard } from "../WalletCard";
import {
  BoltGlyph,
  CameraGlyph,
  CoinsGlyph,
  FlameGlyph,
  GearGlyph,
  GridGlyph,
  LinkGlyph,
  ReelsGlyph,
  ShieldGlyph,
} from "./glyphs";
import { PlansTab, WatchingTab } from "./SavedLists";
import { juno, type Coin, type Position } from "../../lib/api";
import { findSeekerGenesisToken, readWalletActivity, type BoostGiven } from "../../lib/clockin";
import { useClockIn } from "../../lib/clockinContext";
import { count, loadMarkets } from "../../lib/markets";
import { shortAddress, useName } from "../../lib/names";
import { appUrl, useFollow } from "../../lib/social";
import { explorerTx, SKR_DEVNET_MINT, SKR_LABEL, SKR_SHORT, tokenBalance } from "../../lib/solana";
import { money, tokens, useApi } from "../../lib/useApi";
import { useWallet } from "../../lib/wallet";
import { theme } from "../../theme";

/**
 * A profile, laid out the way people already read one: Instagram's structure
 * in Juno's own colours.
 *
 * Avatar with a story ring (lit when the streak is alive today), counts beside
 * it, a name, a bio and a link, a row of buttons, story highlights, then a
 * sticky tab bar over a grid. The same view serves your own profile and
 * anyone else's; only the buttons and the settings sheet differ.
 *
 * Every number is read, not invented: posts and their thumbnails from the
 * market list, followers from the follow graph, the streak and boosts from
 * the wallet's own signed memos on devnet, dSKR from its token account, coins
 * from the portfolio read. A read that fails shows a dash, never a zero.
 */

type TabId = "grid" | "reels" | "boosted" | "holdings";
const TABS: Array<{ id: TabId; label: string; Icon: (p: { color: string; size?: number }) => React.ReactElement }> = [
  { id: "grid", label: "Posts", Icon: GridGlyph },
  { id: "reels", label: "Reels", Icon: ReelsGlyph },
  { id: "boosted", label: "Boosted", Icon: (p) => <BoltGlyph {...p} /> },
  { id: "holdings", label: "Holdings", Icon: CoinsGlyph },
];

type Highlight = "streak" | "skr" | "boosts" | "seeker" | "coins";

export function ProfileView({
  wallet,
  self,
  onBack,
  holdingsHeader,
}: {
  wallet: string;
  self: boolean;
  onBack?: () => void;
  /** Extra content above the Holdings list, e.g. a trader's realised P&L record. */
  holdingsHeader?: React.ReactNode;
}) {
  const router = useRouter();
  const me = useWallet();
  const daily = useClockIn();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const name = useName(wallet);
  const follow = useFollow(wallet);

  const [tab, setTab] = useState<TabId>("grid");
  const [sheet, setSheetState] = useState<Highlight | "settings" | "edit" | null>(null);
  /*
   * Each opening gets a fresh sheet instance. One shared BottomSheet whose
   * content changed while it closed re-measured itself mid-animation and then
   * reopened off-screen; a new key per opening avoids that state entirely.
   */
  const [sheetKey, setSheetKey] = useState(0);
  // What the sheet shows. Kept after a close so the content does not vanish
  // (and the sheet re-measure) while it is still sliding away.
  const [shown, setShown] = useState<Highlight | "settings" | "edit" | null>(null);
  const setSheet = useCallback((next: Highlight | "settings" | "edit" | null) => {
    if (next) {
      setSheetKey((k) => k + 1);
      setShown(next);
    }
    setSheetState(next);
  }, []);
  const [trading, setTrading] = useState<Coin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* ------------------------------ reads ------------------------------ */

  const markets = useApi(() => loadMarkets(me.address), [wallet]);
  const stats = useApi(() => juno.followStats(wallet, me.address), [wallet, me.address]);
  const portfolio = useApi(() => juno.portfolio(wallet), [wallet]);
  const activity = useApi(() => readWalletActivity(wallet), [wallet, self ? daily.lastResult?.signature : null]);
  const skr = useApi(() => tokenBalance(wallet, SKR_DEVNET_MINT), [wallet, self ? daily.skr : null]);
  const [otherSeeker, setOtherSeeker] = useState<string | null>(null);
  useEffect(() => {
    if (self) return;
    let live = true;
    findSeekerGenesisToken(wallet)
      .then((mint) => live && setOtherSeeker(mint))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wallet, self]);

  const refresh = useCallback(() => {
    markets.refresh();
    stats.refresh();
    portfolio.refresh();
    activity.refresh();
    skr.refresh();
    if (self) void daily.refresh();
  }, [markets, stats, portfolio, activity, skr, self, daily]);

  /* ---------------------------- derived ----------------------------- */

  const allPosts = useMemo(() => markets.data?.posts ?? [], [markets.data]);
  const byAddress = useMemo(() => new Map(allPosts.map((coin) => [coin.address, coin])), [allPosts]);
  const posts = useMemo(
    () =>
      allPosts
        .filter((coin) => coin.creator.wallet === wallet)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [allPosts, wallet],
  );
  const reels = useMemo(() => posts.filter((coin) => coin.format === "reel" && coin.media.kind === "video"), [posts]);
  /** A still for a held coin: the post's poster when we know the post, never a video URL. */
  const artFor = (position: Position) => {
    const coin = byAddress.get(position.baseMint);
    if (coin) return juno.still(coin.media);
    return position.mediaMime?.startsWith("video") ? null : juno.media(position.mediaUrl);
  };
  const boostsGiven: BoostGiven[] = activity.data?.boosts ?? [];
  const boostTotal = boostsGiven.reduce((sum, b) => sum + b.amount, 0);
  const received = activity.data?.received ?? null;
  const positions = portfolio.data?.positions ?? [];

  // Your own streak comes from the shared clock-in state, so it updates the
  // moment you clock in; anyone else's is read from their memos.
  const clock = self && daily.state.data ? daily.state.data : (activity.data?.clockins ?? null);
  const streak = clock?.streak ?? 0;
  const liveToday = clock?.clockedToday ?? false;
  const seekerMint = self ? daily.seekerMint : otherSeeker;
  const skrBalance = self && daily.skr !== null ? daily.skr : (skr.data ?? null);
  const creatorCoin = posts[0] ?? null;

  const followers =
    stats.data === null
      ? null
      : stats.data.followers +
        (follow.following === true && stats.data.viewerFollows === false ? 1 : 0) -
        (follow.following === false && stats.data.viewerFollows === true ? 1 : 0);

  const displayName = name ?? shortAddress(wallet);
  const handle = name ? `@${name}` : shortAddress(wallet);
  const bio = useMemo(() => {
    const parts: string[] = [];
    if (posts.length > 0) parts.push(`Creator of ${posts.length} ${posts.length === 1 ? "market" : "markets"}`);
    if (streak > 0) parts.push(`${streak}-day streak`);
    if (boostsGiven.length > 0) parts.push(`backing ${boostsGiven.length} ${boostsGiven.length === 1 ? "post" : "posts"}`);
    if (parts.length === 0) {
      return self ? "New on Juno. Clock in daily to earn dSKR, then back the posts you believe in." : "On Juno.";
    }
    return parts.join(" · ");
  }, [posts.length, streak, boostsGiven.length, self]);

  /* ----------------------------- actions ---------------------------- */

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1600);
  };

  const shareProfile = async () => {
    const url = `${appUrl()}/trader/${wallet}`;
    const deep = `juno://trader/${wallet}`;
    const message = `${displayName} on Juno: every post is a market. ${url}\nIn the app: ${deep}`;
    try {
      await Share.share(Platform.OS === "ios" ? { message, url } : { message });
    } catch {
      await Clipboard.setStringAsync(url).catch(() => undefined);
      flash("Link copied");
    }
  };

  const chooseTab = (next: TabId) => {
    if (next === tab) return;
    void Haptics.selectionAsync().catch(() => undefined);
    setTab(next);
  };

  // Swipe sideways over the content to move between tabs, as in Instagram.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-28, 28])
        .failOffsetY([-14, 14])
        .runOnJS(true)
        .onEnd((event) => {
          const index = TABS.findIndex((t) => t.id === tab);
          if (event.translationX < -60 && index < TABS.length - 1) chooseTab(TABS[index + 1]!.id);
          if (event.translationX > 60 && index > 0) chooseTab(TABS[index - 1]!.id);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab],
  );

  const tile = Math.floor((width - 4) / 3);
  const bottomPad = self ? 140 : 40 + insets.bottom;

  /* ------------------------------ render ----------------------------- */

  return (
    <View style={styles.page}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        refreshControl={
          <RefreshControl
            refreshing={markets.refreshing || portfolio.refreshing || activity.refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.muted}
          />
        }
      >
        {/* 0: everything above the tabs */}
        <View style={{ paddingTop: insets.top }}>
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
                <ChevronLeft />
              </Pressable>
            ) : null}
            <Text style={styles.topHandle} numberOfLines={1}>
              {self && !name ? "Your profile" : handle}
            </Text>
            {seekerMint ? (
              <View style={styles.verified}>
                <ShieldGlyph size={14} color={theme.colors.ink} />
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {self ? (
              <Pressable
                onPress={() => router.push("/(tabs)/post?format=post" as never)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="New post"
                style={styles.topIcon}
              >
                <Text style={styles.plus}>＋</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Header row: avatar with story ring, then the counts */}
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => setSheet("streak")}
              accessibilityRole="button"
              accessibilityLabel={liveToday ? `Streak alive, ${streak} days` : "Streak"}
            >
              <StoryRing size={92} state={liveToday ? "live" : streak > 0 ? "risk" : "none"}>
                <Identicon seed={wallet} size={80} label={name ?? wallet.slice(0, 2)} />
              </StoryRing>
            </Pressable>
            <View style={styles.stats}>
              {self && !markets.loading && posts.length === 0 ? (
                <StatCta glyph="plus" label="First post" onPress={() => router.push("/(tabs)/post?format=post" as never)} />
              ) : (
                <StatCell value={markets.loading ? null : posts.length} label="Posts" />
              )}
              {self && followers === 0 && stats.data?.following === 0 ? (
                <StatCta glyph="people" label="Find creators" wide onPress={() => router.push("/(tabs)/social" as never)} />
              ) : (
                <>
                  <StatCell value={followers} label="Followers" />
                  <StatCell value={stats.data ? stats.data.following : null} label="Following" />
                </>
              )}
              {self && activity.data && boostsGiven.length === 0 ? (
                <StatCta glyph="bolt" label="Boost a post" onPress={() => router.push("/(tabs)/social" as never)} />
              ) : (
                <StatCell
                  value={activity.data ? boostsGiven.reduce((n, b) => n + b.count, 0) : null}
                  label="Boosts"
                  onPress={() => chooseTab("boosted")}
                />
              )}
            </View>
          </View>

          {/* Identity */}
          <View style={styles.identity}>
            {name ? <Text style={styles.name}>{displayName}</Text> : null}
            {name ? <Text style={styles.subHandle}>{shortAddress(wallet)}</Text> : null}
            {self && !name ? (
              <Pressable
                onPress={() => setSheet("edit")}
                style={({ pressed }) => [styles.namePrompt, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                accessibilityRole="button"
                accessibilityLabel="Choose a name"
              >
                <Text style={styles.namePromptTitle}>Choose a name</Text>
                <Text style={styles.namePromptSub}>So people see you, not {shortAddress(wallet)}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.bio}>{bio}</Text>
            {creatorCoin ? (
              <Pressable
                onPress={() => router.push(`/coin/${creatorCoin.address}` as never)}
                style={styles.linkChip}
                accessibilityRole="link"
              >
                <LinkGlyph size={13} color={theme.colors.focus} />
                <Text style={styles.linkText}>
                  ${creatorCoin.symbol} · {money(creatorCoin.marketCap, creatorCoin.marketCapCurrency)} mkt cap
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            {self ? (
              <>
                <Btn label="Edit profile" onPress={() => setSheet("edit")} />
                <Btn label="Share profile" onPress={() => void shareProfile()} />
                <IconBtn onPress={() => setSheet("settings")} label="Wallet and settings">
                  <GearGlyph size={18} />
                </IconBtn>
              </>
            ) : (
              <>
                {follow.self ? (
                  <Btn label="This is you" onPress={() => undefined} />
                ) : (
                  <Btn
                    label={follow.following === null ? "…" : follow.following ? "Following" : "Follow"}
                    primary={follow.following === false}
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      void follow.toggle();
                    }}
                  />
                )}
                {creatorCoin && !creatorCoin.curve.graduated ? (
                  <Btn label={`Buy $${creatorCoin.symbol}`} onPress={() => setTrading(creatorCoin)} />
                ) : (
                  <Btn label="Share profile" onPress={() => void shareProfile()} />
                )}
                <IconBtn onPress={() => void shareProfile()} label="Share profile">
                  <LinkGlyph size={16} />
                </IconBtn>
              </>
            )}
          </View>

          {/* Highlights */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlights}>
            <HighlightBubble
              label={streak > 0 ? `${streak}d streak` : "Streak"}
              tone={liveToday ? "lime" : "ink"}
              onPress={() => setSheet("streak")}
            >
              <FlameGlyph size={26} color={liveToday ? theme.colors.ink : theme.colors.lime} />
              <Text style={[styles.bubbleNumber, { color: liveToday ? theme.colors.ink : theme.colors.lime }]}>
                {streak}
              </Text>
            </HighlightBubble>
            <HighlightBubble label={SKR_SHORT} tone="ink" onPress={() => setSheet("skr")}>
              <Text style={styles.bubbleBig}>{skrBalance === null ? "—" : formatSkr(skrBalance)}</Text>
            </HighlightBubble>
            {/* The amount, not the count: the stats row above already counts boosts. */}
            <HighlightBubble label="Boosted" tone="soft" onPress={() => setSheet("boosts")}>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.bubbleAmount}>{activity.data ? formatSkr(boostTotal) : "—"}</Text>
                <Text style={styles.bubbleUnit}>{SKR_SHORT}</Text>
              </View>
            </HighlightBubble>
            {seekerMint ? (
              <HighlightBubble label="Seeker" tone="lime" onPress={() => setSheet("seeker")}>
                <ShieldGlyph size={26} />
              </HighlightBubble>
            ) : null}
            <HighlightBubble label="Coins" tone="soft" onPress={() => setSheet("coins")}>
              <CoinsGlyph size={22} color={theme.colors.ink} />
              <Text style={styles.bubbleSmall}>{portfolio.data ? positions.length : "—"}</Text>
            </HighlightBubble>
          </ScrollView>
        </View>

        {/* 1: sticky tabs (wrapped: the sticky container must not own the row layout) */}
        <View>
        <View style={styles.tabBar}>
          {TABS.map(({ id, label, Icon }) => {
            const on = tab === id;
            return (
              <Pressable
                key={id}
                onPress={() => chooseTab(id)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: on }}
              >
                <Icon size={22} color={on ? theme.colors.text : theme.colors.faint} />
                <View style={[styles.tabLine, on ? styles.tabLineOn : null]} />
              </Pressable>
            );
          })}
        </View>
        </View>

        {/* 2: the tab's content, swipeable */}
        <GestureDetector gesture={swipe}>
          <View style={{ minHeight: 360 }}>
            {tab === "grid" ? (
              markets.loading ? (
                <SkeletonGrid tile={tile} />
              ) : posts.length === 0 ? (
                <Empty
                  icon={<CameraGlyph />}
                  title={self ? "Share your first post" : "No posts yet"}
                  detail={self ? "Every photo you share becomes its own market on Solana." : "When they post, their markets show up here."}
                  action={self ? { label: "Post a photo", onPress: () => router.push("/(tabs)/post?format=post" as never) } : undefined}
                />
              ) : (
                <Grid>
                  {posts.map((coin) => (
                    <Tile key={coin.address} coin={coin} size={tile} onPress={() => router.push(`/coin/${coin.address}` as never)} />
                  ))}
                </Grid>
              )
            ) : tab === "reels" ? (
              markets.loading ? (
                <SkeletonGrid tile={tile} tall />
              ) : reels.length === 0 ? (
                <Empty
                  icon={<ReelsGlyph size={34} />}
                  title={self ? "Share your first reel" : "No reels yet"}
                  detail={self ? "Post a video and it launches its own bonding curve." : "Their videos will show up here."}
                  action={self ? { label: "Post a reel", onPress: () => router.push("/(tabs)/post?format=reel" as never) } : undefined}
                />
              ) : (
                <Grid>
                  {reels.map((coin) => (
                    <Tile
                      key={coin.address}
                      coin={coin}
                      size={tile}
                      tall
                      onPress={() => router.push(`/(tabs)/reels?start=${coin.address}` as never)}
                    />
                  ))}
                </Grid>
              )
            ) : tab === "boosted" ? (
              activity.loading ? (
                <SkeletonGrid tile={tile} />
              ) : boostsGiven.length === 0 ? (
                <Empty
                  icon={<BoltGlyph size={34} />}
                  title="No boosts yet"
                  detail={
                    self
                      ? "Spend the dSKR you earn clocking in on posts you believe in. They collect here."
                      : "Posts they back with dSKR will show up here."
                  }
                  action={self ? { label: "Find a post", onPress: () => router.push("/(tabs)/social" as never) } : undefined}
                />
              ) : (
                <Grid>
                  {boostsGiven.map((boost) => {
                    const coin = byAddress.get(boost.coin);
                    return (
                      <Tile
                        key={boost.coin}
                        coin={coin ?? null}
                        seed={boost.coin}
                        size={tile}
                        badge={formatSkr(boost.amount)}
                        onPress={() => router.push(`/coin/${boost.coin}` as never)}
                      />
                    );
                  })}
                </Grid>
              )
            ) : (
              <HoldingsTab
                header={holdingsHeader}
                self={self}
                wallet={wallet}
                loading={portfolio.loading}
                error={portfolio.error}
                partial={portfolio.data?.partial ?? false}
                totalValue={portfolio.data?.totalValue ?? null}
                totalPnlPct={portfolio.data?.totalPnlPct ?? null}
                currency={portfolio.data?.currency === "mixed" ? "USD" : (portfolio.data?.currency ?? "USD")}
                positions={positions}
                artFor={artFor}
                onOpen={(mint) => router.push(`/coin/${mint}` as never)}
              />
            )}
          </View>
        </GestureDetector>
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Sheets */}
      <BottomSheet key={sheetKey} visible={sheet !== null} onClose={() => setSheet(null)}>
        <View style={[styles.sheet, { paddingBottom: 30 + (self ? 80 : insets.bottom) }]}>
          {shown === "streak" ? (
            self ? (
              <>
                <SheetTitle title={streak > 0 ? `${streak}-day streak` : "Start a streak"} />
                <ClockInCard compact />
              </>
            ) : (
              <>
                <SheetTitle title={streak > 0 ? `${streak}-day streak` : "No streak right now"} />
                <Text style={styles.sheetBody}>
                  {clock
                    ? `Best ${clock.best} · ${clock.total} ${clock.total === 1 ? "day" : "days"} clocked in on-chain${liveToday ? " · clocked in today" : ""}.`
                    : "Reading their clock-ins from devnet…"}
                </Text>
                {clock?.entries[0] ? (
                  <Text style={styles.sheetLink} onPress={() => void Linking.openURL(explorerTx(clock.entries[0]!.signature))}>
                    Latest clock-in on Solscan
                  </Text>
                ) : null}
              </>
            )
          ) : shown === "skr" ? (
            <>
              <SheetTitle title={`${skrBalance === null ? "—" : formatSkr(skrBalance)} ${SKR_SHORT}`} />
              <Text style={styles.sheetBody}>
                Earned by clocking in every day (10 on day one, up to 40 on day seven, double on Seeker) and spent boosting posts:
                80% to the creator, 20% back to the reward treasury. On devnet this is a stand-in mint with SKR's 6 decimals.
              </Text>
              <Text
                style={styles.sheetLink}
                onPress={() => void Linking.openURL(`https://solscan.io/token/${SKR_DEVNET_MINT.toBase58()}?cluster=devnet`)}
              >
                The dSKR mint on Solscan
              </Text>
            </>
          ) : shown === "boosts" ? (
            <>
              <SheetTitle
                title={`${formatSkr(boostTotal)} ${SKR_SHORT} across ${boostsGiven.reduce((n, b) => n + b.count, 0)} ${
                  boostsGiven.reduce((n, b) => n + b.count, 0) === 1 ? "boost" : "boosts"
                }`}
              />
              {received && received.count > 0 ? (
                <Text style={styles.sheetBody}>
                  Their posts have received {received.count} {received.count === 1 ? "boost" : "boosts"}, about{" "}
                  {formatSkr(received.amount)} {SKR_SHORT} paid to this wallet (the creator's 80%).
                </Text>
              ) : null}
              {boostsGiven.length === 0 ? (
                <Text style={styles.sheetBody}>Nothing boosted yet. Tap the bolt on any post to back it with dSKR.</Text>
              ) : (
                boostsGiven.slice(0, 6).map((boost) => {
                  const coin = byAddress.get(boost.coin);
                  return (
                    <Pressable
                      key={boost.coin}
                      style={styles.sheetRow}
                      onPress={() => {
                        setSheet(null);
                        router.push(`/coin/${boost.coin}` as never);
                      }}
                    >
                      <CoinArt uri={coin ? juno.still(coin.media) : null} seed={boost.coin} size={38} radius={10} />
                      <Text style={styles.sheetRowTitle} numberOfLines={1}>
                        {coin ? coin.name : shortAddress(boost.coin)}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <BoltGlyph size={14} color={theme.colors.text} filled />
                        <Text style={styles.sheetRowValue}>{formatSkr(boost.amount)}</Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </>
          ) : shown === "seeker" ? (
            <>
              <SheetTitle title="Seeker verified" />
              <Text style={styles.sheetBody}>
                This wallet holds a Seeker Genesis Token (read from mainnet, no transaction). Seeker owners earn double dSKR on
                every clock-in.
              </Text>
              {seekerMint ? <Text style={styles.mono}>{seekerMint}</Text> : null}
            </>
          ) : shown === "coins" ? (
            <>
              <SheetTitle
                title={
                  portfolio.data
                    ? `${positions.length} ${positions.length === 1 ? "coin" : "coins"} · ${
                        portfolio.data.totalValue === null ? "—" : money(portfolio.data.totalValue, "USD", { compact: false })
                      }`
                    : "Reading holdings…"
                }
              />
              {positions.slice(0, 5).map((position) => (
                <Pressable
                  key={position.baseMint}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSheet(null);
                    router.push(`/coin/${position.baseMint}` as never);
                  }}
                >
                  <CoinArt uri={artFor(position)} seed={position.baseMint} size={38} radius={10} />
                  <Text style={styles.sheetRowTitle} numberOfLines={1}>
                    {position.name}
                  </Text>
                  <Text style={styles.sheetRowValue}>{money(position.value, position.currency)}</Text>
                </Pressable>
              ))}
              <Text
                style={styles.sheetLink}
                onPress={() => {
                  setSheet(null);
                  chooseTab("holdings");
                }}
              >
                See all holdings
              </Text>
            </>
          ) : shown === "edit" ? (
            <>
              <SheetTitle title="Your name" />
              <Text style={styles.sheetBody}>
                Your name is signed by your wallet, so nobody else can take it. Your bio is written from what you do on Juno.
              </Text>
              <NameEditor address={wallet} />
            </>
          ) : shown === "settings" ? (
            <SettingsBody
              wallet={wallet}
              onDisconnect={async () => {
                setSheet(null);
                await me.disconnect();
              }}
            />
          ) : null}
        </View>
      </BottomSheet>

      {trading ? (
        <QuickTrade
          coin={trading}
          side="buy"
          onClose={() => setTrading(null)}
          onDone={() => {
            setTrading(null);
            portfolio.refresh();
          }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The story ring. Lit (lime to green) when the streak is alive today, a
 * dashed lime ring when there is a streak that today's clock-in would keep,
 * and a hairline otherwise.
 */
function StoryRing({ size, state, children }: { size: number; state: "live" | "risk" | "none"; children: React.ReactNode }) {
  const r = size / 2 - 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#0E9F6E" />
            <Stop offset="0.55" stopColor={theme.colors.lime} />
            <Stop offset="1" stopColor="#F5B400" />
          </LinearGradient>
        </Defs>
        {state === "live" ? (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ring)" strokeWidth={3.5} fill="none" />
        ) : state === "risk" ? (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="#9DBF1E" strokeWidth={2.5} strokeDasharray="6 5" fill="none" />
        ) : (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.lineStrong} strokeWidth={1} fill="none" />
        )}
      </Svg>
      <View
        style={{
          width: size - 12,
          height: size - 12,
          borderRadius: (size - 12) / 2,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function StatCell({ value, label, onPress }: { value: number | null; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.stat} accessibilityLabel={`${value ?? "unknown"} ${label}`}>
      <Text style={styles.statValue}>{value === null ? "—" : count(value) || "0"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

/** A zero, turned into the thing you would do about it. */
function StatCta({
  glyph,
  label,
  onPress,
  wide,
}: {
  glyph: "plus" | "people" | "bolt";
  label: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.statCta, wide ? { minWidth: 112 } : null, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
    >
      <View style={styles.statCtaIcon}>
        {glyph === "bolt" ? (
          <BoltGlyph size={14} color={theme.colors.ink} />
        ) : glyph === "people" ? (
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <Circle cx={9} cy={8} r={3.6} stroke={theme.colors.ink} strokeWidth={2.2} />
            <Path d="M2.5 20c.8-3.6 3.3-5.6 6.5-5.6s5.7 2 6.5 5.6" stroke={theme.colors.ink} strokeWidth={2.2} strokeLinecap="round" />
            <Path d="M16 4.6a3.4 3.4 0 0 1 0 6.6M18.4 14.8c1.7.8 2.7 2.5 3.1 5.2" stroke={theme.colors.ink} strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
        ) : (
          <Text style={styles.statCtaPlus}>+</Text>
        )}
      </View>
      <Text style={styles.statCtaLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, primary ? styles.btnPrimary : null, { opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={styles.btnText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function IconBtn({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.75 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

function HighlightBubble({
  label,
  tone,
  onPress,
  children,
}: {
  label: string;
  tone: "lime" | "ink" | "soft";
  onPress: () => void;
  children: React.ReactNode;
}) {
  const bg = tone === "lime" ? theme.colors.lime : tone === "ink" ? theme.colors.ink : theme.colors.limeSoft;
  return (
    <Pressable onPress={onPress} style={styles.bubbleWrap} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.bubbleRing}>
        <View style={[styles.bubble, { backgroundColor: bg }]}>{children}</View>
      </View>
      <Text style={styles.bubbleLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

function Tile({
  coin,
  seed,
  size,
  tall,
  badge,
  onPress,
}: {
  coin: Coin | null;
  seed?: string;
  size: number;
  tall?: boolean;
  badge?: string;
  onPress: () => void;
}) {
  const uri = coin ? juno.still(coin.media) : null;
  const reel = coin?.format === "reel" && coin.media.kind === "video";
  const h = tall ? Math.round(size * 1.6) : size;
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={coin?.name ?? "Post"}>
      <View style={{ width: size, height: h, backgroundColor: theme.colors.surfaceAlt }}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <CoinArt uri={null} seed={coin?.address ?? seed ?? "juno"} size={Math.round(size * 0.5)} radius={Math.round(size * 0.16)} />
          </View>
        )}
        {reel && !tall ? (
          <View style={styles.tileCorner}>
            <ReelsGlyph size={16} color="#FFFFFF" />
          </View>
        ) : null}
        {badge ? (
          <View style={styles.tileBadge}>
            <BoltGlyph size={12} color={theme.colors.onLime} filled />
            <Text style={styles.tileBadgeText}>{badge}</Text>
          </View>
        ) : null}
        {coin ? (
          <View style={styles.tileFoot}>
            <Text style={styles.tileFootText} numberOfLines={1}>
              ${coin.symbol}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function SkeletonGrid({ tile, tall }: { tile: number; tall?: boolean }) {
  return (
    <Grid>
      {Array.from({ length: 9 }, (_, i) => (
        <View
          key={i}
          style={{ width: tile, height: tall ? Math.round(tile * 1.6) : tile, backgroundColor: theme.colors.surface, opacity: 0.45 + (i % 3) * 0.15 }}
        />
      ))}
    </Grid>
  );
}

function Empty({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action ? (
        <Text style={styles.emptyAction} onPress={action.onPress} accessibilityRole="button">
          {action.label}
        </Text>
      ) : null}
    </View>
  );
}

function SheetTitle({ title }: { title: string }) {
  return <Text style={styles.sheetTitle}>{title}</Text>;
}

function HoldingsTab({
  header,
  self,
  wallet,
  loading,
  error,
  partial,
  totalValue,
  totalPnlPct,
  currency,
  positions,
  artFor,
  onOpen,
}: {
  artFor: (position: Position) => string | null;
  header?: React.ReactNode;
  self: boolean;
  wallet: string;
  loading: boolean;
  error: string | null;
  partial: boolean;
  totalValue: number | null;
  totalPnlPct: number | null;
  currency: string;
  positions: Position[];
  onOpen: (mint: string) => void;
}) {
  const [view, setView] = useState<"coins" | "watching" | "plans">("coins");
  const watching = useApi(
    () => (self && view === "watching" ? juno.watchlist(wallet) : Promise.resolve(null)),
    [self, view, wallet],
  );
  const plans = useApi(() => (self && view === "plans" ? juno.plans(wallet) : Promise.resolve(null)), [self, view, wallet]);

  return (
    <View style={{ padding: 16, gap: 12 }}>
      {header}
      {self ? (
        <View style={{ alignItems: "center" }}>
          <Segmented
            items={[
              { id: "coins" as const, label: "Coins" },
              { id: "watching" as const, label: "Watching" },
              { id: "plans" as const, label: "Plans" },
            ]}
            value={view}
            onChange={setView}
          />
        </View>
      ) : null}

      {view === "watching" ? (
        <WatchingTab state={watching} onOpen={onOpen} />
      ) : view === "plans" ? (
        <PlansTab state={plans} onOpen={onOpen} />
      ) : loading ? (
        <View style={{ gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.holding, { height: 62, backgroundColor: theme.colors.surface, opacity: 0.6 }]} />
          ))}
        </View>
      ) : error ? (
        <Text style={styles.emptyDetail}>{error}</Text>
      ) : positions.length === 0 ? (
        <Empty
          icon={<CoinsGlyph size={34} />}
          title="Nothing held yet"
          detail={partial ? "Some pools would not load, so this may not be everything." : self ? "Buy a post you like and it lands here." : "They hold none of Juno's coins."}
        />
      ) : (
        <>
          <View style={styles.holdTotal}>
            <Text style={styles.statLabel}>Portfolio</Text>
            <Text style={styles.holdTotalValue}>{totalValue === null ? "—" : money(totalValue, currency, { compact: false })}</Text>
            <Delta pct={totalPnlPct} />
          </View>
          {positions.map((position) => (
            <Pressable key={position.baseMint} onPress={() => onOpen(position.baseMint)} style={styles.holding}>
              <CoinArt uri={artFor(position)} seed={position.baseMint} size={42} radius={12} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.sheetRowTitle} numberOfLines={1}>
                  {position.name}
                </Text>
                <Text style={styles.statLabel}>
                  {tokens(position.balance)} ${position.symbol}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={styles.sheetRowValue}>{money(position.value, position.currency)}</Text>
                <Delta pct={position.unrealisedPnlPct} />
              </View>
            </Pressable>
          ))}
          {partial ? <Text style={styles.statLabel}>Some pools would not load — this list may be short.</Text> : null}
        </>
      )}
    </View>
  );
}

function SettingsBody({ wallet, onDisconnect }: { wallet: string; onDisconnect: () => Promise<void> }) {
  const me = useWallet();
  const [busy, setBusy] = useState(false);
  const mode =
    me.mode === "mwa" ? "Mobile Wallet Adapter · devnet" : me.mode === "privy" ? "Privy wallet · devnet" : "Dev wallet (devnet only)";
  const about =
    me.mode === "mwa"
      ? "Your wallet app (Seed Vault on Seeker) holds the key and approves every signature. Juno never sees it."
      : me.mode === "privy"
        ? "Privy holds the key behind your email sign-in, and it survives a reinstall."
        : "A devnet key in this device's keychain. Not recoverable, for testing only. Juno never sees it.";
  return (
    <View style={{ gap: 12 }}>
      <SheetTitle title={mode} />
      <Text style={styles.sheetBody}>{about}</Text>
      <WalletCard address={wallet} />
      <Pressable
        onPress={async () => {
          setBusy(true);
          try {
            await onDisconnect();
          } finally {
            setBusy(false);
          }
        }}
        style={styles.danger}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={theme.colors.neg} /> : null}
        <Text style={styles.dangerText}>{me.mode === "local" ? "Delete dev wallet" : "Disconnect"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 48 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  topHandle: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.4, flexShrink: 1 },
  verified: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.lime, alignItems: "center", justifyContent: "center" },
  topIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.8, borderColor: theme.colors.text, alignItems: "center", justifyContent: "center" },
  plus: { fontSize: 20, fontWeight: "700", color: theme.colors.text, marginTop: -2 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  stats: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center", minWidth: 56, minHeight: 44, justifyContent: "center" },
  statCta: { alignItems: "center", minWidth: 64, minHeight: 44, gap: 3, justifyContent: "center" },
  statCtaIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.lime,
  },
  statCtaPlus: { fontSize: 17, fontWeight: "900", color: theme.colors.ink, marginTop: -2 },
  statCtaLabel: { fontSize: theme.type.caption.size, fontWeight: "700", color: theme.colors.text },
  namePrompt: {
    alignSelf: "flex-start",
    marginTop: 2,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.lime,
  },
  namePromptTitle: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.onLime },
  namePromptSub: { fontSize: theme.type.caption.size, color: theme.colors.onLime, opacity: 0.75 },
  statValue: { fontSize: theme.type.lead.size, fontWeight: "800", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: theme.type.caption.size, color: theme.colors.muted },
  identity: { paddingHorizontal: 16, paddingTop: 10, gap: 2 },
  name: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.text },
  subHandle: { fontSize: theme.type.caption.size, color: theme.colors.muted },
  bio: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.text, marginTop: 2 },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
  },
  linkText: { fontSize: theme.type.caption.size, fontWeight: "700", color: theme.colors.focus },
  buttons: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
  },
  btnPrimary: { backgroundColor: theme.colors.lime },
  btnText: { fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.text },
  iconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  highlights: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12, gap: 14 },
  bubbleWrap: { alignItems: "center", width: 70, gap: 5 },
  bubbleRing: { width: 66, height: 66, borderRadius: 33, borderWidth: 1, borderColor: theme.colors.lineStrong, alignItems: "center", justifyContent: "center" },
  bubble: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 2 },
  bubbleNumber: { fontSize: 15, fontWeight: "900" },
  bubbleBig: { fontSize: 16, fontWeight: "900", color: theme.colors.lime, fontVariant: ["tabular-nums"] },
  bubbleAmount: { fontSize: 16, fontWeight: "900", color: theme.colors.ink, fontVariant: ["tabular-nums"] },
  bubbleUnit: { fontSize: 12, fontWeight: "800", color: theme.colors.ink, marginTop: -1 },
  bubbleSmall: { fontSize: 12, fontWeight: "800", color: theme.colors.ink },
  bubbleLabel: { fontSize: 12, fontWeight: "600", color: theme.colors.text },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.lineStrong,
  },
  tab: { flex: 1, alignItems: "center", paddingTop: 10, gap: 8 },
  tabLine: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  tabLineOn: { backgroundColor: theme.colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 2, paddingTop: 2 },
  tileCorner: { position: "absolute", top: 6, right: 6 },
  tileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.lime,
  },
  tileBadgeText: { fontSize: 12, fontWeight: "900", color: theme.colors.onLime },
  tileFoot: { position: "absolute", left: 6, bottom: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "rgba(7,8,10,0.55)" },
  tileFootText: { fontSize: 12, fontWeight: "800", color: "#FFFFFF" },
  empty: { alignItems: "center", paddingHorizontal: 32, paddingTop: 42, gap: 8 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: theme.colors.text,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: theme.type.heading.size, fontWeight: "900", color: theme.colors.text, letterSpacing: -0.5, textAlign: "center" },
  emptyDetail: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.muted, textAlign: "center" },
  emptyAction: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.focus, marginTop: 6 },
  holding: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  holdTotal: { alignItems: "center", gap: 2, paddingVertical: 4 },
  holdTotalValue: { fontSize: theme.type.screen.size, fontWeight: "900", color: theme.colors.text, letterSpacing: -0.8 },
  sheet: { gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  sheetKicker: { fontSize: 12, letterSpacing: 1.4, fontWeight: "800", color: theme.colors.muted },
  sheetTitle: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.text },
  sheetBody: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.muted },
  sheetLink: { fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.focus },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetRowTitle: { flex: 1, fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.text },
  sheetRowValue: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  mono: { fontSize: 12, color: theme.colors.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  danger: {
    flexDirection: "row",
    gap: 8,
    height: 46,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.negSoft,
  },
  dangerText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.neg },
  toast: {
    position: "absolute",
    alignSelf: "center",
    bottom: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.ink,
  },
  toastText: { color: theme.colors.onInk, fontWeight: "700" },
});
