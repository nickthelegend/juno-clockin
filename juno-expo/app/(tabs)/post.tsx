import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { Identicon } from "../../components/art";
import { CURVE_PRESETS, CurveCard, type PresetId } from "../../components/composer/CurveCard";
import { LaunchProgress, LaunchSuccess, type LaunchStep } from "../../components/composer/LaunchFlow";
import { juno, WSOL_MINT } from "../../lib/api";
import { loadMarkets } from "../../lib/markets";
import { useReducedMotion } from "../../lib/motion";
import { useHandle } from "../../lib/names";
import { feedChanged } from "../../lib/refresh";
import { appUrl } from "../../lib/social";
import { useTabBarHeight } from "../../lib/tabbar";
import { checkTicker, cleanTicker, suggestTicker } from "../../lib/ticker";
import { useWallet } from "../../lib/wallet";
import { theme } from "../../theme";

/**
 * Post: a three-step composer that launches a real market.
 *
 * Media, Details, Launch. Publishing creates a Meteora bonding-curve pool on
 * Solana devnet for the post; the post *is* that market. The flow is paged so
 * each step owns the screen (a picture, then words, then a decision about the
 * curve), with one sticky button that always says what happens next.
 *
 * A launch is two approvals because a sixteen-segment curve plus the pool
 * init is about 1488 bytes, over Solana's 1232-byte packet limit. The second
 * can fail after the first lands; the progress sheet says so and retrying is
 * safe. A pool that confirmed but could not be listed keeps everything needed
 * to retry the listing without signing again.
 */

const MAX_CAPTION = 280;
const MAX_BYTES = 25 * 1024 * 1024;
/** Measured on devnet: a launch costs about 0.027 SOL, nearly all of it account rent. */
const LAUNCH_FEE_SOL = 0.027;
const STEPS = ["Media", "Details", "Launch"] as const;

type Kind = "post" | "reel";
type Record = Parameters<typeof juno.recordLaunch>[0];

const INITIAL_STEPS: LaunchStep[] = [
  { id: "upload", label: "Upload", detail: "Pinning your media to IPFS", state: "pending" },
  { id: "meta", label: "Token details", detail: "Name, ticker and picture, pinned", state: "pending" },
  { id: "curve", label: "Approval 1 of 2", detail: "Create your curve", state: "pending" },
  { id: "pool", label: "Approval 2 of 2", detail: "Open the pool on Meteora", state: "pending" },
  { id: "list", label: "Go live", detail: "List it in the Juno feed", state: "pending" },
];

