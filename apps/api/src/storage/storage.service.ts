import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { Env } from '../config/env.schema';
import { STORAGE_BUCKET, publicUrl } from './image-kinds';

/** The service role key bypasses RLS: read only here, never returned, never logged. */
@Injectable()
export class StorageService {
  private readonly baseUrl: string;
  private readonly key: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly logger: Logger,
  ) {
    this.baseUrl = config.get('SUPABASE_STORAGE_URL', { infer: true }).replace(/\/+$/, '');
    this.key = config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key };
  }

  // The path is built server-side, so the browser cannot choose where its bytes land.
  async createSignedUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
    const res = await fetch(`${this.baseUrl}/storage/v1/object/upload/sign/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: this.headers(),
    });

    if (!res.ok) {
      // Only the status: the body may echo the service role key back.
      throw new Error(`Storage refused to sign an upload URL: ${res.status}`);
    }

    const body = (await res.json()) as { url?: string };
    if (!body.url) throw new Error('Storage returned no signed URL.');

    // `url` comes back relative to /storage/v1.
    const signedUrl = body.url.startsWith('http') ? body.url : `${this.baseUrl}/storage/v1${body.url}`;
    const token = new URL(signedUrl).searchParams.get('token') ?? '';
    return { signedUrl, token };
  }

  async statObject(path: string): Promise<{ size: number; contentType: string } | null> {
    const res = await fetch(`${this.baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`, {
      method: 'HEAD',
    });
    if (res.status === 404) return null;
    // A missing object answers 400, not 404. Warned, since a bad bucket or key looks the same.
    if (res.status === 400) {
      this.logger.warn({ path, status: res.status }, 'Storage returned 400 while stat-ing an object');
      return null;
    }
    if (!res.ok) throw new Error(`Storage refused to stat an object: ${res.status}`);

    return {
      size: Number(res.headers.get('content-length') ?? 0),
      contentType: res.headers.get('content-type') ?? '',
    };
  }

  publicUrlFor(path: string, version: number): string {
    return publicUrl(this.baseUrl, path, version);
  }
}
