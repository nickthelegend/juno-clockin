import { describe, expect, it } from 'vitest';
import { coinBlink } from '../lib/blink';
const mint = 'Ag79NjwC4wEM5hoxW8AasAjjwiphRyZqP7BQyqd8tiD3';
describe('mobile Blink sharing', () => {
  it('uses the Actions buy endpoint and preserves the mint inside the nested URI', () => {
    const link = new URL(coinBlink(mint, 'https://actions.example/path')!);
    expect(link.searchParams.get('cluster')).toBe('devnet');
    expect(link.searchParams.get('action')).toBe(`solana-action:https://actions.example/api/actions/buy?mint=${mint}`);
  });
  it.each([undefined, '', 'http://actions.example', 'https://user:pass@actions.example', 'invalid'])('keeps normal sharing when the host is absent or invalid: %s', (host) => {
    expect(coinBlink(mint, host)).toBeNull();
  });
  it('shares the Boost endpoint with the post parameter', () => {
    const link = new URL(coinBlink(mint, 'https://actions.example', 'boost')!);
    expect(link.searchParams.get('action')).toBe(`solana-action:https://actions.example/api/actions/boost?post=${mint}`);
  });
  it('rejects an invalid mint' , () => {
    expect(coinBlink('invalid', 'https://actions.example')).toBeNull();
  });
});
