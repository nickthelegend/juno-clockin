import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, Transaction } from '@solana/web3.js';
import { createBoostHandler } from '../../juno-actions/api/actions/boost';
import buy from '../../juno-actions/api/actions/buy';
import { ACTION_HEADERS, type Req, type Res } from '../../juno-actions/lib/http';
import { buildBoostTransaction } from '../lib/txbuild';
const mocks = vi.hoisted(() => ({ getCoin: vi.fn(), buildBuy: vi.fn(), balance: vi.fn(), blockhash: vi.fn() }));
vi.mock('../../juno-actions/lib/juno', async (original) => ({ ...await original<typeof import('../../juno-actions/lib/juno')>(), getCoin: mocks.getCoin, buildBuy: mocks.buildBuy }));
const boost = createBoostHandler({ readCoin: mocks.getCoin, connect: () => ({
  getTokenAccountBalance: mocks.balance, getLatestBlockhash: mocks.blockhash,
}) });
const user = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey;
const creator = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey;
const mint = 'Ag79NjwC4wEM5hoxW8AasAjjwiphRyZqP7BQyqd8tiD3';
const window = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100 };
function request(method = 'POST', amount = '5'): Req {
  return { method, query: { post: mint, mint, amount }, body: { account: user.toBase58() }, headers: { host: 'actions.example' } };
}
async function invoke(handler: typeof boost, req = request()) {
  const result = { status: 0, headers: {} as Record<string, string>, body: undefined as any };
  const response: Res = { setHeader: (key, value) => { result.headers[key] = value; }, status: (code) => { result.status = code; return response; }, json: (body) => { result.body = body; }, end: () => {} };
  await handler(req, response); return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCoin.mockResolvedValue({ name: 'Example', symbol: 'EX', creator: { wallet: creator.toBase58() }, quote: { symbol: 'SOL' }, curve: { graduated: false }, media: { kind: 'image', url: 'https://example.com/post.png' } });
  mocks.balance.mockResolvedValue({ value: { uiAmount: 30 } });
  mocks.blockhash.mockResolvedValue(window);
  mocks.buildBuy.mockResolvedValue({ transaction: 'unsigned', amountOut: 100, symbol: 'EX', quoteSymbol: 'SOL' });
});
describe('Actions routes, offline runtime', () => {
  it.each([buy, boost])('serves preflight without network and returns Actions headers', async (handler) => {
    const response = await invoke(handler, request('OPTIONS'));
    expect(response.status).toBe(200); expect(response.headers).toEqual(ACTION_HEADERS);
    expect(mocks.getCoin).not.toHaveBeenCalled();
  });
  it('builds a boost identical to the mobile builder', async () => {
    const response = await invoke(boost);
    expect(response.status).toBe(200);
    const transaction = Transaction.from(Buffer.from(response.body.transaction, 'base64'));
    expect(transaction.serializeMessage()).toEqual(buildBoostTransaction({ user, creator, coinMint: mint, amount: 5, ...window }).serializeMessage());
  });
  it('self-boost metadata agrees with its all-treasury transaction', async () => {
    mocks.getCoin.mockResolvedValueOnce({ name: 'Own post', creator: { wallet: user.toBase58() } });
    const response = await invoke(boost);
    expect(response.body.message).toContain('whole amount');
    expect(Transaction.from(Buffer.from(response.body.transaction, 'base64')).instructions).toHaveLength(2);
  });
  it('reports an unavailable balance as unknown, never zero', async () => {
    mocks.balance.mockRejectedValue(new Error('429 RPC throttled'));
    const response = await invoke(boost);
    expect(response.status).toBe(400); expect(response.body.message).toContain('Could not read');
    expect(response.body.message).not.toContain('0 dSKR'); expect(mocks.blockhash).not.toHaveBeenCalled();
  });
  it('explains an absent token account as an empty balance', async () => {
    mocks.balance.mockRejectedValue(new Error('could not find account'));
    const response = await invoke(boost);
    expect(response.status).toBe(422); expect(response.body.message).toContain('0 dSKR');
  });
  it('refuses unsupported amounts and malformed accounts before RPC', async () => {
    expect((await invoke(boost, request('POST', '999'))).status).toBe(400);
    const req = request(); req.body = { account: 'invalid' };
    expect((await invoke(boost, req)).status).toBe(400);
    expect(mocks.balance).not.toHaveBeenCalled();
  });
  it('buy passes the same owner, mint and amount into its builder', async () => {
    const response = await invoke(buy, request('POST', '0.05'));
    expect(response.status).toBe(200);
    expect(mocks.buildBuy).toHaveBeenCalledWith(mint, user.toBase58(), 0.05);
    expect(response.body.transaction).toBe('unsigned');
  });
  it('buy rejects amounts below its published minimum before building a transaction', async () => {
    const response = await invoke(buy, request('POST', '0.0009'));
    expect(response.status).toBe(400); expect(mocks.buildBuy).not.toHaveBeenCalled();
  });
  it('buy metadata disables a graduated bonding curve', async () => {
    mocks.getCoin.mockResolvedValueOnce({ name: 'Example', symbol: 'EX', quote: { symbol: 'SOL' }, curve: { graduated: true }, media: { kind: 'image', url: 'https://example.com/post.png' } });
    expect((await invoke(buy, request('GET'))).body.disabled).toBe(true);
  });
});
