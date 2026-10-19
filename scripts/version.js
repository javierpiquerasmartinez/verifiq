// The software version injected at build time. Users see the release (the root package version), as
// the responsible declaration identifies it; the API's /health adds the commit, which names the build.
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

/** The release, e.g. 0.2.0: it changes only when a release bumps it. */
export function releaseVersion() {
  return rootPackage.version;
}

/** The release and the commit, e.g. 0.2.0+aabed9b: every deploy has its own. */
export function resolveVersion() {
  const sha = commitSha();
  return sha ? `${releaseVersion()}+${sha.slice(0, 7)}` : releaseVersion();
}

// `node scripts/version.js <file>` writes { "version": ... } to <file>.
const outFile = process.argv[2];
if (outFile && process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(outFile, JSON.stringify({ version: resolveVersion() }) + '\n');
}
