import { describe, expect, it } from 'vitest';
import { RequestContext } from './request-context';

describe('RequestContext', () => {
  it('keeps concurrent contexts separate', async () => {
    // The setTimeout is the point: a module-level variable would be overwritten before the first resumes.
    const ctx = new RequestContext();
    const seen: (string | undefined)[] = [];

    const one = ctx.run({ requestId: 'req-1' }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      seen.push(ctx.current?.requestId);
    });
    const two = ctx.run({ requestId: 'req-2' }, async () => {
      seen.push(ctx.current?.requestId);
    });

    await Promise.all([one, two]);
    expect(seen.sort()).toEqual(['req-1', 'req-2']);
  });

  it('returns undefined outside any request', () => {
    expect(new RequestContext().current).toBeUndefined();
  });
});
