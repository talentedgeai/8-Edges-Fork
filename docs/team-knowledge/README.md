# Team assistant knowledge base

These markdown files are the knowledge the `/team` portal assistant answers from
(policies, values, benefits, how-we-work, FAQs). **Claude is the CMS:** you edit
these files, then run one sync command and the changes are live for every team
member's assistant. There is no admin CRUD screen — the source of truth is here,
in git, versioned and reviewable.

## One file = one entry

Each `*.md` file (except this README) is a single knowledge entry with
frontmatter:

```markdown
---
slug: time-off            # required; stable id, match the filename
title: Time off           # required; shown to the assistant and the reader
category: policy          # optional; e.g. policy, values, benefits, how-we-work
tags: leave, pto, holiday # optional; comma-separated, helps search
source: docs/product/...  # optional; where the content came from
---

The markdown body. Write it the way you'd explain it to a new teammate.
Everything below the second `---` is the answer text the assistant uses.
```

## The workflow ("keep it updated")

1. **Add or edit** a file in this folder. To retire an entry, delete its file
   (the sync archives it — it is never hard-deleted).
2. **Sync** it into the database:
   ```bash
   npx tsx scripts/sync-team-knowledge.ts        # or --dry to preview
   ```
   Upserts every entry by `slug` and archives entries whose file was removed.
3. That's it — the assistant reads `company_os.team_knowledge` live, so the next
   question uses the new content.

Ask Claude to do all three ("update the team knowledge base with the new leave
policy and sync it") and it will edit the markdown and run the sync for you.

## What belongs here

Company-wide, non-sensitive knowledge every teammate may see: values, ways of
working, policies, benefits summaries, FAQs, onboarding pointers. **Do not** put
payroll, individual compensation, or anyone's private personal data here — the
assistant is open to all staff, and that content is deliberately out of its
reach everywhere else too.

## Keeping it accurate

Only write things that are true and authoritative. If you don't have the real
policy detail, say what's known and point people to the owner (e.g. People Ops)
rather than inventing specifics.
