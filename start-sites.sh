#!/usr/bin/env bash
set -euo pipefail

NO_RESET_DATA=0

if [[ "${1:-}" == "--no-reset-data" ]]; then
  NO_RESET_DATA=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITES_FILE="$SCRIPT_DIR/sites.conf"

cleanup() {
  trap - SIGINT SIGTERM EXIT
  echo "Stopping all site simulators..."
  jobs -p | xargs -r kill 2>/dev/null
}

trap cleanup SIGINT SIGTERM EXIT

if [[ "$NO_RESET_DATA" -ne 1 ]]; then
    echo "Resetting data..."
    "$SCRIPT_DIR/admin_tools/run-script.sh" "resetdb.js"
    "$SCRIPT_DIR/admin_tools/clear-aws-audio.sh"
fi

while IFS= read -r site || [[ -n "$site" ]]; do
    [[ -z "$site" ]] && continue
    [[ "$site" =~ ^# ]] && continue
    node "$SCRIPT_DIR/dist/main.js" "$site" &
done < "$SITES_FILE"

wait
