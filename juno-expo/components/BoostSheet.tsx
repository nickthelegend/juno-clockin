import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { BottomSheet } from "./BottomSheet";
import { BOOST_AMOUNTS } from "../lib/clockin";
import { useClockIn } from "../lib/clockinContext";
import { explorerTx, SKR_LABEL, SKR_SHORT } from "../lib/solana";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";
import { formatSkr } from "./ClockInCard";

export type BoostTarget = { coinMint: string; creator: string; name: string; symbol: string };

/**
 * Boost a post with SKR.
 *
 * The SKR you earn by clocking in is spent backing posts you believe in. Each
 * boost is one transfer the wallet signs: 80% to the post's creator, 20% to
 * the treasury that pays tomorrow's clock-in rewards. Boosted posts rise to the
 * top of everyone's feed, ranked by what the treasury actually received.
 */
export function BoostSheet({
  target,
  onClose,
  bottomInset = 0,
}: {
  target: BoostTarget | null;
  onClose: () => void;
  /** Height of whatever covers the bottom of the screen (the tab bar), so nothing hides behind it. */
  bottomInset?: number;
}) {
  const wallet = useWallet();
  const daily = useClockIn();
  const [amount, setAmount] = useState<number>(BOOST_AMOUNTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    setDone(null);
    setBusy(false);
  }, [target]);

  const balance = daily.skr;
  const short = balance !== null && balance < amount;
  const self = target && wallet.address === target.creator;
  const total = target ? daily.boosts.get(target.coinMint) : undefined;

  const send = async () => {
    if (!target) return;
    setError(null);
    if (!wallet.address) {
      await wallet.connect().catch(() => undefined);
      return;
    }
    setBusy(true);
    try {
      const signature = await daily.boost({ coinMint: target.coinMint, creator: target.creator, amount });
      setDone(signature);
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={target !== null} onClose={onClose} dismissable={!busy}>
      <View style={[styles.sheet, { paddingBottom: 36 + bottomInset }]}>
        <Text style={styles.kicker}>BOOST WITH SKR</Text>
        <Text style={styles.title} numberOfLines={1}>
          {target?.name ?? ""}
        </Text>
        <Text style={styles.body}>
          {self
            ? "This is your post. A self-boost pays the whole amount to the reward treasury."
            : "80% goes straight to the creator, 20% refills the clock-in reward treasury. Boosted posts lead everyone's feed."}
        </Text>
        {total ? (
          <Text style={styles.meta}>
            Boosted {formatSkr(total.amount)} {SKR_SHORT} by {total.count} {total.count === 1 ? "boost" : "boosts"} so far
          </Text>
        ) : null}

        {done ? (
          <View style={styles.done}>
            <Text style={styles.doneTitle}>Boosted +{amount} {SKR_SHORT}</Text>
            <Text style={styles.link} onPress={() => void Linking.openURL(explorerTx(done))}>
              View transaction on Solscan
            </Text>
            <Pressable onPress={onClose} style={styles.cta} accessibilityRole="button">
              <Text style={styles.ctaText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.amounts}>
              {BOOST_AMOUNTS.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    setAmount(value);
                  }}
                  style={[styles.amount, amount === value ? styles.amountOn : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: amount === value }}
                >
                  <Text style={[styles.amountText, amount === value ? styles.amountTextOn : null]}>{value}</Text>
                  <Text style={[styles.amountUnit, amount === value ? styles.amountTextOn : null]}>{SKR_SHORT}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.meta}>
              {wallet.address
                ? `You have ${balance === null ? "—" : formatSkr(balance)} ${SKR_SHORT}${short ? " — clock in daily to earn more" : ""}`
                : "Connect a wallet to boost"}
            </Text>

            <Pressable
              onPress={busy || short ? undefined : () => void send()}
              style={[styles.cta, busy || short ? { opacity: 0.5 } : null]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={theme.colors.onLime} /> : null}
              <Text style={styles.ctaText}>
                {!wallet.address ? "Connect wallet" : busy ? (wallet.mode === "mwa" ? "Approve in your wallet…" : "Sending…") : `Boost ${amount} ${SKR_SHORT}`}
              </Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.fine}>{SKR_LABEL}. On mainnet this would be the real SKR token.</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "800", color: theme.colors.muted },
  title: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.text },
  body: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.muted },
  meta: { fontSize: theme.type.caption.size, color: theme.colors.muted },
  amounts: { flexDirection: "row", gap: 10 },
  amount: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.lineStrong,
  },
  amountOn: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  amountText: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.text },
  amountUnit: { fontSize: 11, fontWeight: "700", color: theme.colors.muted },
  amountTextOn: { color: theme.colors.lime },
  cta: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.lime,
  },
  ctaText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onLime },
  done: { gap: 10, alignItems: "stretch" },
  doneTitle: { fontSize: theme.type.lead.size, fontWeight: "800", color: theme.colors.pos, textAlign: "center" },
  link: { fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.focus, textAlign: "center" },
  error: { fontSize: theme.type.label.size, color: theme.colors.neg },
  fine: { fontSize: 11, color: theme.colors.faint, textAlign: "center" },
});
