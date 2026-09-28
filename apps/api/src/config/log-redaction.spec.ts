import pino from 'pino';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS, redactedReqSerializer } from './log-redaction';

describe('LOG_REDACT_PATHS', () => {
  it('covers every path a secret is known to travel', () => {
    // Pinned exactly, so a silently dropped path fails.
    expect([...LOG_REDACT_PATHS]).toEqual([
      'req.headers.cookie',
      'req.headers.authorization',
      'req.query.token',
      'req.query.code',
      'res.headers["set-cookie"]',
      '*.headers.cookie',
      '*.headers.authorization',
    ]);
  });

  it('actually strips those values from an emitted log line', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });

    const logger = pino({ redact: { paths: [...LOG_REDACT_PATHS], remove: true } }, sink);

    // Shaped like pino-http's real request serializer output.
    logger.info(
      {
        req: {
          headers: {
            cookie: 'majlis_session=LEAKED',
            authorization: 'Bearer LEAKED',
          },
          query: { token: 'LEAKED', code: 'LEAKED' },
        },
        res: { headers: { 'set-cookie': 'majlis_session=LEAKED' } },
      },
      'request completed',
    );

    const output = lines.join('');
    expect(output).toContain('request completed');
    expect(output).not.toContain('LEAKED');
  });

  it('strips a nested err.headers.cookie, not only req/res', () => {
    // Catches paths rooted only at req/res: the exception filter logs `{ err }` on 5xx.
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });

    const logger = pino({ redact: { paths: [...LOG_REDACT_PATHS], remove: true } }, sink);

    logger.error(
      { err: { headers: { cookie: 'majlis_session=LEAKED', authorization: 'Bearer LEAKED' } } },
      'Unhandled exception',
    );

    const output = lines.join('');
    expect(output).toContain('Unhandled exception');
    expect(output).not.toContain('LEAKED');
  });
});

describe('redactedReqSerializer', () => {
  it('drops the query string from the logged URL', () => {
    // Path redaction strips req.query but cannot strip a substring of req.url.
    const out = redactedReqSerializer({
      id: 'r1',
      method: 'GET',
      url: '/api/v1/clubs?token=super-secret&status=ACTIVE',
      headers: {},
      query: {},
      params: {},
    } as never);

    expect(out.url).toBe('/api/v1/clubs');
    expect(JSON.stringify(out)).not.toContain('super-secret');
  });

  it('leaves a URL with no query string untouched', () => {
    const out = redactedReqSerializer({
      id: 'r1',
      method: 'GET',
      url: '/api/v1/health',
      headers: {},
      query: {},
      params: {},
    } as never);

    expect(out.url).toBe('/api/v1/health');
  });
});
