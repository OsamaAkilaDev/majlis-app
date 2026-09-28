import { stdSerializers, type SerializedRequest } from 'pino';

/** A missing entry is a secret in the logs. pino-http never serializes bodies, so `req.body.*` is inert. */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.query.token',
  'req.query.code',
  'res.headers["set-cookie"]',
  // A logged `{ err }` can carry a request whose headers req.* paths never reach.
  '*.headers.cookie',
  '*.headers.authorization',
] as const;

/** Drops the raw query from req.url, which no redaction path can reach into. */
export function redactedReqSerializer(req: Parameters<typeof stdSerializers.req>[0]): SerializedRequest {
  const serialized = stdSerializers.req(req);
  const cut = serialized.url.indexOf('?');
  return cut === -1 ? serialized : { ...serialized, url: serialized.url.slice(0, cut) };
}
