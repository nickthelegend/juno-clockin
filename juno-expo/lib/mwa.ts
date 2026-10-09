import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Buffer } from "buffer";
import { buildSignInInput, createSignInMessageText, utf8, verifiedProof, messageSignature, type SignInInput, type SiwsProof } from "./siws";
import { PublicKey, Transaction } from "@solana/web3.js";

/**
 * Solana Mobile Wallet Adapter — the Android wallet path.
 *
 * On a Seeker this opens Seed Vault's signing sheet (fingerprint or PIN, no
 * app switch); on any other Android phone it opens whichever MWA wallet is
 * installed (Phantom, Solflare, Backpack…). The key never touches Juno.
 *
 * The protocol package has an Android native module only. Importing it on iOS
 * throws at module load ("SolanaMobileWalletAdapter could not be found"), so it
 * is required lazily and only on Android. iOS uses the guest devnet key or
 * Privy instead, and says so.
 *
 * ## Auth token
 *
 * `authorize` returns an `auth_token`. Cached in the keystore, it lets the
 * next session reauthorize silently, so opening Juno every day to clock in
 * costs one signature, not a connect prompt *and* a signature.
 */

export const MWA_AVAILABLE = Platform.OS === "android";

const CHAIN = "solana:devnet";
const TOKEN_KEY = "juno.mwa.auth.v1";
const ADDRESS_KEY = "juno.mwa.address.v1";

export const APP_IDENTITY = {
  name: "Juno",
  // The Juno web build: wallets resolve `icon` against `uri`, and this
  // favicon answers 200 (a GitHub repo URL has no favicon at that path).
  uri: "https://juno-app-chi.vercel.app",
  icon: "favicon.ico",
};

type MwaWallet = {
  authorize: (input: {
    chain: string;
    identity: typeof APP_IDENTITY;
    auth_token?: string;
    sign_in_payload?: SignInInput;
  }) => Promise<{ auth_token: string; accounts: Array<{ address: string; label?: string }>; sign_in_result?: { address: string; signed_message: string; signature: string } }>;
  deauthorize: (input: { auth_token: string }) => Promise<void>;
  signTransactions: (input: { transactions: Transaction[] }) => Promise<Transaction[]>;
  signMessages: (input: { addresses: string[]; payloads: Uint8Array[] }) => Promise<Uint8Array[]>;
};

type Transact = <T>(callback: (wallet: MwaWallet) => Promise<T>) => Promise<T>;

function loadTransact(): Transact {
  if (!MWA_AVAILABLE) throw new Error("Mobile Wallet Adapter is Android-only");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@solana-mobile/mobile-wallet-adapter-protocol-web3js") as {
    transact: Transact;
  };
  return mod.transact;
}

/** The base64 account address MWA returns, as base58. */
function toBase58(address: string): string {
  return new PublicKey(Buffer.from(address, "base64")).toBase58();
}

export async function cachedMwaAddress(): Promise<string | null> {
  if (!MWA_AVAILABLE) return null;
  try {
    return await SecureStore.getItemAsync(ADDRESS_KEY);
  } catch {
    return null;
  }
}

/**
 * Authorize inside an open session, reusing the cached token when there is one.
 *
 * A wallet that has forgotten us (reinstalled, token expired) rejects the old
 * token; that is retried once without it rather than surfaced as an error.
 */
async function authorize(wallet: MwaWallet): Promise<{ address: string; base64: string }> {
  const cached = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  let result;
  try {
    result = await wallet.authorize({
      chain: CHAIN,
      identity: APP_IDENTITY,
      auth_token: cached ?? undefined,
    });
  } catch (error) {
    if (!cached || /cancel|declin|reject/i.test(error instanceof Error ? error.message : String(error))) throw error;
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    result = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY });
  }
  const account = result.accounts[0];
  if (!account) throw new Error("The wallet did not share an account");
  const address = toBase58(account.address);
  await SecureStore.setItemAsync(TOKEN_KEY, result.auth_token);
  await SecureStore.setItemAsync(ADDRESS_KEY, address);
  return { address, base64: account.address };
}

/** One authorization sheet with SIWS; older wallets fall back to signMessages. */
export async function mwaSignIn(): Promise<{ address: string; proof: SiwsProof | null }> {
  const input = buildSignInInput();
  return loadTransact()(async (wallet) => {
    const result = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY, sign_in_payload: input });
    const account = result.accounts[0];
    if (!account) throw new Error("The wallet did not share an account");
    const address = toBase58(account.address);
    let proof: SiwsProof | null = null;
    if (result.sign_in_result) {
      const signed = result.sign_in_result;
      if (toBase58(signed.address) !== address) throw new Error("Sign-in account does not match the connected wallet");
      proof = verifiedProof(input, { address, signedMessage: Buffer.from(signed.signed_message, "base64"),
        signature: Buffer.from(signed.signature, "base64") }, "siws", account.label ?? "Solana wallet");
    } else {
      const signedMessage = utf8(createSignInMessageText({ ...input, address }));
      let signed: Uint8Array | undefined;
      try {
        [signed] = await wallet.signMessages({ addresses: [account.address], payloads: [signedMessage] });
      } catch {
        // Authorization succeeded, but the person may decline the optional proof.
      }
      if (signed) proof = verifiedProof(input, { address, signedMessage, signature: messageSignature(address, signedMessage, signed) },
        "signMessage", account.label ?? "Solana wallet");
    }
    await SecureStore.setItemAsync(TOKEN_KEY, result.auth_token);
    await SecureStore.setItemAsync(ADDRESS_KEY, address);
    return { address, proof };
  });
}

export async function mwaConnect(): Promise<string> {
  const transact = loadTransact();
  return transact(async (wallet) => (await authorize(wallet)).address);
}

export async function mwaSignTransaction(transaction: Transaction): Promise<Transaction> {
  const transact = loadTransact();
  return transact(async (wallet) => {
    const account = await authorize(wallet);
    if (account.address !== transaction.feePayer?.toBase58()) throw new Error("Authorized wallet differs from the transaction owner");
    const [signed] = await wallet.signTransactions({ transactions: [transaction] });
    if (!signed) throw new Error("The wallet returned no signature");
    return signed;
  });
}

export async function mwaSignMessage(text: string): Promise<Uint8Array> {
  const transact = loadTransact();
  return transact(async (wallet) => {
    const { address, base64 } = await authorize(wallet);
    const [signed] = await wallet.signMessages({
      addresses: [base64],
      payloads: [new TextEncoder().encode(text)],
    });
    if (!signed) throw new Error("The wallet returned no signature");
    return messageSignature(address, utf8(text), signed);
  });
}

export async function mwaDisconnect(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(ADDRESS_KEY).catch(() => undefined);
  if (!token || !MWA_AVAILABLE) return;
  try {
    const transact = loadTransact();
    await transact((wallet) => wallet.deauthorize({ auth_token: token }));
  } catch {
    // Forgetting locally is what matters; the wallet may already have.
  }
}

/** A friendly message for the errors people actually hit. */
export function mwaErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/ERROR_WALLET_NOT_FOUND|no installed wallet|Found no installed wallet|ActivityNotFound/i.test(text)) {
    return "No Solana wallet app found. Install Phantom or Solflare, or use Seed Vault on a Seeker.";
  }
  if (/declin|reject|cancel|ERROR_AUTHORIZATION_FAILED|NotAuthorized/i.test(text)) {
    return "The wallet declined the request.";
  }
  return text;
}
