/**
 * Sign In With Solana: message building and on-device verification
 * (mobile/src/chain/siws.ts).
 *
 *   cd juno-expo && npm test
 */
import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import {
  createSignInMessageText as standardText,
  parseSignInMessageText as standardParse,
  verifySignIn as standardVerify,
} from '@solana/wallet-standard-util';
import {
  SIWS_CHAIN, SIWS_DOMAIN, buildSignInInput, createSignInMessageText, makeNonce,
  parseSignInMessageText, messageSignature, signInLocally, utf8, verifySignIn,
} from '../lib/siws';

const NOW = Date.parse('2026-10-07T18:00:00.000Z');
const kp = Keypair.fromSeed(new Uint8Array(32).fill(7));
const input = () => buildSignInInput(new Date(NOW), 'a1b2c3d4e5f60718293a4b5c');

describe('SIWS message', () => {
  it('asks for domain, nonce, issuedAt and chain solana:devnet', () => {
    const i = input();
    expect(i.domain).toBe(SIWS_DOMAIN);
    expect(i.chainId).toBe(SIWS_CHAIN);
    expect(i.chainId).toBe('solana:devnet');
    expect(i.nonce).toBe('a1b2c3d4e5f60718293a4b5c');
    expect(i.issuedAt).toBe('2026-10-07T18:00:00.000Z');
    expect(i.statement).toMatch(/not a transaction/);
  });

  it('is byte-identical to the wallet-standard format', () => {
    const full = { ...input(), address: kp.publicKey.toBase58() };
    expect(createSignInMessageText(full)).toBe(standardText(full));
    const extra = { ...full, expirationTime: '2026-10-08T00:00:00.000Z', requestId: 'r1', resources: ['https://a', 'https://b'] };
    expect(createSignInMessageText(extra)).toBe(standardText(extra));
    expect(createSignInMessageText(full)).toMatchInlineSnapshot(`
      "juno-app-chi.vercel.app wants you to sign in with your Solana account:
      GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB

      Sign in to Juno. This signs a message, not a transaction: it costs nothing.

      URI: https://juno-app-chi.vercel.app
      Version: 1
      Chain ID: solana:devnet
      Nonce: a1b2c3d4e5f60718293a4b5c
      Issued At: 2026-10-07T18:00:00.000Z"
    `);
  });

  it('parses back to the same fields as the wallet-standard parser', () => {
    const text = createSignInMessageText({ ...input(), address: kp.publicKey.toBase58(), resources: ['x'] });
    expect(parseSignInMessageText(text)).toEqual(standardParse(text));
    expect(parseSignInMessageText('hello')).toBeNull();
  });

  it('makes fresh hex nonces', () => {
    const a = makeNonce();
    const b = makeNonce();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toBe(b);
  });
});

describe('SIWS verification (on-device)', () => {
  it('accepts a correctly signed message, and agrees with wallet-standard verifySignIn', () => {
    const i = input();
    const out = signInLocally(i, kp.secretKey);
    expect(out.address).toBe(kp.publicKey.toBase58());
    const v = verifySignIn(i, out, NOW + 30_000);
    expect(v.ok).toBe(true);
    expect(standardVerify(i, {
      account: { address: kp.publicKey.toBase58(), publicKey: kp.publicKey.toBytes() } as never,
      signedMessage: out.signedMessage, signature: out.signature,
    })).toBe(true);
  });

  it('rejects a tampered message or signature', () => {
    const i = input();
    const out = signInLocally(i, kp.secretKey);
    const text = Buffer.from(out.signedMessage).toString('utf8').replace(`${SIWS_DOMAIN} wants`, 'evil.fun wants');
    expect(verifySignIn(i, { ...out, signedMessage: utf8(text) }, NOW)).toMatchObject({ ok: false, reason: 'signature does not verify' });
    const sig = out.signature.slice(); sig[3] ^= 1;
    expect(verifySignIn(i, { ...out, signature: sig }, NOW).ok).toBe(false);
  });

  it('rejects a valid signature from another key', () => {
    const i = input();
    const out = signInLocally(i, kp.secretKey);
    expect(verifySignIn(i, { ...out, address: Keypair.generate().publicKey.toBase58() }, NOW).ok).toBe(false);
  });

  it('rejects a signed proof missing the requested chain', () => {
    const i = input();
    const out = signInLocally({ ...i, chainId: undefined }, kp.secretKey);
    expect(verifySignIn(i, out, NOW).ok).toBe(false);
  });

  it('rejects a replay: a properly signed message with an old nonce', () => {
    const old = buildSignInInput(new Date(NOW), 'deadbeefdeadbeefdeadbeef');
    const out = signInLocally(old, kp.secretKey);
    expect(verifySignIn(input(), out, NOW)).toMatchObject({ ok: false, reason: 'nonce mismatch' });
  });

  it('rejects another domain, another chain, and a stale issue time', () => {
    const i = input();
    expect(verifySignIn(i, signInLocally({ ...i, domain: 'evil.fun' }, kp.secretKey), NOW))
      .toMatchObject({ ok: false, reason: 'domain mismatch (evil.fun)' });
    expect(verifySignIn(i, signInLocally({ ...i, chainId: 'solana:mainnet' }, kp.secretKey), NOW))
      .toMatchObject({ ok: false, reason: 'chain mismatch (solana:mainnet)' });
    expect(verifySignIn(i, signInLocally(i, kp.secretKey), NOW + 11 * 60_000))
      .toMatchObject({ ok: false, reason: 'stale or missing Issued At' });
    expect(verifySignIn(i, signInLocally({ ...i, expirationTime: new Date(NOW - 1).toISOString() }, kp.secretKey), NOW))
      .toMatchObject({ ok: false, reason: 'expired' });
  });
});

describe('MWA signed message layouts', () => {
  it('accepts a raw signature and both wallet payload orders', () => {
    const out = signInLocally(input(), kp.secretKey);
    for (const signed of [out.signature, Uint8Array.from([...out.signedMessage, ...out.signature]), Uint8Array.from([...out.signature, ...out.signedMessage])]) {
      expect(messageSignature(out.address, out.signedMessage, signed)).toEqual(out.signature);
    }
  });
  it('refuses malformed wallet payloads', () => {
    const out = signInLocally(input(), kp.secretKey);
    expect(() => messageSignature(out.address, out.signedMessage, new Uint8Array(64))).toThrow(/invalid message signature/);
  });
});
