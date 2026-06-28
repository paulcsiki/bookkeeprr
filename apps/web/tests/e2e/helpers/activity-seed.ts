import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE = 'bookkeeprr';

const here = fileURLToPath(new URL('.', import.meta.url));
const SEED_SCRIPT = resolve(here, '../fixtures/activity-seed.cjs');

export type ActivitySeed = {
  seriesId: number;
  releaseId: number;
  downloadId: number;
  qbtHash: string;
  releaseTitle: string;
};

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' });
}

/**
 * Resolve the running bookkeeprr container's id. Same approach as
 * reader-seed.ts: `docker compose cp` / `exec -w` aren't supported by the
 * podman-compose provider, so address the raw container by the standard
 * compose service label, which both engines stamp on the container.
 */
function containerId(): string {
  const id = docker([
    'ps',
    '--filter',
    `label=com.docker.compose.service=${SERVICE}`,
    '--format',
    '{{.ID}}',
  ])
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!id) throw new Error(`activity-seed: could not resolve the ${SERVICE} container id`);
  return id;
}

/**
 * Seed the running e2e instance with a series + release + a 'superseded'
 * download row (raw SQL, executed inside the container with its bundled
 * better-sqlite3 — see fixtures/activity-seed.cjs). Must run after the
 * container is up and the first-run admin has been created (which initialises
 * the DB + a default quality profile).
 */
export function seedSupersededDownload(): ActivitySeed {
  const cid = containerId();

  // Stage the seed script next to the app workdir.
  docker(['cp', SEED_SCRIPT, `${cid}:/app/apps/web/activity-seed.cjs`]);

  // Run it from the app workdir so require('better-sqlite3') resolves.
  const stdout = docker(['exec', '-w', '/app/apps/web', cid, 'node', 'activity-seed.cjs']);
  // The exec output may carry the compose provider banner; take the last JSON line.
  const jsonLine = stdout
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  if (!jsonLine) {
    throw new Error(`seedSupersededDownload: no JSON in seed output:\n${stdout}`);
  }
  return JSON.parse(jsonLine) as ActivitySeed;
}
