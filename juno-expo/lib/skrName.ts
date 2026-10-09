import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';

/**
 * `.skr` names: every Seeker owner gets one (AllDomains / ANS on mainnet).
 * Reverse resolution — wallet address → `alice.skr` — written against the
 * on-chain layouts directly (the same derivations as `@onsol/tldparser`), so
 * the app does not ship ethers. Read-only mainnet; nothing here signs.
 *
 * Pure: the RPC is injected (`AccountReader`), so this is unit-tested with
 * fixtures captured from mainnet.
 *
 * Resolution order for an owner:
 *  1. Their AllDomains *main domain* (`main_domain` PDA), if it is a `.skr`
 *     and the name record really is theirs and not expired.
 *  2. Otherwise the `.skr` name records they own (getProgramAccounts on ANS,
 *     filtered by parent = `.skr` and owner), reverse-looked-up to text, the
 *     first one alphabetically.
 */
export const ANS_PROGRAM = new PublicKey('ALTNSZ46uaAUU7XUV6awvdorLGqAsPwa9shm7h4uP2FK');
export const TLD_HOUSE_PROGRAM = new PublicKey('TLDHkysf5pCnKsVA4gXpNvmy7psXLPEu4LAdDJthT9S');
const HASH_PREFIX = 'ALT Name Service';
/** Name record header: 8 disc · parent 32 · owner 32 · class 32 · expiresAt 8 · createdAt 8 · nonTransferable 1 · pad 79 */
export const NAME_HEADER = 200;

export const hashedName = (name: string): Buffer => Buffer.from(sha256(Buffer.from(HASH_PREFIX + name, 'utf8')));

export function nameAccountKey(hash: Buffer, nameClass?: PublicKey, parent?: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [hash, nameClass ? nameClass.toBuffer() : Buffer.alloc(32), parent ? parent.toBuffer() : Buffer.alloc(32)],
    ANS_PROGRAM,
  )[0];
}

/** `3mX9b4…NcU`, the ANS origin (constant; derived for clarity and tested). */
export const ORIGIN = nameAccountKey(hashedName('ANS'));
export const tldParent = (tld: string) => nameAccountKey(hashedName(tld), undefined, ORIGIN);
export const tldHouse = (tld: string) =>
  PublicKey.findProgramAddressSync([Buffer.from('tld_house'), Buffer.from(tld.toLowerCase())], TLD_HOUSE_PROGRAM)[0];
export const mainDomainKey = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('main_domain'), owner.toBuffer()], TLD_HOUSE_PROGRAM)[0];
export const reverseKey = (nameAccount: PublicKey, tld: string) =>
  nameAccountKey(hashedName(nameAccount.toBase58()), tldHouse(tld));

export const SKR_PARENT = tldParent('.skr');

export interface NameRecord { parent: string; owner: string; expiresAt: number }
export function parseNameRecord(data: Uint8Array): NameRecord | null {
  if (data.length < NAME_HEADER) return null;
  const b = Buffer.from(data);
  const lo = b.readUInt32LE(104);
  const hi = b.readUInt32LE(108);
  return {
    parent: new PublicKey(b.subarray(8, 40)).toBase58(),
    owner: new PublicKey(b.subarray(40, 72)).toBase58(),
    expiresAt: hi * 2 ** 32 + lo,
  };
}

/** MainDomain: 8 disc · nameAccount 32 · tld (borsh string) · domain (borsh string). */
export function parseMainDomain(data: Uint8Array): { nameAccount: string; tld: string; domain: string } | null {
  try {
    const b = Buffer.from(data);
    const nameAccount = new PublicKey(b.subarray(8, 40)).toBase58();
    let o = 40;
    // toString(enc, start, end), never subarray().toString(): on React Native
    // the `buffer` polyfill's subarray() is a plain Uint8Array, whose
    // toString() is "97,108,…" (this shipped "98.skr" for "b.skr" once).
    const tl = b.readUInt32LE(o); const tld = b.toString('utf8', o + 4, o + 4 + tl); o += 4 + tl;
    const dl = b.readUInt32LE(o); const domain = b.toString('utf8', o + 4, o + 4 + dl);
    if (!tld || !domain) return null;
    return { nameAccount, tld, domain };
  } catch {
    return null;
  }
}

/** The text a reverse-lookup record holds after its header, e.g. "alice". */
export function parseReverse(data: Uint8Array): string | null {
  if (data.length <= NAME_HEADER) return null;
  const s = Buffer.from(data).toString('utf8', NAME_HEADER).replace(/\0[\s\S]*$/, '').trim();
  return /^[a-z0-9_-]{1,64}$/i.test(s) ? s.toLowerCase() : null;
}

const live = (r: NameRecord, nowSec: number) => r.expiresAt === 0 || r.expiresAt > nowSec;

/** What resolution needs from an RPC. Real code passes a mainnet Connection. */
export interface AccountReader {
  getMultipleAccountsInfo(keys: PublicKey[]): Promise<({ data: Uint8Array } | null)[]>;
  getProgramAccounts(program: PublicKey, cfg: {
    filters: { memcmp: { offset: number; bytes: string } }[];
    dataSlice: { offset: number; length: number };
  }): Promise<readonly { pubkey: PublicKey }[]>;
}

/** owner → "alice.skr", or null when they hold no live .skr. */
export async function resolveSkr(rpc: AccountReader, ownerB58: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const owner = new PublicKey(ownerB58);
  // 1. main domain
  const [md] = await rpc.getMultipleAccountsInfo([mainDomainKey(owner)]);
  const main = md ? parseMainDomain(md.data) : null;
  if (main && main.tld === '.skr') {
    const [rec] = await rpc.getMultipleAccountsInfo([new PublicKey(main.nameAccount)]);
    const r = rec ? parseNameRecord(rec.data) : null;
    if (r && r.owner === ownerB58 && r.parent === SKR_PARENT.toBase58() && live(r, nowSec)) {
      return `${main.domain.toLowerCase()}.skr`;
    }
  }
  // 2. owned .skr names, reverse-looked-up
  const owned = await rpc.getProgramAccounts(ANS_PROGRAM, {
    filters: [
      { memcmp: { offset: 8, bytes: SKR_PARENT.toBase58() } },
      { memcmp: { offset: 40, bytes: ownerB58 } },
    ],
    dataSlice: { offset: 0, length: NAME_HEADER },
  });
  if (!owned.length) return null;
  const keys = owned.slice(0, 20).map((a) => a.pubkey);
  const infos = await rpc.getMultipleAccountsInfo([...keys, ...keys.map((k) => reverseKey(k, '.skr'))]);
  const names: string[] = [];
  keys.forEach((_, i) => {
    const rec = infos[i] ? parseNameRecord(infos[i]!.data) : null;
    const name = infos[keys.length + i] ? parseReverse(infos[keys.length + i]!.data) : null;
    if (rec && name && rec.owner === ownerB58 && live(rec, nowSec)) names.push(name);
  });
  names.sort();
  return names[0] ? `${names[0]}.skr` : null;
}

/** "alice.skr" when known, else "9DZk…BJiE". Never blocks on the lookup. */
export function displayName(address: string | null | undefined, skr: string | null | undefined, n = 4): string {
  if (skr) return skr;
  if (!address) return '-';
  return address.length > 2 * n + 1 ? `${address.slice(0, n)}…${address.slice(-n)}` : address;
}
