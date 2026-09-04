"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BACKLOG_PRIORITIES,
  BACKLOG_STATUSES,
  PRIORITY_LABEL,
  tokenLabel,
  type BacklogItem,
  type BacklogPriority,
  type RoadmapGroup,
} from "@/lib/client-backlog";
import {
  acceptProposedItem,
  archiveBacklogItem,
  archiveRoadmapGroup,
  createBacklogItem,
  createRoadmapGroup,
  moveRoadmapGroup,
  restoreBacklogItem,
  restoreRoadmapGroup,
  seedTemplateGroups,
  setEdge8Priority,
  updateBacklogItem,
  updateRoadmapGroup,
  type BacklogItemInput,
  type RoadmapGroupInput,
} from "./actions";

const STYLES = `
.cbe { --pri-now:var(--color-primary-blue); --pri-next:var(--color-ok-ink); --pri-later:var(--color-grey-600); --pri-park:var(--color-amber-ink); }
.cbe .cbe-group { margin-bottom:16px; border:1px solid color-mix(in srgb, var(--color-primary-blue) 22%, transparent); border-radius:14px; background:var(--color-bg-primary); overflow:hidden; }
.cbe .cbe-group.archived { opacity:.55; }
.cbe .cbe-group.neutral { border-color:var(--admin-line); }
.cbe .cbe-group-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0; padding:11px 16px; background:color-mix(in srgb, var(--color-primary-blue) 7%, transparent); cursor:pointer; }
.cbe .cbe-group.neutral .cbe-group-head { background:var(--color-grey-50); cursor:default; }
.cbe .cbe-step { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 9px; border-radius:99px; background:var(--color-primary-blue); color:var(--color-bg-primary); }
.cbe .cbe-group-title { font-weight:700; font-size:15px; }
.cbe .cbe-count { font-size:12px; font-weight:600; color:var(--color-primary-blue); background:color-mix(in srgb, var(--color-primary-blue) 10%, transparent); border-radius:99px; padding:2px 9px; }
.cbe .cbe-caret { border:none; background:none; cursor:pointer; padding:0 2px; font-size:12px; color:var(--color-primary-blue); font-family:inherit; transition:transform .15s ease; }
.cbe .cbe-caret.closed { transform:rotate(-90deg); }
.cbe .cbe-group-tools { display:flex; gap:8px; align-items:center; margin-left:auto; }
.cbe .cbe-group-body { padding:12px 16px 14px; }
.cbe .cbe-group-intro { color:var(--color-text-body); font-size:13px; margin:0 0 12px; }
.cbe .cbe-item { border:1px solid var(--admin-line); border-radius:12px; padding:13px 15px; margin-bottom:9px; background:var(--color-bg-primary); }
.cbe .cbe-item.archived { opacity:.55; }
.cbe .cbe-item-top { display:flex; gap:9px; align-items:flex-start; flex-wrap:wrap; }
.cbe .cbe-ref { flex:none; font-size:12px; font-weight:700; color:var(--color-primary-blue); background:color-mix(in srgb, var(--color-primary-blue) 10%, transparent); border-radius:6px; padding:3px 7px; }
.cbe .cbe-title { font-weight:650; font-size:14px; flex:1 1 220px; }
.cbe .cbe-pills { display:flex; gap:4px; flex-wrap:wrap; }
.cbe .cbe-pill { font-size:12px; font-weight:600; padding:4px 11px; border-radius:99px; border:1px solid var(--admin-line); background:var(--color-bg-primary); color:var(--color-text-body); cursor:pointer; font-family:inherit; }
.cbe .cbe-pill:hover { border-color:var(--color-primary-blue); color:var(--color-primary-blue); }
.cbe .cbe-pill.on-now { background:var(--pri-now); border-color:var(--pri-now); color:var(--color-bg-primary); }
.cbe .cbe-pill.on-next { background:color-mix(in srgb, var(--color-ok-ink) 15%, transparent); border-color:var(--pri-next); color:var(--pri-next); }
.cbe .cbe-pill.on-later { background:var(--color-grey-75); border-color:var(--color-grey-300); color:var(--pri-later); }
.cbe .cbe-pill.on-park { background:var(--color-amber-bg); border-color:var(--color-warn-strong); color:var(--pri-park); }
.cbe .cbe-body { font-size:13px; margin-top:8px; color:var(--color-primary-dark); }
.cbe .cbe-body .k { color:var(--color-text-body); font-weight:600; }
.cbe .cbe-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center; }
.cbe .cbe-chip { font-size:11px; font-weight:600; color:var(--color-text-body); border:1px solid var(--color-bg-secondary); border-radius:99px; padding:2px 9px; }
.cbe .cbe-chip.tok { color:var(--color-primary-blue); border-color:color-mix(in srgb, var(--color-primary-blue) 15%, transparent); background:color-mix(in srgb, var(--color-primary-blue) 8%, transparent); }
.cbe .cbe-chip.client { color:var(--color-ok-ink); border-color:color-mix(in srgb, var(--color-ok-ink) 25%, transparent); background:color-mix(in srgb, var(--color-ok-ink) 10%, transparent); }
.cbe .cbe-actions { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
.cbe .cbe-link { font-size:12px; font-weight:600; color:var(--color-primary-blue); background:none; border:none; cursor:pointer; padding:0; font-family:inherit; }
.cbe .cbe-link.danger { color:var(--color-err-ink); }
.cbe .cbe-link.muted { color:var(--color-text-body); }
.cbe .cbe-form { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
.cbe .cbe-form .full { grid-column:1 / -1; }
.cbe .cbe-form label { font-size:12px; font-weight:600; color:var(--color-text-body); display:block; margin-bottom:3px; }
.cbe .cbe-form input, .cbe .cbe-form textarea, .cbe .cbe-form select { width:100%; font-family:inherit; font-size:13px; padding:7px 9px; border:1px solid var(--admin-line); border-radius:8px; box-sizing:border-box; }
.cbe .cbe-form textarea { min-height:52px; resize:vertical; }
.cbe .cbe-proposed { border:1px solid var(--color-warn-strong); background:var(--color-amber-bg); border-radius:12px; padding:14px 16px; margin-bottom:18px; }
.cbe .cbe-proposed h3 { margin:0 0 8px; font-size:14px; color:var(--color-amber-ink); }
.cbe .cbe-add { margin-top:6px; }
.cbe .cbe-err { color:var(--color-err-ink); font-size:12px; margin-top:6px; }
.cbe .cbe-empty { border:1px dashed var(--admin-faint); border-radius:12px; padding:22px 24px; }
.cbe .cbe-empty p { margin:0 0 12px; color:var(--color-text-body); font-size:14px; }
.cbe .cbe-empty .row { display:flex; gap:10px; flex-wrap:wrap; }
.cbe .cbe-btn { font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; border-radius:99px; padding:8px 16px; border:1px solid var(--color-primary-blue); background:var(--color-primary-blue); color:var(--color-bg-primary); }
.cbe .cbe-btn.ghost { background:var(--color-bg-primary); color:var(--color-primary-blue); }
.cbe .cbe-newgroup { border:1px dashed var(--admin-faint); border-radius:12px; padding:14px 16px; margin-bottom:20px; }
@media (max-width:640px){ .cbe .cbe-form { grid-template-columns:1fr; } }
`;

