#!/usr/bin/env python3
"""
Backfill Claude sessions from this machine's local transcripts.

Why: the edge8-telemetry plugin only records sessions from the moment it is
installed and opted in, and its retroactive scanner still registers and
delivers against the old tracker. This walks ~/.claude/projects the same way
the plugin's scanner does, reuses the plugin's own token and human-hour maths
(il_telemetry.capture / methodology), keeps only repos that are onboarded in
htt.repos, and writes one jsonl of telemetry records. Nothing is delivered
and no plugin state is touched; feed the file to
scripts/htt/ingest-telemetry-local.mts --file <out>.

Usage (repo root, .env.local present, gh logged in):
  python3 scripts/htt/backfill-local-sessions.py [--out sessions.jsonl] [--since 2026-06-01]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date, timezone
from pathlib import Path

PLUGIN_HOOKS = sorted(glob.glob(str(Path.home() / ".claude/plugins/cache/edge8/edge8-telemetry/*/hooks")))
if not PLUGIN_HOOKS:
    sys.exit("edge8-telemetry plugin not installed (needed for its il_telemetry package)")
sys.path.insert(0, PLUGIN_HOOKS[-1])
from il_telemetry import methodology  # noqa: E402
from il_telemetry.capture import capture_session  # noqa: E402
from il_telemetry.flush import build_human_records  # noqa: E402
from il_telemetry.scan import PROJECTS_DIR, _decode_project_path, _git_remote  # noqa: E402


def env_local() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in Path(".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def onboarded_repos(env: dict[str, str]) -> set[str]:
    key = env.get("SUPABASE_SECRET_KEY")
    url = env.get("SUPABASE_URL", "https://db.edge8.ai")
    if not key:
        sys.exit("SUPABASE_SECRET_KEY missing from .env.local")
    req = urllib.request.Request(
        f"{url}/rest/v1/repos?select=github_repo,github_repo_aliases&github_repo=not.is.null",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "htt"},
    )
    rows = json.loads(urllib.request.urlopen(req).read())
    names: set[str] = set()
    for r in rows:
        names.add(r["github_repo"].lower())
        names.update(a.lower() for a in r.get("github_repo_aliases") or [])
    return names


def sh(cmd: list[str], cwd: str | None = None) -> str:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 else ""


def transcript_branch(path: Path) -> str | None:
    with path.open(errors="ignore") as f:
        for _ in range(200):
            line = f.readline()
            if not line:
                break
            i = line.find('"gitBranch":"')
            if i >= 0:
                j = line.find('"', i + 13)
                return line[i + 13 : j] or None
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="local-sessions.jsonl")
    ap.add_argument("--since", default="2026-01-01", help="ignore sessions that started before this date")
    args = ap.parse_args()

    repos = onboarded_repos(env_local())
    login = sh(["gh", "api", "user", "--jq", ".login"])
    if not login:
        sys.exit("gh is not logged in")
    tz = methodology.parse_tz(os.environ.get("IL_TZ", "+00:00"))

    records: list[dict] = []
    summary: dict[str, dict[str, int]] = {}
    for project_dir in sorted(PROJECTS_DIR.iterdir()):
        if not project_dir.is_dir():
            continue
        transcripts = sorted(project_dir.glob("*.jsonl"))
        if not transcripts:
            continue
        project_path = _decode_project_path(project_dir.name)
        if not project_path:
            continue
        repo = _git_remote(project_path)
        if not repo or repo.lower() not in repos:
            continue
        author_email = sh(["git", "config", "user.email"], cwd=str(project_path))
        days: set[str] = set()
        stat = summary.setdefault(repo, {"sessions": 0, "human_days": 0})
        for t in transcripts:
            m = capture_session(str(t), t.stem)
            if not m or m["started_at"][:10] < args.since or m["claude_tokens"] <= 0:
                continue
            records.append(
                {
                    "record_type": "claude",
                    **m,
                    "repo_full_name": repo,
                    "session_branch": transcript_branch(t),
                    "author_email": author_email,
                    "github_login": login,
                }
            )
            days.add(m["started_at"][:10])
            stat["sessions"] += 1
        if days:
            d = sorted(days)
            hh = methodology.human_hours_for(
                str(project_path), author_email, date.fromisoformat(d[0]), date.fromisoformat(d[-1]), tz,
                [str(project_path).replace("/", "-")],
            )
            ctx = {"author_email": author_email, "github_login": login, "repo_full_name": repo}
            human = [r for r in build_human_records(hh, ctx) if r["occurred_on"] >= args.since and r["resolved_hours"] > 0]
            records.extend(human)
            stat["human_days"] += len(human)

    with open(args.out, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    for repo, s in sorted(summary.items()):
        print(f"{repo}: {s['sessions']} sessions, {s['human_days']} human-days")
    print(f"wrote {len(records)} records to {args.out}")


if __name__ == "__main__":
    main()
