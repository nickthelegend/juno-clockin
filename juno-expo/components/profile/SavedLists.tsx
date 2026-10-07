import { CoinArt } from "../art";
import { Tappable } from "../Press";
import {
  Body,
  Button,
  Caption,
  Card,
  Col,
  Delta,
  Entry,
  Label,
  Ledger,
  Mono,
  Pill,
  Placeholder,
  Progress,
  Row,
  Skeleton,
} from "../kit";
import { juno, type Plan, type WatchItem } from "../../lib/api";
import { money, tokens, useApi } from "../../lib/useApi";

/*
 * Watchlist and recurring-buy plans, moved out of the old profile screen
 * unchanged so the Instagram-style profile can keep them under Holdings.
 */

/**
 * Coins this wallet is keeping an eye on, and whether an alert has fired.
 *
 * The rows come from Postgres and are always complete; the prices come from the
 * chain and may not be. A coin that could not be priced keeps its row and says
 * so rather than disappearing from a list the person themselves built.
 */
export function WatchingTab({
  state,
  onOpen,
}: {
  state: ReturnType<typeof useApi<{ items: WatchItem[]; missing: number } | null>>;
  onOpen: (mint: string) => void;
}) {
  if (state.loading) {
    return (
      <Ledger>
        {[0, 1].map((i) => (
          <Entry key={i} $first={i === 0}>
            <Row gap={12}>
              <Skeleton h={40} w={40} round={14} />
              <Skeleton h={14} w="45%" />
            </Row>
          </Entry>
        ))}
      </Ledger>
    );
  }
  if (state.error) {
    return (
      <Placeholder
        title="Could not load your watchlist"
        detail={state.error}
        action={<Button label="Try again" onPress={state.refresh} />}
      />
    );
  }

  const items = state.data?.items ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <Body muted>
          Nothing watched yet. Star a coin from its page and it appears here with
          whatever alert you set on it.
        </Body>
      </Card>
    );
  }

  return (
    <Ledger>
      {items.map((item, index) => (
        <Tappable key={item.baseMint} onPress={() => onOpen(item.baseMint)} to={0.985}>
          <Entry $first={index === 0}>
            <Row gap={12}>
              <CoinArt
                uri={item.coin ? juno.still(item.coin.media) : null}
                seed={item.baseMint}
                size={40}
                radius={14}
              />
              <Col gap={2} style={{ flex: 1 }}>
                <Label style={{ fontWeight: "700" }} numberOfLines={1}>
                  {item.coin?.name ?? "Could not be priced"}
                </Label>
                <Caption>
                  {item.coin ? `$${item.coin.symbol}` : "The RPC would not serve this pool"}
                </Caption>
              </Col>
              <Col gap={2} style={{ alignItems: "flex-end" }}>
                <Mono>
                  {item.coin ? money(item.coin.priceUsd, item.coin.currency, { compact: false }) : "—"}
                </Mono>
                <Delta pct={item.coin?.changePct ?? null} />
              </Col>
            </Row>

            {item.alertPrice !== null ? (
              <Row gap={6} style={{ marginTop: 10 }}>
                {/* Fired, not yet, or unknown — three states, because an alert
                    cannot be judged against a price nobody read. */}
                <Pill
                  label={
                    item.alertCrossed === null
                      ? `Alert at ${money(item.alertPrice, "USD", { compact: false })}`
                      : item.alertCrossed === "up"
                        ? `Crossed above ${money(item.alertPrice, "USD", { compact: false })}`
                        : `Fell below ${money(item.alertPrice, "USD", { compact: false })}`
                  }
                  tone={item.alertCrossed === "up" ? "pos" : item.alertCrossed === "down" ? "neg" : "neutral"}
                />
              </Row>
            ) : null}
          </Entry>
        </Tappable>
      ))}
    </Ledger>
  );
}

/**
 * Recurring buys.
 *
 * Deliberately not a bot: executing a swap for someone needs a delegate this
 * project does not have, so a plan says what it is for and when it is due and
 * the buy is the same device-signed transaction as any other. `contributed`
 * only moves after a swap confirms, so the bar is a record of transactions
 * rather than of intentions.
 */
export function PlansTab({
  state,
  onOpen,
}: {
  state: ReturnType<typeof useApi<{ plans: Plan[]; missing: number } | null>>;
  onOpen: (mint: string) => void;
}) {
  if (state.loading) {
    return (
      <Ledger>
        <Entry $first>
          <Skeleton h={14} w="50%" />
          <Skeleton h={10} w="100%" style={{ marginTop: 14 }} />
        </Entry>
      </Ledger>
    );
  }
  if (state.error) {
    return (
      <Placeholder
        title="Could not load your plans"
        detail={state.error}
        action={<Button label="Try again" onPress={state.refresh} />}
      />
    );
  }

  const rows = state.data?.plans ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <Body muted>
          No recurring buys yet. Set one from a coin&rsquo;s page to put the same
          amount in every week — it tells you when it is due and you sign each one.
        </Body>
      </Card>
    );
  }

  return (
    <Ledger>
      {rows.map((plan, index) => {
        const pct =
          plan.target && plan.target > 0
            ? Math.max(0, Math.min(1, plan.contributed / plan.target))
            : null;
        return (
          <Tappable key={plan.id} onPress={() => onOpen(plan.baseMint)} to={0.985}>
            <Entry $first={index === 0}>
              <Row gap={10}>
                <Col gap={2} style={{ flex: 1 }}>
                  <Label style={{ fontWeight: "700" }} numberOfLines={1}>
                    {plan.coin?.name ?? "Could not be priced"}
                  </Label>
                  <Caption>
                    {planAmount(plan, plan.amount)} {plan.cadence}
                    {plan.fills > 0 ? ` · ${plan.fills} ${plan.fills === 1 ? "fill" : "fills"}` : ""}
                  </Caption>
                </Col>
                <Pill
                  label={!plan.active ? "Paused" : plan.due ? "Due now" : "Scheduled"}
                  tone={!plan.active ? "neutral" : plan.due ? "lime" : "neutral"}
                />
              </Row>

              {pct !== null ? (
                <Col gap={6} style={{ marginTop: 12 }}>
                  <Progress pct={pct * 100} />
                  <Caption>
                    {planAmount(plan, plan.contributed)} of {planAmount(plan, plan.target!)}{" "}
                    contributed
                  </Caption>
                </Col>
              ) : (
                <Caption style={{ marginTop: 10 }}>
                  {planAmount(plan, plan.contributed)} contributed so far
                </Caption>
              )}
            </Entry>
          </Tappable>
        );
      })}
    </Ledger>
  );
}

/**
 * A plan figure in the unit it is actually denominated in.
 *
 * Amounts, targets and contributions are quote-token units, because that is
 * what the swap is signed for. Rendering 5 SOL as "$5.00" — which this screen
 * did — is wrong by whatever SOL costs. The dollar figure follows in
 * parentheses only when a feed gave us a rate; without one it is simply absent
 * rather than assumed to be one-to-one.
 */
function planAmount(plan: Plan, value: number): string {
  const symbol = plan.coin?.quoteSymbol;
  if (!symbol) return tokens(value);
  const unit = `${tokens(value)} ${symbol}`;
  const rate = plan.coin?.quoteUsdRate ?? null;
  if (rate === null || value === 0) return unit;
  return `${unit} (${money(value * rate, "USD", { compact: false })})`;
}

