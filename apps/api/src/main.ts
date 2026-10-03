import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadEnv } from './config.js';
import { configureHttp } from './http.js';
import { mailerFromEnv } from './mail/from-env.js';
import { objectStorageFromEnv } from './storage/from-env.js';
import { verifactuConnectorFromEnv } from './verifactu/from-env.js';
import { loadBuildVersion } from './version.js';

const env = loadEnv();
const app = await NestFactory.create<NestExpressApplication>(
  AppModule.forRoot({
    databaseUrl: env.DATABASE_URL,
    version: loadBuildVersion(),
    auth: {
      secret: env.BETTER_AUTH_SECRET,
      apiUrl: env.API_URL,
      appUrl: env.APP_URL,
      trustedOrigins: env.WEB_ORIGIN,
      trustedProxies: env.TRUSTED_PROXIES,
    },
    mailer: mailerFromEnv(env),
    storage: objectStorageFromEnv(env),
    verifactu: verifactuConnectorFromEnv(env),
    representationRequired: env.VERIFACTI_ENVIRONMENT === 'prod',
  }),
  { bodyParser: false },
);
configureHttp(app, { webOrigins: env.WEB_ORIGIN });
app.enableShutdownHooks();
await app.listen(env.PORT);