export default function PostScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBar = useTabBarHeight();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ format?: string }>();

  const [kind, setKind] = useState<Kind>(params.format === "reel" ? "reel" : "post");
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [symbolEdited, setSymbolEdited] = useState(false);
  const [caption, setCaption] = useState("");
  const [preset, setPreset] = useState<PresetId>("content");
  const [touched, setTouched] = useState<{ name?: boolean; symbol?: boolean }>({});
  const [step, setStep] = useState(0);
  const [pickError, setPickError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [steps, setSteps] = useState<LaunchStep[]>(INITIAL_STEPS);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [unlisted, setUnlisted] = useState<Record | null>(null);
  const [live, setLive] = useState<Record | null>(null);

  const pager = useRef<ScrollView>(null);
  const bar = useRef(new Animated.Value(0)).current;

  /* ------------------------------- reads ------------------------------- */

  const [taken, setTaken] = useState<Set<string> | null>(null);
  useEffect(() => {
    loadMarkets(null)
      .then((m) => setTaken(new Set([...m.posts, ...m.preipo, ...m.stocks].map((c) => c.symbol.toUpperCase()))))
      .catch(() => setTaken(null));
  }, []);

  const [sol, setSol] = useState<number | null>(null);
  const [funding, setFunding] = useState(false);
  const readBalance = useCallback(() => {
    if (!wallet.address) return setSol(null);
    juno
      .balance(wallet.address, WSOL_MINT)
      .then((r) => setSol(r.balance))
      .catch(() => setSol(null));
  }, [wallet.address]);
  useEffect(() => {
    if (step === 2) readBalance();
  }, [step, readBalance]);

  /* ---------------------------- validation ----------------------------- */

  const cleanSymbol = symbol.trim().toUpperCase();
  const tickerState = checkTicker(cleanSymbol, taken);
  const symbolFormatOk = tickerState !== "empty" && tickerState !== "format";
  const symbolTaken = tickerState === "taken";
  const nameOk = name.trim().length >= 2 && name.trim().length <= 32;
  const captionOk = caption.trim().length <= MAX_CAPTION;
  const detailsOk = nameOk && symbolFormatOk && !symbolTaken && captionOk;
  const lowSol = sol !== null && sol < LAUNCH_FEE_SOL + 0.003;
  const maxStep = !media ? 0 : !detailsOk ? 1 : 2;

  const nameError = touched.name && !nameOk ? (name.trim().length < 2 ? "At least 2 characters" : "32 characters at most") : null;
  const symbolHint = !cleanSymbol
    ? "2 to 10 letters or numbers"
    : !symbolFormatOk
      ? "Use 2 to 10 letters or numbers"
      : symbolTaken
        ? `$${cleanSymbol} is already a Juno market. Try another.`
        : taken
          ? `$${cleanSymbol} is available`
          : "Checking availability…";
  const symbolTone: "ok" | "bad" | "muted" = !cleanSymbol
    ? "muted"
    : !symbolFormatOk || symbolTaken
      ? touched.symbol || symbolTaken
        ? "bad"
        : "muted"
      : taken
        ? "ok"
        : "muted";

  /* ------------------------------ paging ------------------------------- */

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, 2));
      setStep(clamped);
      pager.current?.scrollTo({ x: clamped * width, animated: !reduced });
      Animated.timing(bar, { toValue: clamped, duration: reduced ? 0 : 260, useNativeDriver: false }).start();
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [width, reduced, bar],
  );

  const onPageEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (page > maxStep) {
      // Swiped ahead of what is filled in: back to the first step that needs you.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      if (page >= 1 && maxStep === 1) setTouched({ name: true, symbol: true });
      goTo(maxStep);
      return;
    }
    if (page !== step) {
      setStep(page);
      Animated.timing(bar, { toValue: page, duration: reduced ? 0 : 200, useNativeDriver: false }).start();
    }
  };

  /* ------------------------------- media ------------------------------- */

  const pick = useCallback(
    async (source: "library" | "camera" = "library") => {
      setPickError(null);
      try {
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: kind === "reel" ? ["videos"] : ["images"],
          // A post is a square in the feed, so offer the square crop up front.
          allowsEditing: kind === "post",
          aspect: [1, 1],
          quality: 0.9,
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          videoMaxDuration: 90,
        };
        let result: ImagePicker.ImagePickerResult;
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setPickError("Juno needs camera access for that. You can still choose from your library.");
            return;
          }
          result = await ImagePicker.launchCameraAsync(options);
        } else {
          result = await ImagePicker.launchImageLibraryAsync(options);
        }
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > MAX_BYTES) {
          setPickError("That file is over 25MB. Pick a smaller one.");
          return;
        }
        setMedia(asset);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      } catch (caught) {
        const text = caught instanceof Error ? caught.message : "";
        setPickError(
          source === "camera" && /camera|simulator|unavailable/i.test(text)
            ? "No camera on this device. Choose from your library instead."
            : text || "Could not open your library",
        );
      }
    },
    [kind],
  );

  // Arriving from the + sheet opens the library straight away, the way a
  // camera app opens the camera. Once per arrival, and only with nothing picked.
  const opened = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const format = params.format === "reel" ? "reel" : params.format === "post" ? "post" : null;
      if (!format) return;
      if (format !== kind) {
        setKind(format);
        setMedia(null);
      }
      const key = `${format}`;
      if (opened.current === key || busy) return;
      opened.current = key;
      if (!media || format !== kind) {
        const timer = setTimeout(() => void pick("library"), 350);
        return () => clearTimeout(timer);
      }
      return undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.format]),
  );

  // A ticker suggested from the name until the creator types their own.
  useEffect(() => {
    if (symbolEdited) return;
    setSymbol(suggestTicker(name));
  }, [name, symbolEdited]);

  /* ------------------------------ launch ------------------------------- */

  const mark = (id: string, patch: Partial<LaunchStep>) =>
    setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function list(record: Record) {
    mark("list", { state: "active" });
    try {
      await juno.recordLaunch(record);
      setUnlisted(null);
      mark("list", { state: "done", detail: "Live in the feed" });
      feedChanged();
      setLive(record);
      setProgressOpen(false);
    } catch (caught) {
      setUnlisted(record);
      mark("list", { state: "error" });
      throw new Error(
        `Your market is live on-chain, but Juno could not list it yet (${
          caught instanceof Error ? caught.message : "unknown error"
        }). Try again: nothing needs signing.`,
      );
    }
  }

  async function launch() {
    if (!media) return;
    setBusy(true);
    setLaunchError(null);
    setProgressOpen(true);
    try {
      if (unlisted) {
        await list(unlisted);
        return;
      }
      setSteps(INITIAL_STEPS);
      const address = wallet.address ?? (await wallet.connect());

      mark("upload", { state: "active" });
      const uploaded = await juno.upload(
        media.file ?? {
          uri: media.uri,
          name: media.fileName ?? (media.type === "video" ? "reel.mp4" : "post.jpg"),
          type: media.mimeType ?? (media.type === "video" ? "video/mp4" : "image/jpeg"),
        },
      );
      mark("upload", { state: "done", detail: "Pinned to IPFS" });

      mark("meta", { state: "active" });
      const metadata = await juno.pinMetadata({
        name: name.trim(),
        symbol: cleanSymbol,
        description: caption.trim() || undefined,
        curvePreset: preset,
        imageUrl: uploaded.posterUrl ?? uploaded.url,
        mimeType: uploaded.posterUrl ? "image/jpeg" : uploaded.mimeType,
      });
      mark("meta", { state: "done", detail: "Name, ticker and picture pinned" });

      mark("curve", { state: "active", detail: wallet.mode === "mwa" ? "Approve in your wallet" : "Create your curve" });
      const built = await juno.buildLaunch({ creator: address, name: name.trim(), symbol: cleanSymbol, preset, uri: metadata.uri });

      let poolSignature = "";
      for (const [index, tx] of built.steps.entries()) {
        const id = index === 0 ? "curve" : "pool";
        mark(id, { state: "active", detail: wallet.mode === "mwa" ? "Approve in your wallet" : index === 0 ? "Creating your curve" : "Opening the pool" });
        const signed = await wallet.sign(tx.transaction);
        try {
          const { signature } = await juno.submit({ transaction: signed, window: built.window });
          poolSignature = signature;
          mark(id, { state: "done", detail: index === 0 ? "Curve created" : "Pool open on Meteora", signature });
        } catch (stepError) {
          mark(id, { state: "error" });
          if (index > 0) {
            throw new Error(
              `Your curve was created, but opening the pool failed (${
                stepError instanceof Error ? stepError.message : "unknown error"
              }). Nothing is lost.`,
            );
          }
          throw stepError;
        }
      }

      await list({
        baseMint: built.baseMint,
        poolAddress: built.pool,
        configAddress: built.config,
        quoteMint: WSOL_MINT,
        creatorWallet: address,
        name: name.trim(),
        symbol: cleanSymbol,
        format: kind,
        curvePreset: preset,
        createSignature: poolSignature,
        description: caption.trim() || null,
        mediaUrl: uploaded.uri,
        posterUrl: uploaded.posterUri ?? uploaded.uri,
        mediaMime: uploaded.mimeType,
        mediaWidth: uploaded.width,
        mediaHeight: uploaded.height,
      });
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Launch failed";
      setSteps((all) => all.map((s) => (s.state === "active" ? { ...s, state: "error" } : s)));
      setLaunchError(
        /insufficient|0x1\b|lamports/i.test(text)
          ? "Not enough devnet SOL for the launch. Get devnet SOL on the Launch step, then try again."
          : /reach Juno|timed out|network/i.test(text)
            ? "Juno could not reach the network. Check your connection and try again."
            : /declin|reject|cancel/i.test(text)
              ? "You declined in your wallet. Try again when you're ready."
              : text,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLive(null);
    setMedia(null);
    setName("");
    setSymbol("");
    setSymbolEdited(false);
    setCaption("");
    setPreset("content");
    setTouched({});
    setSteps(INITIAL_STEPS);
    opened.current = null;
    goTo(0);
  }

  async function fund() {
    if (!wallet.address) return;
    setFunding(true);
    try {
      await juno.faucet(wallet.address);
      readBalance();
    } catch {
      // The balance stays low and the button stays; the faucet's own message is not worth a modal.
    } finally {
      setFunding(false);
    }
  }

  /* ------------------------------ render ------------------------------- */

  const cta = (() => {
    if (step === 0) return { label: "Next: details", onPress: () => goTo(1), enabled: Boolean(media) };
    if (step === 1) {
      return {
        label: detailsOk ? "Next: pick a curve" : "Next",
        onPress: () => {
          setTouched({ name: true, symbol: true });
          if (detailsOk) goTo(2);
          else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        },
        enabled: detailsOk,
      };
    }
    if (!wallet.address) return { label: "Connect wallet to launch", onPress: () => void wallet.connect().catch(() => undefined), enabled: true };
    if (lowSol) return { label: funding ? "Getting devnet SOL…" : "Get devnet SOL", onPress: () => void fund(), enabled: !funding };
    return { label: `Launch $${cleanSymbol}`, onPress: () => void launch(), enabled: !busy };
  })();

  const stillUri = media?.type === "video" ? null : (media?.uri ?? null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header: close, title, the three steps */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push("/(tabs)/social" as never)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close composer"
          style={styles.close}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6 6 18" stroke={theme.colors.text} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </Pressable>
        <Text style={styles.headerTitle}>{kind === "reel" ? "New reel" : "New post"}</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.progress}>
        {STEPS.map((label, i) => (
          <Pressable
            key={label}
            onPress={() => (i <= maxStep ? goTo(i) : undefined)}
            style={styles.progressItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: step === i, disabled: i > maxStep }}
            accessibilityLabel={`Step ${i + 1}, ${label}`}
          >
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: bar.interpolate({
                      inputRange: [i - 1, i, i + 1],
                      outputRange: ["0%", "100%", "100%"],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, step === i ? styles.progressLabelOn : null, i > maxStep ? { color: theme.colors.faint } : null]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPageEnd}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!busy}
          style={{ flex: 1 }}
        >
          {/* 1. Media */}
          <ScrollView style={{ width }} contentContainerStyle={[styles.page, { paddingBottom: tabBar.height + 100 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.kindSwitch}>
              {(["post", "reel"] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    if (k === kind) return;
                    void Haptics.selectionAsync().catch(() => undefined);
                    setKind(k);
                    setMedia(null);
                  }}
                  style={[styles.kindItem, kind === k ? styles.kindItemOn : null]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: kind === k }}
                >
                  <Text style={[styles.kindText, kind === k ? styles.kindTextOn : null]}>{k === "post" ? "Photo" : "Reel"}</Text>
                </Pressable>
              ))}
            </View>

            {media ? (
              <View style={[styles.preview, { aspectRatio: kind === "reel" ? 4 / 5 : 1 }]}>
                {media.type === "video" ? (
                  <VideoPreview uri={media.uri} />
                ) : (
                  <ExpoImage source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                )}
                <View style={styles.previewChips}>
                  <Chip label={kind === "post" ? "Crop" : "Change"} onPress={() => void pick("library")} />
                  {kind === "post" ? <Chip label="Change" onPress={() => void pick("library")} /> : null}
                </View>
                {kind === "post" ? (
                  <View pointerEvents="none" style={styles.cropFrame}>
                    {["tl", "tr", "bl", "br"].map((c) => (
                      <View key={c} style={[styles.corner, styles[c as "tl"]]} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.empty, { aspectRatio: kind === "reel" ? 4 / 5 : 1 }]}>
                <View style={styles.emptyIcon}>
                  <Svg width={34} height={34} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"
                      stroke={theme.colors.ink}
                      strokeWidth={1.6}
                      strokeLinejoin="round"
                    />
                    <Circle cx={12} cy={12.5} r={3.4} stroke={theme.colors.ink} strokeWidth={1.6} />
                  </Svg>
                </View>
                <Text style={styles.emptyTitle}>{kind === "reel" ? "Start with a video" : "Start with a photo"}</Text>
                <Text style={styles.emptySub}>
                  {kind === "reel" ? "Vertical, up to 90 seconds and 25MB." : "It becomes a square in the feed. Up to 25MB."}
                </Text>
                <View style={styles.emptyActions}>
                  <BigAction label="Library" primary onPress={() => void pick("library")} />
                  {/* Android only for now: expo-image-picker opens the iOS camera without
                      checking it exists, which crashes the iOS Simulator. */}
                  {kind === "post" && Platform.OS === "android" ? (
                    <BigAction label="Camera" onPress={() => void pick("camera")} />
                  ) : null}
                </View>
              </View>
            )}
            {pickError ? <Text style={styles.inlineError}>{pickError}</Text> : null}
          </ScrollView>

          {/* 2. Details */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={[styles.page, { paddingBottom: tabBar.height + 110 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Field label="Name" error={nameError} hint={!nameError ? "What people will call this market" : null}>
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Night Market"
                placeholderTextColor={theme.colors.faint}
                maxLength={40}
                returnKeyType="next"
                style={styles.bigInput}
                accessibilityLabel="Name"
              />
            </Field>

            <Field label="Ticker" error={null} hint={null}>
              <View style={[styles.tickerBox, symbolTone === "bad" ? styles.inputBad : symbolTone === "ok" ? styles.inputOk : null]}>
                <View style={styles.dollar}>
                  <Text style={styles.dollarText}>$</Text>
                </View>
                <TextInput
                  value={symbol}
                  onChangeText={(t) => {
                    setSymbolEdited(true);
                    setSymbol(cleanTicker(t));
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, symbol: true }))}
                  placeholder="NIGHT"
                  placeholderTextColor={theme.colors.faint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[styles.bigInput, styles.tickerInput]}
                  accessibilityLabel="Ticker"
                />
              </View>
              <Text
                style={[
                  styles.hint,
                  symbolTone === "ok" ? { color: theme.colors.pos } : symbolTone === "bad" ? { color: theme.colors.neg } : null,
                ]}
              >
                {symbolHint}
              </Text>
            </Field>

            <Field label="Caption" error={!captionOk ? `${caption.trim().length - MAX_CAPTION} over the limit` : null} hint={null}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Say what this is"
                placeholderTextColor={theme.colors.faint}
                multiline
                style={[styles.bigInput, styles.captionInput]}
                accessibilityLabel="Caption"
              />
              <Text style={[styles.counter, !captionOk ? { color: theme.colors.neg } : null]}>
                {caption.trim().length}/{MAX_CAPTION}
              </Text>
            </Field>

            <Text style={styles.sectionTitle}>How it looks in the feed</Text>
            <PostPreview
              wallet={wallet.address}
              name={name.trim() || "Your post"}
              symbol={cleanSymbol || "TICKER"}
              caption={caption.trim()}
              stillUri={stillUri}
              video={media?.type === "video" ? media.uri : null}
            />
          </ScrollView>

          {/* 3. Launch */}
          <ScrollView style={{ width }} contentContainerStyle={[styles.page, { paddingBottom: tabBar.height + 110 }]} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Pick a curve</Text>
            <Text style={styles.sectionSub}>It sets how your post's price moves as people buy in.</Text>
            <View style={{ gap: 12 }}>
              {CURVE_PRESETS.map((p) => (
                <CurveCard key={p.id} preset={p} selected={preset === p.id} width={width - 32} onSelect={() => setPreset(p.id)} />
              ))}
            </View>

            <Pressable
              onPress={() => setAdvanced((a) => !a)}
              style={styles.disclosure}
              accessibilityRole="button"
              accessibilityState={{ expanded: advanced }}
            >
              <Text style={styles.disclosureText}>Advanced</Text>
              <Svg width={14} height={14} viewBox="0 0 24 24" style={{ transform: [{ rotate: advanced ? "180deg" : "0deg" }] }}>
                <Path d="M6 9l6 6 6-6" stroke={theme.colors.muted} strokeWidth={2.4} fill="none" strokeLinecap="round" />
              </Svg>
            </Pressable>
            {advanced ? (
              <Text style={styles.advanced}>
                Each curve is a Meteora Dynamic Bonding Curve made of 16 segments, each with its own liquidity weight. More
                liquidity in a segment means the price climbs more slowly there. When the curve fills, the pool graduates to a
                Meteora DAMM v2 pool that keeps trading on its own.
              </Text>
            ) : null}

            <View style={styles.summary}>
              <View style={styles.summaryHead}>
                <View style={styles.summaryThumb}>
                  {stillUri ? <ExpoImage source={{ uri: stillUri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryName} numberOfLines={1}>
                    {name.trim() || "Your post"}
                  </Text>
                  <Text style={styles.summaryTicker}>${cleanSymbol || "TICKER"}</Text>
                </View>
              </View>
              <SummaryRow label="Curve" value={CURVE_PRESETS.find((p) => p.id === preset)?.label ?? preset} />
              <SummaryRow label="Network fee" value={`≈ ${LAUNCH_FEE_SOL} SOL, mostly account rent`} />
              <SummaryRow
                label="Your balance"
                value={!wallet.address ? "No wallet connected" : sol === null ? "Reading…" : `${sol.toFixed(4)} SOL`}
                tone={lowSol ? "bad" : undefined}
              />
              <View style={styles.approvals}>
                <Text style={styles.approvalsTitle}>2 quick approvals</Text>
                <Text style={styles.approvalsText}>One creates your curve, one opens the pool. Solana can't fit both in one.</Text>
              </View>
              {lowSol ? <Text style={styles.inlineError}>A launch needs about {LAUNCH_FEE_SOL} SOL. Get devnet SOL first, it's free.</Text> : null}
            </View>
          </ScrollView>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky CTA above the tab bar */}
      <View style={[styles.ctaBar, { bottom: tabBar.height - 6 }]}>
        {step > 0 ? (
          <Pressable onPress={() => goTo(step - 1)} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M15 6l-6 6 6 6" stroke={theme.colors.text} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ) : null}
        <Pressable
          onPress={cta.enabled ? cta.onPress : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: !cta.enabled }}
          style={({ pressed }) => [styles.cta, !cta.enabled ? styles.ctaOff : null, { transform: [{ scale: pressed && cta.enabled ? 0.98 : 1 }] }]}
        >
          <Text style={[styles.ctaText, !cta.enabled ? { color: theme.colors.muted } : null]} numberOfLines={1}>
            {cta.label}
          </Text>
        </Pressable>
      </View>

      <LaunchProgress
        visible={progressOpen}
        steps={steps}
        error={launchError}
        busy={busy}
        onRetry={() => void launch()}
        onClose={() => {
          if (busy) return;
          setProgressOpen(false);
          setLaunchError(null);
        }}
      />
      <LaunchSuccess
        visible={live !== null}
        name={live?.name ?? ""}
        symbol={live?.symbol ?? ""}
        imageUri={stillUri}
        onView={() => {
          const mint = live?.baseMint;
          reset();
          if (mint) router.push(`/coin/${mint}` as never);
        }}
        onShare={() => {
          if (!live) return;
          void Share.share({
            message: `${live.name} ($${live.symbol}) is live on Juno. Every post is a market. ${appUrl()}/coin/${live.baseMint}`,
          }).catch(() => undefined);
        }}
        onDone={reset}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function BigAction({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bigAction, primary ? styles.bigActionPrimary : null, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      accessibilityRole="button"
    >
      <Text style={styles.bigActionText}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, error, hint, children }: { label: string; error: string | null; hint: string | null; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={[styles.hint, { color: theme.colors.neg }]}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, tone === "bad" ? { color: theme.colors.neg } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

/** The post as the feed will draw it, so the creator sees what everyone else will. */
function PostPreview({
  wallet,
  name,
  symbol,
  caption,
  stillUri,
  video,
}: {
  wallet: string | null;
  name: string;
  symbol: string;
  caption: string;
  stillUri: string | null;
  video: string | null;
}) {
  const handle = useHandle(wallet);
  return (
    <View style={styles.feedCard}>
      <View style={styles.feedHead}>
        <Identicon seed={wallet ?? "you"} size={36} label={handle ? handle.slice(0, 2) : "YO"} />
        <View style={{ flex: 1 }}>
          <Text style={styles.feedHandle}>{handle || "you"}</Text>
          <Text style={styles.feedMeta}>now · new market</Text>
        </View>
      </View>
      <View style={styles.feedMedia}>
        {video ? <VideoPreview uri={video} /> : stillUri ? <ExpoImage source={{ uri: stillUri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.feedActions}>
        <Text style={styles.feedWorth}>$0 mkt cap</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.feedBuy}>
          <Text style={styles.feedBuyText}>Buy</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 4 }}>
        <Text style={styles.feedTitle} numberOfLines={2}>
          {name} <Text style={styles.feedTicker}>${symbol}</Text>
        </Text>
        {caption ? (
          <Text style={styles.feedCaption} numberOfLines={3}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const CORNER = 22;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 52 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  headerTitle: { flex: 1, textAlign: "center", fontSize: theme.type.lead.size, fontWeight: "800", color: theme.colors.text },
  progress: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  progressItem: { flex: 1, gap: 6, minHeight: 44, justifyContent: "center" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: theme.colors.lineStrong, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: theme.colors.ink },
  progressLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted },
  progressLabelOn: { color: theme.colors.text },
  page: { paddingHorizontal: 16, paddingTop: 6, gap: 18 },
  kindSwitch: { flexDirection: "row", alignSelf: "center", padding: 4, borderRadius: 999, backgroundColor: theme.colors.surface },
  kindItem: { minHeight: 40, minWidth: 96, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  kindItemOn: { backgroundColor: theme.colors.ink },
  kindText: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.muted },
  kindTextOn: { color: theme.colors.onInk },
  preview: { width: "100%", borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.colors.ink },
  previewChips: { position: "absolute", bottom: 26, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18,21,14,0.72)",
  },
  chipText: { fontSize: 13, fontWeight: "800", color: theme.colors.onInk },
  cropFrame: { position: "absolute", top: 14, left: 14, right: 14, bottom: 14 },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: theme.colors.lime },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  empty: {
    width: "100%",
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    backgroundColor: theme.colors.surface,
    ...theme.shadow.card,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.lime,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: theme.type.heading.size, fontWeight: "900", color: theme.colors.text, letterSpacing: -0.6 },
  emptySub: { fontSize: theme.type.label.size, color: theme.colors.muted, textAlign: "center" },
  emptyActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  bigAction: {
    minHeight: 50,
    minWidth: 128,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
  },
  bigActionPrimary: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  bigActionText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onLime },
  inlineError: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.neg },
  label: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.text },
  hint: { fontSize: theme.type.caption.size, color: theme.colors.muted },
  bigInput: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    fontSize: theme.type.title.size,
    fontWeight: "700",
    color: theme.colors.text,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  tickerBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingLeft: 8,
  },
  inputBad: { borderColor: theme.colors.neg },
  inputOk: { borderColor: theme.colors.pos },
  dollar: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.lime },
  dollarText: { fontSize: 20, fontWeight: "900", color: theme.colors.onLime },
  tickerInput: { flex: 1, backgroundColor: "transparent", letterSpacing: 1.5, borderWidth: 0 },
  captionInput: { minHeight: 110, paddingTop: 14, fontSize: theme.type.body.size, fontWeight: "500", textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", fontSize: 12, color: theme.colors.muted, fontVariant: ["tabular-nums"], marginTop: -2 },
  sectionTitle: { fontSize: theme.type.title.size, fontWeight: "900", color: theme.colors.text, letterSpacing: -0.4, marginTop: 4 },
  sectionSub: { fontSize: theme.type.label.size, color: theme.colors.muted, marginTop: -10 },
  feedCard: { borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.colors.surface, ...theme.shadow.card },
  feedHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  feedHandle: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.text },
  feedMeta: { fontSize: 12, color: theme.colors.muted },
  feedMedia: { width: "100%", aspectRatio: 1, backgroundColor: theme.colors.surfaceAlt },
  feedActions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 },
  feedWorth: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.text },
  feedBuy: { minHeight: 36, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.lime },
  feedBuyText: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.onLime },
  feedTitle: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.text },
  feedTicker: { color: theme.colors.muted, fontWeight: "700" },
  feedCaption: { fontSize: theme.type.label.size, lineHeight: 19, color: theme.colors.text },
  disclosure: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  disclosureText: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.muted },
  advanced: { fontSize: theme.type.label.size, lineHeight: 20, color: theme.colors.text, marginTop: -8 },
  summary: { gap: 12, padding: 16, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, ...theme.shadow.card },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryThumb: { width: 52, height: 52, borderRadius: 14, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  summaryName: { fontSize: theme.type.lead.size, fontWeight: "800", color: theme.colors.text },
  summaryTicker: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.muted, letterSpacing: 0.5 },
  summaryRow: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  summaryLabel: { fontSize: theme.type.label.size, color: theme.colors.muted },
  summaryValue: { flexShrink: 1, textAlign: "right", fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.text },
  approvals: { padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.limeSoft, gap: 2 },
  approvalsTitle: { fontSize: theme.type.label.size, fontWeight: "800", color: theme.colors.onLime },
  approvalsText: { fontSize: theme.type.caption.size, lineHeight: 16, color: theme.colors.onLime },
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: theme.colors.bg,
  },
  back: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  cta: {
    flex: 1,
    minHeight: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: theme.colors.lime,
    ...theme.shadow.card,
  },
  ctaOff: { backgroundColor: theme.colors.surface, shadowOpacity: 0 },
  ctaText: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.onLime },
});