type Draft = Partial<BacklogItemInput> & { needsCsv?: string };

type GroupDraft = { step_label: string; title: string; intro: string };

function itemToDraft(it: BacklogItem): Draft {
  return {
    group_key: it.group_key,
    ai_program_id: it.ai_program_id,
    title: it.title,
    who: it.who ?? "",
    today_state: it.today_state ?? "",
    build_desc: it.build_desc ?? "",
    needsCsv: (it.needs ?? []).join(", "),
    token_low: it.token_low,
    token_high: it.token_high,
    edge8_priority: it.edge8_priority,
    status: it.status,
  };
}

function draftToInput(d: Draft): BacklogItemInput {
  return {
    group_key: d.group_key ?? "",
    ai_program_id: d.ai_program_id ?? null,
    title: d.title ?? "",
    who: d.who,
    today_state: d.today_state,
    build_desc: d.build_desc,
    needs: (d.needsCsv ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    token_low: d.token_low === undefined || (d.token_low as unknown as string) === "" ? null : Number(d.token_low),
    token_high: d.token_high === undefined || (d.token_high as unknown as string) === "" ? null : Number(d.token_high),
    edge8_priority: d.edge8_priority,
    status: d.status,
  };
}

export function BacklogAdminEditor({
  companyId,
  groups,
  items,
  showArchived,
  liveCardItemIds,
  programs = [],
  defaultProgramId,
}: {
  companyId: string;
  groups: RoadmapGroup[];
  items: BacklogItem[];
  showArchived: boolean;
  // Item ids that have a live (non-archived) board card linked to them.
  liveCardItemIds?: Set<string>;
  // This company's AI Programs; when non-empty, items can be tagged to one.
  programs?: { id: string; name: string }[];
  // When set (the per-program view), new items and new groups are created
  // tagged to this program instead of company-wide, so they stay visible in
  // the program-filtered roadmap. Absent = existing behavior, untagged.
  defaultProgramId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [addGroup, setAddGroup] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<Draft>({});
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupDraft>>({});
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState<GroupDraft>({ step_label: "", title: "", intro: "" });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const proposed = items.filter((i) => i.status === "proposed");
  const activeGroups = groups.filter((g) => !g.archived_at);
  const knownKeys = new Set(groups.map((g) => g.key));
  const orphans = items.filter((i) => !knownKeys.has(i.group_key));

  function groupInput(d: GroupDraft): RoadmapGroupInput {
    return { step_label: d.step_label, title: d.title, intro: d.intro, ai_program_id: defaultProgramId ?? null };
  }

  const programName = new Map(programs.map((p) => [p.id, p.name]));

  function renderItem(it: BacklogItem) {
    const isEditing = editing === it.id;
    const d = drafts[it.id] ?? itemToDraft(it);
    const setD = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [it.id]: { ...d, ...patch } }));
    const tok = tokenLabel(it.token_low, it.token_high);

    return (
      <div key={it.id} className={`cbe-item${it.archived_at ? " archived" : ""}`}>
        <div className="cbe-item-top">
          {it.ref && <span className="cbe-ref">{it.ref}</span>}
          <span className="cbe-title">{it.title}</span>
          <span className="cbe-pills">
            {BACKLOG_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`cbe-pill${it.edge8_priority === p ? ` on-${p}` : ""}`}
                disabled={pending}
                onClick={() => run(() => setEdge8Priority(it.id, p))}
                title="Edge8 proposed priority"
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </span>
        </div>

        <div className="cbe-body">
          {it.who && <div><span className="k">Who: </span>{it.who}</div>}
          {it.today_state && <div><span className="k">Today: </span>{it.today_state}</div>}
          {it.build_desc && <div><span className="k">Build: </span>{it.build_desc}</div>}
          <div className="cbe-chips">
            {(it.needs ?? []).map((n) => <span key={n} className="cbe-chip">{n}</span>)}
            {it.ai_program_id && programName.has(it.ai_program_id) && (
              <span className="cbe-chip tok">{programName.get(it.ai_program_id)}</span>
            )}
            {liveCardItemIds?.has(it.id) && <span className="cbe-chip tok">on a board</span>}
            {tok && <span className="cbe-chip tok">est. {tok} Human Tokens</span>}
            {it.source === "client" && <span className="cbe-chip client">client proposed</span>}
            {it.status !== "accepted" && it.source === "edge8" && <span className="cbe-chip">{it.status}</span>}
            {it.client_priority && (
              <span className="cbe-chip client">client set: {PRIORITY_LABEL[it.client_priority]}</span>
            )}
            {it.client_note && <span className="cbe-chip client">note: {it.client_note}</span>}
          </div>
        </div>

        {isEditing && (
          <div className="cbe-form">
            <div className="full">
              <label>Title</label>
              <input value={d.title ?? ""} onChange={(e) => setD({ title: e.target.value })} />
            </div>
            <div>
              <label>Group</label>
              <select value={d.group_key} onChange={(e) => setD({ group_key: e.target.value })}>
                {activeGroups.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select value={d.status} onChange={(e) => setD({ status: e.target.value as BacklogItem["status"] })}>
                {BACKLOG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {programs.length > 0 && (
              <div>
                <label>AI Program</label>
                <select
                  value={d.ai_program_id ?? ""}
                  onChange={(e) => setD({ ai_program_id: e.target.value || null })}
                >
                  <option value="">Company-wide</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label>Who</label>
              <input value={d.who ?? ""} onChange={(e) => setD({ who: e.target.value })} />
            </div>
            <div>
              <label>Needs (comma separated)</label>
              <input value={d.needsCsv ?? ""} onChange={(e) => setD({ needsCsv: e.target.value })} />
            </div>
            <div>
              <label>Human Tokens (low)</label>
              <input type="number" value={d.token_low ?? ""} onChange={(e) => setD({ token_low: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label>Human Tokens (high)</label>
              <input type="number" value={d.token_high ?? ""} onChange={(e) => setD({ token_high: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="full">
              <label>Today (current state)</label>
              <textarea value={d.today_state ?? ""} onChange={(e) => setD({ today_state: e.target.value })} />
            </div>
            <div className="full">
              <label>Build (what we&apos;d build)</label>
              <textarea value={d.build_desc ?? ""} onChange={(e) => setD({ build_desc: e.target.value })} />
            </div>
          </div>
        )}

        <div className="cbe-actions">
          {it.status === "proposed" && (
            <button type="button" className="cbe-link" disabled={pending} onClick={() => run(() => acceptProposedItem(it.id))}>
              Accept into plan
            </button>
          )}
          {isEditing ? (
            <>
              <button type="button" className="cbe-link" disabled={pending} onClick={() => run(() => updateBacklogItem(it.id, draftToInput(d)), () => setEditing(null))}>
                Save
              </button>
              <button type="button" className="cbe-link" onClick={() => setEditing(null)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="cbe-link" onClick={() => { setDrafts((p) => ({ ...p, [it.id]: itemToDraft(it) })); setEditing(it.id); }}>
              Edit
            </button>
          )}
          {it.archived_at ? (
            <button type="button" className="cbe-link" disabled={pending} onClick={() => run(() => restoreBacklogItem(it.id))}>Restore</button>
          ) : (
            <button type="button" className="cbe-link danger" disabled={pending} onClick={() => run(() => archiveBacklogItem(it.id))}>Archive</button>
          )}
        </div>
      </div>
    );
  }

  function renderGroupForm(d: GroupDraft, setG: (patch: Partial<GroupDraft>) => void) {
    return (
      <div className="cbe-form">
        <div className="full">
          <label>Title</label>
          <input autoFocus value={d.title} onChange={(e) => setG({ title: e.target.value })} placeholder="e.g. Chatbot on payrolliq" />
        </div>
        <div>
          <label>Milestone label (optional chip, e.g. Milestone 1, Anytime)</label>
          <input value={d.step_label} onChange={(e) => setG({ step_label: e.target.value })} />
        </div>
        <div className="full">
          <label>Intro (optional line under the title)</label>
          <textarea value={d.intro} onChange={(e) => setG({ intro: e.target.value })} />
        </div>
      </div>
    );
  }

  function renderGroup(g: RoadmapGroup, index: number) {
    const groupItems = items.filter((i) => i.group_key === g.key);
    const isEditingGroup = editingGroup === g.id;
    // Editing forces the group open so the form can't hide behind a collapse.
    const isCollapsed = !!collapsedGroups[g.id] && !isEditingGroup;
    const openCount = groupItems.filter((i) => !i.archived_at).length;
    const gd = groupDrafts[g.id] ?? { step_label: g.step_label ?? "", title: g.title, intro: g.intro ?? "" };
    const setG = (patch: Partial<GroupDraft>) => setGroupDrafts((prev) => ({ ...prev, [g.id]: { ...gd, ...patch } }));
    const toggle = () => setCollapsedGroups((p) => ({ ...p, [g.id]: !p[g.id] }));

    return (
      <div key={g.id} className={`cbe-group${g.archived_at ? " archived" : ""}`}>
        <div className="cbe-group-head" onClick={toggle}>
          <button type="button" className={`cbe-caret${isCollapsed ? " closed" : ""}`} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand milestone" : "Collapse milestone"}>
            ▼
          </button>
          {g.step_label && <span className="cbe-step">{g.step_label}</span>}
          <span className="cbe-group-title">{g.title}</span>
          <span className="cbe-count">{openCount} item{openCount === 1 ? "" : "s"}</span>
          {!g.archived_at ? (
            <span className="cbe-group-tools" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="cbe-link muted" disabled={pending || index === 0} onClick={() => run(() => moveRoadmapGroup(g.id, "up"))} title="Move group up">↑</button>
              <button type="button" className="cbe-link muted" disabled={pending || index === activeGroups.length - 1} onClick={() => run(() => moveRoadmapGroup(g.id, "down"))} title="Move group down">↓</button>
              <button type="button" className="cbe-link muted" onClick={() => { setGroupDrafts((p) => ({ ...p, [g.id]: { step_label: g.step_label ?? "", title: g.title, intro: g.intro ?? "" } })); setEditingGroup(isEditingGroup ? null : g.id); }}>
                {isEditingGroup ? "Close" : "Edit group"}
              </button>
              {groupItems.filter((i) => !i.archived_at).length === 0 && (
                <button type="button" className="cbe-link danger" disabled={pending} onClick={() => run(() => archiveRoadmapGroup(g.id))}>Archive group</button>
              )}
            </span>
          ) : (
            <span className="cbe-group-tools" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="cbe-link" disabled={pending} onClick={() => run(() => restoreRoadmapGroup(g.id))}>Restore group</button>
            </span>
          )}
        </div>
        {!isCollapsed && (
        <div className="cbe-group-body">
        {g.intro && <div className="cbe-group-intro">{g.intro}</div>}

        {isEditingGroup && (
          <div className="cbe-item">
            {renderGroupForm(gd, setG)}
            <div className="cbe-actions">
              <button type="button" className="cbe-link" disabled={pending} onClick={() => run(() => updateRoadmapGroup(g.id, groupInput(gd)), () => setEditingGroup(null))}>
                Save group
              </button>
              <button type="button" className="cbe-link" onClick={() => setEditingGroup(null)}>Cancel</button>
            </div>
          </div>
        )}

        {groupItems.map(renderItem)}

        {!g.archived_at && (addGroup === g.key ? (
          <div className="cbe-item">
            <div className="cbe-form">
              <div className="full">
                <label>Title</label>
                <input autoFocus value={addDraft.title ?? ""} onChange={(e) => setAddDraft({ ...addDraft, title: e.target.value })} />
              </div>
              <div>
                <label>Priority</label>
                <select value={addDraft.edge8_priority ?? "next"} onChange={(e) => setAddDraft({ ...addDraft, edge8_priority: e.target.value as BacklogPriority })}>
                  {BACKLOG_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </div>
              <div>
                <label>Who</label>
                <input value={addDraft.who ?? ""} onChange={(e) => setAddDraft({ ...addDraft, who: e.target.value })} />
              </div>
              <div className="full">
                <label>Build (optional)</label>
                <textarea value={addDraft.build_desc ?? ""} onChange={(e) => setAddDraft({ ...addDraft, build_desc: e.target.value })} />
              </div>
            </div>
            <div className="cbe-actions">
              <button type="button" className="cbe-link" disabled={pending} onClick={() => run(() => createBacklogItem(companyId, { ...draftToInput({ ...addDraft, group_key: g.key }) }), () => { setAddGroup(null); setAddDraft({}); })}>
                Add item
              </button>
              <button type="button" className="cbe-link" onClick={() => { setAddGroup(null); setAddDraft({}); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="cbe-link cbe-add" onClick={() => { setAddGroup(g.key); setAddDraft({ edge8_priority: "next", ai_program_id: defaultProgramId ?? null }); }}>
            + Add item to {g.step_label || g.title}
          </button>
        ))}
        </div>
        )}
      </div>
    );
  }

  const newGroupForm = (
    <div className="cbe-newgroup">
      {renderGroupForm(newGroup, (patch) => setNewGroup((p) => ({ ...p, ...patch })))}
      <div className="cbe-actions">
        <button
          type="button"
          className="cbe-link"
          disabled={pending || !newGroup.title.trim()}
          onClick={() => run(() => createRoadmapGroup(companyId, groupInput(newGroup)), () => { setNewGroupOpen(false); setNewGroup({ step_label: "", title: "", intro: "" }); })}
        >
          Create group
        </button>
        <button type="button" className="cbe-link" onClick={() => setNewGroupOpen(false)}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="cbe">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      {err && <div className="admin-alert admin-alert--err u-mb-3">{err}</div>}

      {proposed.length > 0 && (
        <div className="cbe-proposed">
          <h3>Client proposed {proposed.length} item{proposed.length === 1 ? "" : "s"}: review below</h3>
          <div className="u-amber">
            {proposed.map((p) => p.title).join(" · ")}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="cbe-empty">
          <p>
            No roadmap yet. A roadmap is a set of milestones you define for this client:
            start from a blank one, or seed the standard Edge8 5-milestone layout and
            shape it from there.
          </p>
          {newGroupOpen ? (
            newGroupForm
          ) : (
            <div className="row">
              <button type="button" className="cbe-btn" onClick={() => setNewGroupOpen(true)}>Create a group</button>
              <button type="button" className="cbe-btn ghost" disabled={pending} onClick={() => run(() => seedTemplateGroups(companyId))}>
                Start from the Edge8 template
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {activeGroups.map(renderGroup)}
          {showArchived && groups.filter((g) => g.archived_at).map((g) => renderGroup(g, -1))}

          {orphans.length > 0 && (
            <div className="cbe-group neutral">
              <div className="cbe-group-head">
                <span className="cbe-group-title">Ungrouped</span>
              </div>
              <div className="cbe-group-body">
                <div className="cbe-group-intro">
                  These items point at a group that no longer exists here. Edit each one to move it into a current group.
                </div>
                {orphans.map(renderItem)}
              </div>
            </div>
          )}

          {newGroupOpen ? (
            newGroupForm
          ) : (
            <button type="button" className="cbe-link" onClick={() => setNewGroupOpen(true)}>+ Add a group</button>
          )}
        </>
      )}
    </div>
  );
}
