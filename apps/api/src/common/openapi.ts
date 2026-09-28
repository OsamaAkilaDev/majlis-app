import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { SESSION_COOKIE } from '../auth/cookies';
import { API_PREFIX } from '../config/api-prefix';

/** Not served in production: Swagger mounts outside the guard pipeline, so SessionGuard cannot protect it. */
export function setupOpenApi(app: INestApplication): void {
  if (process.env.NODE_ENV === 'production') return;

  const config = new DocumentBuilder()
    .setTitle('Majlis API')
    .setDescription('University club and event management.')
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  // Not covered by setGlobalPrefix.
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
}
