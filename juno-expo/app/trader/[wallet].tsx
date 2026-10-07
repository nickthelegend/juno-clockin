import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { CoinArt, Identicon } from "../../components/art";
import { Handle } from "../../components/Handle";
import { Tappable } from "../../components/Press";
import { QuickTrade } from "../../components/QuickTrade";
import { ProfileView } from "../../components/profile/ProfileView";
import {
  Body,
  Button,
  Caption,
  Card,
  Chevron,
  ChevronLeft,
  Col,
  Entry,
  Heading,
  Label,
  Ledger,
  Mono,
  Pill,
  Placeholder,
  Row,
  Skeleton,
  Stat,
  Title,
} from "../../components/kit";
import { juno, type Coin, type Position, type Trader } from "../../lib/api";
import { money, tokens, useApi } from "../../lib/useApi";
import { useWallet } from "../../lib/wallet";
import { theme } from "../../theme";

/**
 * One trader.
 *
 * The leaderboard has ranked wallets since it shipped and every row pushed to a
 * route that did not exist — which is the shape of the whole gap this screen
 * closes. A social-trading app that can tell you who is good at this and then
 * gives you nowhere to go has not actually connected anything.
 *
 * Three questions, in the order someone asks them:
 *
 * 1. **Are they any good?** The same realised-P&L figures the rank is built
 *    from, said in full — including the ones that are unknown, which the board
 *    has to compress into a dash.
 * 2. **What do they hold?** Their portfolio, read from the chain by the same
 *    endpoint that reads your own. Nothing here is privileged: a public key's
 *    balances are public.
 * 3. **Can I do what they did?** Every position opens a buy sheet for that coin
 *    — at *your* size, quoted against the live curve. That is the entire idea
 *    of copy trading, and it needs no new transaction path: it is the ordinary
 *    server-builds/device-signs buy, started from someone else's holding.
 *
 * ## What copying is not
 *
 * It does not mirror their future trades, and the screen never implies it
 * does. Following a wallet automatically would need spending authority this
 * project does not have, and a button that quietly did less than it promised
 * would be worse than one that promises less.
 */
