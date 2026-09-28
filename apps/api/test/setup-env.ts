import { testDatabaseUrl } from './db';

// Before any test file imports, since @nestjs/config validates the environment at import time.
const url = testDatabaseUrl();

process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
