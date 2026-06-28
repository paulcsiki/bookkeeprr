async function waitForHealth(url: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`bookkeeprr did not become healthy at ${url} within ${deadlineMs}ms`);
}

export default async function globalSetup(): Promise<void> {
  const port = process.env.BOOKKEEPRR_E2E_PORT ?? '13000';
  await waitForHealth(`http://localhost:${port}/api/health`, 30_000);
}
