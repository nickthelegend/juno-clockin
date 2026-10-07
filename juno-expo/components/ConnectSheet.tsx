import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { BottomSheet } from "./BottomSheet";
import { Body, Title } from "./kit";
import { MWA_AVAILABLE } from "../lib/mwa";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme";

export type ConnectChoice = "mwa" | "privy" | "local";

/**
 * How do you want to sign?
 *
 * On Android the first and largest option is Mobile Wallet Adapter: on a
 * Seeker that is Seed Vault, and anywhere else it is whatever Solana wallet is
 * installed. Email (Privy) is the no-wallet path. The dev wallet is a devnet
 * key held on this device — labelled as such, because it is the only option an
 * iOS simulator or a wallet-less emulator has, and nobody should mistake it for
 * custody.
 */
export function ConnectSheet({
  visible,
  onClose,
  onChoose,
  privyEnabled,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (choice: ConnectChoice) => Promise<void>;
  privyEnabled: boolean;
  error: string | null;
}) {
  const [busy, setBusy] = useState<ConnectChoice | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) setBusy(null);
  }, [visible]);
  useEffect(() => {
    if (error) setBusy(null);
  }, [error]);

  const choose = async (choice: ConnectChoice) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setBusy(choice);
    try {
      await onChoose(choice);
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={busy === null}>
      <View style={[styles.sheet, { paddingBottom: 36 + insets.bottom }]}>
        <Title>Connect to Juno</Title>
        <Body muted>
          Juno runs on Solana devnet. Your wallet signs every trade, launch and daily clock-in.
        </Body>

        {MWA_AVAILABLE ? (
          <Option
            title="Connect wallet"
            detail="Seed Vault on Seeker, or Phantom, Solflare, Backpack via Mobile Wallet Adapter"
            badge="Recommended"
            primary
            busy={busy === "mwa"}
            disabled={busy !== null}
            onPress={() => void choose("mwa")}
          />
        ) : null}

        {privyEnabled ? (
          <Option
            title="Continue with email"
            detail="Privy creates an embedded Solana wallet. No seed phrase."
            primary={!MWA_AVAILABLE}
            busy={busy === "privy"}
            disabled={busy !== null}
            onPress={() => void choose("privy")}
          />
        ) : null}

        <Option
          title="Dev wallet (devnet only)"
          detail={
            MWA_AVAILABLE
              ? "A throwaway devnet key on this device, for testing without a wallet app."
              : "A devnet key in this device's keychain. Mobile Wallet Adapter is Android-only."
          }
          busy={busy === "local"}
          disabled={busy !== null}
          onPress={() => void choose("local")}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

function Option({
  title,
  detail,
  badge,
  primary,
  busy,
  disabled,
  onPress,
}: {
  title: string;
  detail: string;
  badge?: string;
  primary?: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.option,
        primary ? styles.primary : null,
        { opacity: disabled && !busy ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.title}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      {busy ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.arrow}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.lineStrong,
  },
  primary: { backgroundColor: theme.colors.lime, borderColor: theme.colors.limePress },
  title: { fontSize: theme.type.body.size, fontWeight: "700", color: theme.colors.text },
  detail: { fontSize: theme.type.caption.size, lineHeight: 16, color: theme.colors.muted },
  arrow: { fontSize: 26, color: theme.colors.muted, marginTop: -2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.ink,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: theme.colors.onInk },
  error: { fontSize: theme.type.label.size, color: theme.colors.neg },
});
