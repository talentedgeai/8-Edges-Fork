#!/bin/sh
# Nightly Human Token Tracker sync, run from a logged-in machine by launchd
# (ai.edge8.htt-nightly-sync). Bridges the gap until the hosted pipeline has
# its Phase 4 secrets: syncs pull requests, ingests recorder telemetry from
# the tracker's telemetry branch, and backfills this machine's own Claude
# transcripts. Every step is idempotent, so a re-run never double counts.
set -u
export PATH="/opt/homebrew/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/../.." || exit 1
STARTED=$(date -u +%FT%TZ)
RUNLOG=$(mktemp -t htt-nightly).log
echo "== $STARTED start"
# Runs from its own worktree on main, so a session editing the main checkout
# can never stash or reset these scripts out from under launchd.
(
git pull -q --ff-only origin main 2>&1 | tail -1
while IFS= read -r line; do case "$line" in [A-Z_]*=*) export "$line";; esac; done < .env.local
GH_PAT=$(gh auth token) CRON_SECRET=local-nightly \
  npx --yes tsx --tsconfig tsconfig.json --require ./scripts/htt/react-cache-shim.cjs scripts/htt/run-pr-sync.mts
npx --yes tsx --tsconfig tsconfig.json scripts/htt/ingest-telemetry-local.mts | tail -12
OUT=$(mktemp -t htt-sessions).jsonl
python3 scripts/htt/backfill-local-sessions.py --out "$OUT" | tail -8
npx --yes tsx --tsconfig tsconfig.json scripts/htt/ingest-telemetry-local.mts --file "$OUT" | tail -12
rm -f "$OUT"
) 2>&1 | tee "$RUNLOG"
STATUS=$(grep -q -E "Error|error TS|Traceback" "$RUNLOG" && echo error || echo ok)
SUMMARY=$(grep -h -o -E '"prsUpserted":[0-9]+|"rowsWritten": [0-9]+' "$RUNLOG" | tr -d '"' | tr '\n' ' ')
node scripts/routine-run-record.mjs --routine mac-mini:htt-nightly-sync --status "$STATUS" --started "$STARTED" --log "$RUNLOG" --summary "$SUMMARY"
rm -f "$RUNLOG"
echo "== $(date -u +%FT%TZ) done"
