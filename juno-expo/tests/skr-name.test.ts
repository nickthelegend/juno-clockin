/**
 * .skr reverse resolution (mobile/src/chain/skrName.ts) against accounts
 * captured from mainnet (tests/fixtures/skr-mainnet.json, alice.skr), plus
 * synthetic main-domain / expiry / wrong-owner cases. No network.
 *
 *   cd juno-expo && npm test
 */
import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';
import fixture from './skr-mainnet.json';
import {
  ANS_PROGRAM, NAME_HEADER, ORIGIN, SKR_PARENT, displayName, hashedName, mainDomainKey, nameAccountKey,
  parseMainDomain, parseNameRecord, parseReverse, resolveSkr, reverseKey, tldHouse, type AccountReader,
} from '../lib/skrName';

type Accounts = Record<string, string | null>;

/** A fake RPC over base64 account fixtures. */
function reader(accounts: Accounts, owned: Record<string, string[]>): AccountReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getMultipleAccountsInfo(keys) {
      calls.push('getMultipleAccountsInfo');
      return keys.map((k) => {
        const d = accounts[k.toBase58()];
        return d ? { data: Uint8Array.from(Buffer.from(d, 'base64')) } : null;
      });
    },
    async getProgramAccounts(program, cfg) {
      calls.push('getProgramAccounts');
      expect(program.equals(ANS_PROGRAM)).toBe(true);
      const parent = cfg.filters.find((f) => f.memcmp.offset === 8)!.memcmp.bytes;
      const owner = cfg.filters.find((f) => f.memcmp.offset === 40)!.memcmp.bytes;
      expect(parent).toBe(SKR_PARENT.toBase58());
      return (owned[owner] ?? []).map((k) => ({ pubkey: new PublicKey(k) }));
    },
  };
}

function nameRecord(owner: string, expiresAt = 0, parent = SKR_PARENT.toBase58()): string {
  const b = Buffer.alloc(NAME_HEADER);
  new PublicKey(parent).toBuffer().copy(b, 8);
  new PublicKey(owner).toBuffer().copy(b, 40);
  b.writeUInt32LE(expiresAt % 2 ** 32, 104);
  b.writeUInt32LE(Math.floor(expiresAt / 2 ** 32), 108);
  return b.toString('base64');
}
function reverseRecord(name: string): string {
  return Buffer.concat([Buffer.alloc(NAME_HEADER), Buffer.from(name)]).toString('base64');
}
function mainDomain(nameAccount: string, tld: string, domain: string): string {
  const s = (x: string) => { const l = Buffer.alloc(4); l.writeUInt32LE(x.length); return Buffer.concat([l, Buffer.from(x)]); };
  return Buffer.concat([Buffer.alloc(8), new PublicKey(nameAccount).toBuffer(), s(tld), s(domain)]).toString('base64');
}

describe('.skr derivations', () => {
  it('derives the ANS origin, the .skr parent and the reverse key exactly like AllDomains', () => {
    expect(ORIGIN.toBase58()).toBe('3mX9b4AZaQehNoQGfckVcmgmA6bkBoFcbLj9RMmMyNcU');
    expect(SKR_PARENT.toBase58()).toBe('F3A8kuikEiu6k2399oSJ1PWfcJYDHqpwoQ2e8psSDNuF');
    expect(tldHouse('.skr').toBase58()).toBe('4RKP4BEMu5sXBfXSH7xN2owtQrnAJvhhwtBBmj9JEYkA');
    const alice = nameAccountKey(hashedName('alice'), undefined, SKR_PARENT);
    expect(alice.toBase58()).toBe(fixture.ownedNameAccounts[0]);
    expect(Object.keys(fixture.accounts)).toContain(reverseKey(alice, '.skr').toBase58());
    expect(Object.keys(fixture.accounts)).toContain(mainDomainKey(new PublicKey(fixture.owner)).toBase58());
  });

  it('parses the captured mainnet name record and reverse record', () => {
    const rec = parseNameRecord(Buffer.from((fixture.accounts as Record<string, string | null>)[fixture.ownedNameAccounts[0]]!, 'base64'))!;
    expect(rec.owner).toBe(fixture.owner);
    expect(rec.parent).toBe(SKR_PARENT.toBase58());
    expect(rec.expiresAt).toBe(0);
    const alice = nameAccountKey(hashedName('alice'), undefined, SKR_PARENT);
    expect(parseReverse(Buffer.from((fixture.accounts as Record<string, string | null>)[reverseKey(alice, '.skr').toBase58()]!, 'base64'))).toBe('alice');
  });
});

