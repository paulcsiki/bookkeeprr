import { execSync } from 'node:child_process';

const COMPOSE_FILE = 'docker-compose.e2e.yml';

export function composeDownUp(): void {
  execSync(`docker compose -f ${COMPOSE_FILE} down -v --remove-orphans`, { stdio: 'inherit' });
  execSync(`docker compose -f ${COMPOSE_FILE} up -d`, { stdio: 'inherit' });

  // podman-compose doesn't support `--wait` — poll /api/health until healthy.
  const port = process.env.BOOKKEEPRR_E2E_PORT ?? '13000';
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`curl -fs http://localhost:${port}/api/health > /dev/null 2>&1`);
      return;
    } catch {
      // not yet
    }
    execSync('sleep 2');
  }
  throw new Error(
    `composeDownUp: bookkeeprr did not become healthy at localhost:${port} within 60s`,
  );
}
