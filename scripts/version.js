// Resolves the software version injected at build time: root package version + commit.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootPackage = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

function commitSha() {
  const fromEnv =
    process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function resolveVersion() {
  const sha = commitSha();
  return sha ? `${rootPackage.version}+${sha.slice(0, 7)}` : rootPackage.version;
}

// `node scripts/version.js <file>` writes { "version": ... } to <file>.
const outFile = process.argv[2];
if (outFile && process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(outFile, JSON.stringify({ version: resolveVersion() }) + '\n');
}