export default function TraderScreen() {
  const { wallet: target } = useLocalSearchParams<{ wallet: string }>();
  const router = useRouter();
  const me = useWallet();


  // A malformed address owns nothing and has no page. Checked before any read,
  // so a bad link gets a way out rather than a "Try again" that cannot work.
  const valid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(target ?? "");
  const stats = useApi(
    () => (valid ? juno.followStats(target, me.address) : Promise.resolve(null)),
    [target, me.address, valid],
  );
  const portfolio = useApi(() => (valid ? juno.portfolio(target) : Promise.resolve(null)), [target, valid]);
  /*
   * The board is read whole and this wallet picked out of it.
   *
   * There is no per-wallet ranking endpoint and there should not be: a rank is
   * a position within a set, so computing one wallet's would mean walking every
   * pool anyway. The server caches the board for ninety seconds, so arriving
   * here from the board costs nothing.
   */
  const board = useApi(() => juno.leaderboard(50), []);
  const row = board.data?.traders.find((entry) => entry.wallet === target) ?? null;
  const rank = board.data?.traders.findIndex((entry) => entry.wallet === target) ?? -1;

  const [follows, setFollows] = useState<boolean | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!stats.data) return;
    // No wallet yet means "not following" — a Follow that creates the wallet
    // on the way — rather than an unknown that disabled the button for good.
    setFollows(stats.data.viewerFollows ?? (me.address ? null : false));
    setFollowers(stats.data.followers);
  }, [stats.data, me.address]);

  /**
   * Follow, optimistically, with the count moving too.
   *
   * Both halves roll back together on a refusal. Moving the button but not the
   * number would leave the screen contradicting itself, which is worse than
   * either one being briefly wrong.
   */
  const toggleFollow = useCallback(async () => {
    if (follows === null || saving) return;
    const next = !follows;
    const before = { follows, followers };
    setSaving(true);
    setFollowError(null);
    setFollows(next);
    setFollowers((count) => (count === null ? count : Math.max(0, count + (next ? 1 : -1))));
    try {
      const address = me.address ?? (await me.connect());
      const result = await juno.setFollow(address, target, next);
      // The server's count is authoritative — it has seen every other follow.
      setFollowers(result.followers);
      setFollows(result.isFollowing);
    } catch (caught) {
      setFollows(before.follows);
      setFollowers(before.followers);
      setFollowError(caught instanceof Error ? caught.message : "That could not be saved");
    } finally {
      setSaving(false);
    }
  }, [me, follows, followers, saving, target]);

  const self = me.address === target;
  const positions = portfolio.data?.positions ?? [];

  if (!valid) {
    return (
      <Page edges={["top"]}>
        <Nav>
          <Back onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <ChevronLeft />
          </Back>
        </Nav>
        <Placeholder
          title="No such wallet"
          detail="That is not a Solana address. The link may be cut short."
          action={<Button label="Back to the feed" onPress={() => router.replace("/(tabs)/social" as never)} />}
        />
      </Page>
    );
  }

  // The record the leaderboard ranks on, shown above their holdings.
  const record = (
    <>
        {/* Record */}
        {board.loading ? (
          <Card>
            <Skeleton h={14} w="40%" />
            <Skeleton h={28} w="60%" style={{ marginTop: 12 }} />
          </Card>
        ) : row ? (
          <Card>
            <Row justify="space-between" align="flex-end">
              <Col gap={2}>
                <Caption>Profit taken</Caption>
                <Taken $tone={row.realised > 0 ? "pos" : row.realised < 0 ? "neg" : "flat"}>
                  {row.realised > 0 ? "+" : ""}
                  {money(row.realised, "USD", { compact: false })}
                </Taken>
              </Col>
              <Col gap={2} style={{ alignItems: "flex-end" }}>
                <Mono muted>{row.unrealised === null ? "—" : money(row.unrealised, "USD")}</Mono>
                <Caption>Still open</Caption>
              </Col>
            </Row>

            <Split />

            <Row>
              <Stat
                value={row.winRate === null ? "—" : `${Math.round(row.winRate * 100)}%`}
                label="Win rate"
              />
              <Stat
                value={row.bestExit === null ? "—" : money(row.bestExit, "USD")}
                label="Best exit"
              />
              <Stat value={String(row.trades)} label="Fills" />
              <Stat value={String(row.coins)} label="Coins" />
            </Row>

            {board.data?.partial ? (
              <Caption style={{ marginTop: 12 }}>
                Read from {board.data.poolsRead}{" "}
                {board.data.poolsRead === 1 ? "pool" : "pools"} — some histories would not
                load, so this is a floor rather than a total.
              </Caption>
            ) : null}
          </Card>
        ) : board.error ? (
          <Card>
            <Body muted>Their record could not be read: {board.error}</Body>
          </Card>
        ) : (
          <Card>
            {/* Absent from a *complete* board means they have not traded. Absent
                from a short one means nothing at all, and saying otherwise
                would invent a fact. */}
            <Body muted>
              {board.data?.partial
                ? "Their record could not be read — the pool histories came back short."
                : "No fills from this wallet on any Juno pool yet."}
            </Body>
          </Card>
        )}

    </>
  );

  return (
    <ProfileView
      wallet={target}
      self={false}
      onBack={() => router.back()}
      holdingsHeader={record}
    />
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Nav = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(2)}px;
`;

const Back = styled.Pressable`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: ${(p) => p.theme.colors.surface};
  align-items: center;
  justify-content: center;
`;


const Taken = styled.Text<{ $tone: "pos" | "neg" | "flat" }>`
  font-size: ${(p) => p.theme.type.heading.size}px;
  line-height: ${(p) => p.theme.type.heading.height}px;
  letter-spacing: ${(p) => p.theme.type.heading.tracking}px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) =>
    p.$tone === "pos"
      ? p.theme.colors.pos
      : p.$tone === "neg"
        ? p.theme.colors.neg
        : p.theme.colors.text};
`;

const Split = styled.View`
  height: ${(p) => p.theme.hairline}px;
  background-color: ${(p) => p.theme.colors.line};
  margin-vertical: ${(p) => p.theme.space(4)}px;
`;


