import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

export const ConfigModule = NestConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  envFilePath: ['../../.env'],
  // Under test the file would refill what setup-env.ts overrode.
  ignoreEnvFile: process.env.NODE_ENV === 'test',
  validate: (raw) => envSchema.parse(raw),
});
