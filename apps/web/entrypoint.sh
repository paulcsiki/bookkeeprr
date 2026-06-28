#!/usr/bin/env bash
set -euo pipefail

if [[ "${BOOKKEEPRR_MEDIA_ROOT:-/media}" == */comics ]]; then
  echo "WARNING: BOOKKEEPRR_MEDIA_ROOT='${BOOKKEEPRR_MEDIA_ROOT}' has Phase 1 semantics." >&2
  echo "         Phase 2 expects this to be the parent dir of {comics, books, audiobooks}." >&2
  echo "         Manga paths will land at \${BOOKKEEPRR_MEDIA_ROOT}/comics/<series>/... -- update to /media." >&2
fi

# Forward SIGTERM / SIGINT to both children
node /app/apps/web/dist/worker.cjs &
WORKER_PID=$!

node server.js &
WEB_PID=$!

cleanup() {
  echo "entrypoint: forwarding shutdown to children"
  kill -TERM "$WEB_PID" "$WORKER_PID" 2>/dev/null || true
  wait
}
trap cleanup TERM INT

# Exit when either child exits (with their status if non-zero)
wait -n
EXIT=$?
cleanup
exit $EXIT
