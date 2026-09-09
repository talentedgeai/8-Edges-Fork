#!/usr/bin/env python3
"""
Backfill Claude sessions from this machine's local transcripts.

Why: the edge8-telemetry plugin only records sessions from the moment it is
installed and opted in. This walks ~/.claude/projects, keeps only repos that
are onboarded in htt.repos, and writes one jsonl of session records for
scripts/htt/ingest-telemetry-local.mts --file <out>. Self-contained on purpose:
it depends on no plugin version, so the nightly sync keeps working when the
plugin changes.

Per session it records what the hours rule (entities/htt/day-hours.ts) needs:
  - human_turns: every line the person typed, with its time, git branch and
    when the AI went quiet afterwards (run_end) — the same definition as the
    edge8-telemetry plugin's capture.py (1.4.1), reproduced here so a backfill
    prices under the human-turn rule and not the old all-lines clock;
  - active_intervals: the legacy all-lines clock (30-minute gap), kept for
    recorders and rows that predate human turns;
  - claude_tokens: input + output + cache-creation, DEDUPLICATED by message id
    and request id (Claude Code writes one transcript line per content block,
    so a naive sum counts every response two to three times).
No per-day human record is produced any more; days are computed on the server.

Usage (repo root, .env.local present, gh logged in):
  python3 scripts/htt/backfill-local-sessions.py [--out sessions.jsonl] [--since 2026-06-01]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECTS_DIR = Path.home() / ".claude" / "projects"
ACTIVE_GAP = timedelta(minutes=30)


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


def git_remote(path: str) -> str | None:
    url = sh(["git", "-C", path, "remote", "get-url", "origin"])
    if not url:
        return None
    m = re.search(r"github\.com[:/]([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", url)
    return f"{m.group(1)}/{m.group(2)}" if m else None


def repo_from_path(cwd: str, repos: set[str]) -> str | None:
    """Fallback for a checkout that no longer exists: the last path segment that
    matches an onboarded repo's name (worktrees sit under <repo>/.claude/worktrees/…)."""
    by_name: dict[str, str] = {}
    for full in repos:
        by_name.setdefault(full.rsplit("/", 1)[-1].lower(), full)
    for seg in reversed(Path(cwd).parts):
        hit = by_name.get(seg.lower())
        if hit:
            return hit
    return None


def parse_ts(v: str) -> datetime | None:
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def is_human_turn(o: dict) -> bool:
    """A line the contributor typed: a `user` line whose content is prose, not a
    tool_result echo, not a subagent (sidechain) line, not a meta/system line.
    Reads only structure — block types, never text. Mirrors capture.py."""
    if o.get("type") != "user" or o.get("isSidechain") or o.get("isMeta"):
        return False
    msg = o.get("message")
    if not isinstance(msg, dict) or msg.get("role") != "user":
        return False
    content = msg.get("content")
    if isinstance(content, str):
        return bool(content)
    if isinstance(content, list):
        types = {b.get("type") for b in content if isinstance(b, dict)}
        return "text" in types and "tool_result" not in types
    return False


def capture(path: Path) -> dict | None:
    """One transcript -> session record fields, or None when it holds nothing."""
    stamps: list[datetime] = []
    human_turns: list[dict] = []
    machine_stamps: list[datetime] = []  # assistant lines only: when the model was producing output
    seen: set[tuple] = set()
    tokens = 0
    cwd = None
    branch = None
    with path.open(errors="ignore") as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:
                continue
            if cwd is None and isinstance(o.get("cwd"), str):
                cwd = o["cwd"]
            if branch is None and isinstance(o.get("gitBranch"), str) and o["gitBranch"]:
                branch = o["gitBranch"]
            ts = o.get("timestamp")
            if isinstance(ts, str):
                dt = parse_ts(ts)
                if dt:
                    stamps.append(dt)
                    if is_human_turn(o):
                        human_turns.append({"t": dt.isoformat(), "branch": str(o.get("gitBranch") or "")})
                    elif o.get("type") == "assistant":
                        machine_stamps.append(dt)
            msg = o.get("message")
            usage = msg.get("usage") if isinstance(msg, dict) else None
            if isinstance(usage, dict):
                key = (msg.get("id"), o.get("requestId"))
                if key not in seen:
                    seen.add(key)
                    tokens += (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0) + (usage.get("cache_creation_input_tokens") or 0)
    if not stamps or not cwd:
        return None
    stamps.sort()
    # run_end: when the AI went quiet after this turn — the last assistant line
    # before the next human turn (or end of transcript); the turn itself if none.
    human_turns.sort(key=lambda h: h["t"])
    machine_stamps.sort()
    for i, h in enumerate(human_turns):
        t0 = datetime.fromisoformat(h["t"])
        t1 = datetime.fromisoformat(human_turns[i + 1]["t"]) if i + 1 < len(human_turns) else None
        last = t0
        for m in machine_stamps:
            if m < t0:
                continue
            if t1 is not None and m >= t1:
                break
            last = m
        h["run_end"] = last.isoformat()
    intervals: list[dict] = []
    start = last = stamps[0]
    active = timedelta()
    for t in stamps[1:]:
        if t - last <= ACTIVE_GAP:
            active += t - last
            last = t
        else:
            intervals.append({"start": start.isoformat(), "end": last.isoformat()})
            start = last = t
    intervals.append({"start": start.isoformat(), "end": last.isoformat()})
    return {
        "session_id": path.stem,
        "claude_tokens": tokens,
        "active_minutes": int(active.total_seconds() / 60),
        "active_intervals": intervals,
        "human_turns": human_turns,
        "started_at": stamps[0].isoformat(),
        "ended_at": stamps[-1].isoformat(),
        "cwd": cwd,
        "session_branch": branch,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="local-sessions.jsonl")
    ap.add_argument("--since", default="2026-01-01", help="ignore sessions that started before this date")
    args = ap.parse_args()

    repos = onboarded_repos(env_local())
    login = sh(["gh", "api", "user", "--jq", ".login"])
    if not login:
        sys.exit("gh is not logged in")

    remote_cache: dict[str, str | None] = {}
    email_cache: dict[str, str] = {}
    records: list[dict] = []
    summary: dict[str, int] = {}
    if not PROJECTS_DIR.exists():
        sys.exit(f"{PROJECTS_DIR} does not exist")
    for transcript in sorted(PROJECTS_DIR.glob("*/*.jsonl")):
        m = capture(transcript)
        if not m or m["started_at"][:10] < args.since or m["claude_tokens"] <= 0:
            continue
        cwd = m.pop("cwd")
        if cwd not in remote_cache:
            remote_cache[cwd] = git_remote(cwd) if Path(cwd).is_dir() else repo_from_path(cwd, repos)
        repo = remote_cache[cwd]
        if not repo or repo.lower() not in repos:
            continue
        if cwd not in email_cache:
            # A deleted worktree cannot answer for its own config; the machine's
            # global identity is the same person.
            email_cache[cwd] = sh(["git", "config", "user.email"], cwd=cwd) if Path(cwd).is_dir() else sh(["git", "config", "--global", "user.email"])
        records.append(
            {
                "record_type": "claude",
                **m,
                "repo_full_name": repo,
                "author_email": email_cache[cwd],
                "github_login": login,
            }
        )
        summary[repo] = summary.get(repo, 0) + 1

    with open(args.out, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    for repo, n in sorted(summary.items()):
        print(f"{repo}: {n} sessions")
    print(f"wrote {len(records)} records to {args.out}")


if __name__ == "__main__":
    main()
