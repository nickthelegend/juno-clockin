import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../theme";

/**
 * A confirmed transaction, as a labelled row rather than a hash in prose.
 *
 * Verifiability is a feature here, so the signature gets a proper home: what
 * it is, a shortened hash you can read aloud, and two real targets (copy the
 * full signature, open it on Solscan) instead of a link buried in a sentence.
 */
export function TxRow({
  signature,
  label = "Transaction",
  tone = "light",
  cluster = "devnet",
}: {
  signature: string;
  label?: string;
  tone?: "light" | "dark";
  cluster?: string;
}) {
  const [copied, setCopied] = useState(false);
  const dark = tone === "dark";
  const url = `https://solscan.io/tx/${signature}${cluster === "devnet" ? "?cluster=devnet" : ""}`;

  const copy = async () => {
    await Clipboard.setStringAsync(signature).catch(() => undefined);
    void Haptics.selectionAsync().catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <View style={[styles.row, dark ? styles.rowDark : null]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.label, dark ? styles.labelDark : null]}>{label}</Text>
        <Text style={[styles.hash, dark ? styles.hashDark : null]} numberOfLines={1}>
          {signature.slice(0, 8)}…{signature.slice(-8)}
        </Text>
      </View>
      <Pressable
        onPress={() => void copy()}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Copy transaction signature"
        style={({ pressed }) => [styles.btn, dark ? styles.btnDark : null, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[styles.btnText, dark ? styles.btnTextDark : null]}>{copied ? "Copied" : "Copy"}</Text>
      </Pressable>
      <Pressable
        onPress={() => void Linking.openURL(url)}
        hitSlop={4}
        accessibilityRole="link"
        accessibilityLabel="Open transaction on Solscan"
        style={({ pressed }) => [styles.btn, styles.btnPrimary, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Text style={[styles.btnText, { color: theme.colors.onLime }]}>Solscan</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
  },
  rowDark: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.08)" },
  label: { fontSize: 12, fontWeight: "700", color: theme.colors.muted },
  labelDark: { color: "rgba(243,247,238,0.66)" },
  hash: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  hashDark: { color: theme.colors.onInk },
  btn: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  btnDark: { backgroundColor: "rgba(255,255,255,0.1)" },
  btnPrimary: { backgroundColor: theme.colors.lime },
  btnText: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  btnTextDark: { color: theme.colors.onInk },
});
