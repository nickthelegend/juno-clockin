/** Minimal shapes of Vercel's Node request/response (no @vercel/node dependency). */
export interface Req {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
export interface Res {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  json(body: unknown): void;
  end(): void;
}

export const ACTION_VERSION = "2.4";
/** Solana devnet's genesis hash, as the Actions spec names a chain. */
export const BLOCKCHAIN_ID = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

/** CORS + Actions headers, per the Solana Actions spec. */
export const ACTION_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": ACTION_VERSION,
  "X-Blockchain-Ids": BLOCKCHAIN_ID,
  "Content-Type": "application/json",
};

export function send(res: Res, code: number, body?: unknown) {
  for (const [k, v] of Object.entries(ACTION_HEADERS)) res.setHeader(k, v);
  if (body === undefined) {
    res.status(code).end();
    return;
  }
  res.status(code).json(body);
}

export const q = (req: Req, k: string) => {
  const v = req.query[k];
  return Array.isArray(v) ? v[0] : v;
};

/** The deployment's own origin, for absolute icon and href URLs. */
export function origin(req: Req): string {
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host) as string;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  return `${proto}://${host}`;
}

export const parseBody = (b: unknown) => (typeof b === "string" ? JSON.parse(b) : b) as Record<string, unknown> | undefined;
export const RPC = process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";
