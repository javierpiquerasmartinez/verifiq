import { readFileSync } from 'node:fs';

export const APP_VERSION = Symbol('APP_VERSION');

/** Reads the version written next to the compiled code by the build (see scripts/version.js). */
export function loadBuildVersion(): string {
  try {
    const file = new URL('./version.json', import.meta.url);
    return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
  } catch {
    return 'dev';
  }
}
