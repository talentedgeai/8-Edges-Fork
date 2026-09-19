#!/usr/bin/env bash
# Vercel's Ignored Build Step. Exit 0 skips the deployment, exit 1 builds it.
#
# Every push to every branch was building a preview — about four minutes of
# build time each, thirteen previews for seven merges on one day. Two kinds of
# push do not need one:
#
#   1. A push with no pull request. A preview exists to be looked at from a PR;
#      the first push of a branch, before its PR is opened, has nobody to look.
#      Vercel sets VERCEL_GIT_PULL_REQUEST_ID only when the commit belongs to a
#      PR, so an empty value is exactly that push.
#   2. A push that changes nothing the deployment serves: docs, scripts, tests,
#      workflow files, the check plans. The app is identical to the last preview.
#
# Production (main) always builds. When in doubt — no git history to diff, an
# unknown target — build; a wasted build costs minutes, a skipped one costs a
# missed regression.
set -u

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "production: build"
  exit 1
fi

if [ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
  echo "no pull request for this push: skip the preview"
  exit 0
fi

# Paths whose changes never reach the served app. Anything else builds.
if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  changed=$(git diff --name-only HEAD^ HEAD)
  runtime=$(printf '%s\n' "$changed" | grep -vE '^(docs/|scripts/|\.github/|supabase/|deployments/.*\.md$|[^/]+\.md$|CLAUDE\.md$)|\.test\.(ts|tsx|mjs)$' || true)
  if [ -z "$runtime" ]; then
    echo "only non-runtime files changed: skip the preview"
    exit 0
  fi
fi

echo "build"
exit 1
