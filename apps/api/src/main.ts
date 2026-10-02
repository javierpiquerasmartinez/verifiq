import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './config.js';
import { loadBuildVersion } from './version.js';

const env = loadEnv();
const app = await NestFactory.create(
  AppModule.forRoot({ databaseUrl: env.DATABASE_URL, version: loadBuildVersion() }),
);
app.enableCors({ origin: env.WEB_ORIGIN });
app.enableShutdownHooks();
await app.listen(env.PORT);