describe('resolveSkr', () => {
  it('resolves the captured Seeker owner to alice.skr (owned-name path)', async () => {
    const rpc = reader(fixture.accounts as Accounts, { [fixture.owner]: fixture.ownedNameAccounts });
    expect(await resolveSkr(rpc, fixture.owner)).toBe('alice.skr');
    expect(fixture.resolvedLive).toBe('alice.skr'); // same answer the live run gave
  });

  it('returns null for an address with no .skr (caller shows the short address)', async () => {
    const nobody = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
    expect(await resolveSkr(reader({}, {}), nobody)).toBeNull();
    expect(displayName(nobody, null)).toBe(`${nobody.slice(0, 4)}…${nobody.slice(-4)}`);
    expect(displayName(nobody, 'alice.skr')).toBe('alice.skr');
    expect(displayName(null, null)).toBe('-');
  });

  it('prefers a .skr main domain, and checks it is really theirs', async () => {
    const owner = new PublicKey(new Uint8Array(32).fill(3)).toBase58();
    const rec = nameAccountKey(hashedName('zed'), undefined, SKR_PARENT).toBase58();
    const accounts: Accounts = { [mainDomainKey(new PublicKey(owner)).toBase58()]: mainDomain(rec, '.skr', 'zed'), [rec]: nameRecord(owner) };
    expect(await resolveSkr(reader(accounts, {}), owner)).toBe('zed.skr');
    // the main domain points at a record someone else now owns: ignored
    const other = new PublicKey(new Uint8Array(32).fill(4)).toBase58();
    expect(await resolveSkr(reader({ ...accounts, [rec]: nameRecord(other) }, {}), owner)).toBeNull();
  });

  it('ignores a non-.skr main domain and falls back to owned .skr names, alphabetically', async () => {
    const owner = new PublicKey(new Uint8Array(32).fill(5)).toBase58();
    const b = nameAccountKey(hashedName('bravo'), undefined, SKR_PARENT);
    const a = nameAccountKey(hashedName('able'), undefined, SKR_PARENT);
    const accounts: Accounts = {
      [mainDomainKey(new PublicKey(owner)).toBase58()]: mainDomain(b.toBase58(), '.abc', 'bravo'),
      [b.toBase58()]: nameRecord(owner), [reverseKey(b, '.skr').toBase58()]: reverseRecord('bravo'),
      [a.toBase58()]: nameRecord(owner), [reverseKey(a, '.skr').toBase58()]: reverseRecord('able'),
    };
    expect(await resolveSkr(reader(accounts, { [owner]: [b.toBase58(), a.toBase58()] }), owner)).toBe('able.skr');
  });

  it('skips expired names', async () => {
    const owner = new PublicKey(new Uint8Array(32).fill(6)).toBase58();
    const k = nameAccountKey(hashedName('old'), undefined, SKR_PARENT);
    const accounts: Accounts = { [k.toBase58()]: nameRecord(owner, 1_000), [reverseKey(k, '.skr').toBase58()]: reverseRecord('old') };
    expect(await resolveSkr(reader(accounts, { [owner]: [k.toBase58()] }), owner, 2_000)).toBeNull();
  });

  it('rejects junk in a reverse record and a malformed main domain', () => {
    expect(parseReverse(Buffer.from(reverseRecord('bad name!'), 'base64'))).toBeNull();
    expect(parseMainDomain(new Uint8Array(10))).toBeNull();
  });
});
