import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadBuildVersion } from './version.js';

/** Background worker (Render). Empty for now: the outbox consumer arrives with Emisión. */
@Module({})
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
new Logger('Worker').log(`Verifiq worker ${loadBuildVersion()} started`);

// Keep the process alive until Render sends SIGTERM.
const keepAlive = setInterval(() => {}, 60_000);
process.once('SIGTERM', () => clearInterval(keepAlive));
