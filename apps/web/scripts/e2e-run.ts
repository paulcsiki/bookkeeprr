import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This script lives at apps/web/scripts/e2e-run.ts.
// The Dockerfile expects the monorepo root as build context.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, '../../..');
const DOCKERFILE = resolve(__dirname, '../Dockerfile');

const COMPOSE = 'docker-compose.e2e.yml';

function run(cmd: string): void {
  execSync(cmd, { stdio: 'inherit' });
}

// CI pre-builds the image with --cache-from against the latest GHCR tag so
// the e2e job doesn't redo work that the build stage already did. Skip the
// build here when the caller has already produced `bookkeeprr:e2e`.
if (process.env.BOOKKEEPRR_E2E_SKIP_BUILD === '1') {
  console.log('[e2e-run] BOOKKEEPRR_E2E_SKIP_BUILD=1 — using pre-built bookkeeprr:e2e');
} else {
  console.log('[e2e-run] Building bookkeeprr:e2e image...');
  run(`docker build -f ${DOCKERFILE} -t bookkeeprr:e2e ${MONOREPO_ROOT}`);
}

console.log('[e2e-run] Starting compose...');
run(`docker compose -f ${COMPOSE} up -d`);

const PORT = process.env.BOOKKEEPRR_E2E_PORT ?? '13000';
let healthy = false;
for (let i = 0; i < 30; i++) {
  try {
    execSync(`curl -fs http://localhost:${PORT}/api/health > /dev/null 2>&1`);
    healthy = true;
    break;
  } catch {
    // not yet
  }
  execSync('sleep 2');
}
if (!healthy) {
  console.error('[e2e-run] bookkeeprr did not become healthy within 60s');
  try {
    run(`docker compose -f ${COMPOSE} logs bookkeeprr`);
  } catch {
    // ignore
  }
  try {
    run(`docker compose -f ${COMPOSE} down -v --remove-orphans`);
  } catch {
    // ignore
  }
  process.exit(1);
}
console.log('[e2e-run] Compose healthy.');

const playwrightArgs = process.argv.slice(2);
if (process.env.BOOKKEEPRR_E2E_HEADED === '1') playwrightArgs.push('--headed');

const proc = spawn('pnpm', ['exec', 'playwright', 'test', ...playwrightArgs], {
  stdio: 'inherit',
  env: process.env,
});
proc.on('exit', (code) => {
  console.log('[e2e-run] Tearing down compose...');
  try {
    run(`docker compose -f ${COMPOSE} down -v --remove-orphans`);
  } catch {
    // ignore
  }
  process.exit(code ?? 0);
});
