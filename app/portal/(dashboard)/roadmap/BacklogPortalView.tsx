"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  BACKLOG_PRIORITIES,
  PRIORITY_LABEL,
  effectivePriority,
  tokenLabel,
  type BacklogItem,
  type BacklogPriority,
  type RoadmapGroup,
} from "@/lib/client-backlog";
import { setMyPriority, proposeMyItem, reorderMyGroup } from "./actions";
import { ProposeAssist } from "./ProposeAssist";

const STYLES = `
.cbp { --pri-now:var(--color-primary-blue); --pri-next:var(--color-ok-ink); --pri-later:var(--color-grey-600); --pri-park:var(--color-amber-ink); max-width: 880px; }
.cbp .cbp-intro { background:color-mix(in srgb, var(--color-primary-blue) 8%, transparent); border-radius:10px; padding:14px 16px; font-size:14px; margin:0 0 16px; }
.cbp .cbp-counts { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 18px; }
.cbp .cbp-count { font-size:12px; font-weight:600; color:var(--color-text-body); padding:4px 11px; border-radius:99px; background:var(--color-grey-75); }
.cbp .cbp-group { margin-bottom:22px; }
.cbp .cbp-group-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 4px; }
.cbp .cbp-step { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 9px; border-radius:99px; background:color-mix(in srgb, var(--color-primary-blue) 10%, transparent); color:var(--color-primary-blue); }
.cbp .cbp-group-title { font-weight:700; font-size:15px; }
.cbp .cbp-group-intro { color:var(--color-text-body); font-size:13px; margin:2px 0 12px; }
.cbp .cbp-item { border:1px solid var(--admin-line); border-radius:12px; padding:13px 15px 13px 12px; margin-bottom:9px; background:var(--color-bg-primary); display:flex; gap:10px; align-items:flex-start; }
.cbp .cbp-item.dragging { box-shadow:0 8px 24px color-mix(in srgb, var(--color-primary-dark) 14%, transparent); border-color:var(--color-primary-blue); }
.cbp .cbp-handle { flex:none; cursor:grab; color:var(--color-grey-300); font-size:16px; line-height:1.2; padding:2px 2px 0; user-select:none; touch-action:none; }
.cbp .cbp-handle:hover { color:var(--color-primary-blue); }
.cbp .cbp-main { flex:1; min-width:0; }
.cbp .cbp-item-top { display:flex; gap:9px; align-items:flex-start; flex-wrap:wrap; }
.cbp .cbp-ref { flex:none; font-size:12px; font-weight:700; color:var(--color-primary-blue); background:color-mix(in srgb, var(--color-primary-blue) 10%, transparent); border-radius:6px; padding:3px 7px; }
.cbp .cbp-title { font-weight:650; font-size:14px; flex:1 1 220px; }
.cbp .cbp-pills { display:flex; gap:4px; flex-wrap:wrap; }
.cbp .cbp-pill { font-size:12px; font-weight:600; padding:4px 11px; border-radius:99px; border:1px solid var(--admin-line); background:var(--color-bg-primary); color:var(--color-text-body); cursor:pointer; font-family:inherit; }
.cbp .cbp-pill:hover { border-color:var(--color-primary-blue); color:var(--color-primary-blue); }
.cbp .cbp-pill.on-now { background:var(--pri-now); border-color:var(--pri-now); color:var(--color-bg-primary); }
.cbp .cbp-pill.on-next { background:color-mix(in srgb, var(--color-ok-ink) 15%, transparent); border-color:var(--pri-next); color:var(--pri-next); }
.cbp .cbp-pill.on-later { background:var(--color-grey-75); border-color:var(--color-grey-300); color:var(--pri-later); }
.cbp .cbp-pill.on-park { background:var(--color-amber-bg); border-color:var(--color-warn-strong); color:var(--pri-park); }
.cbp .cbp-body { font-size:13px; margin-top:8px; color:var(--color-primary-dark); }
.cbp .cbp-body .k { color:var(--color-text-body); font-weight:600; }
.cbp .cbp-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center; }
.cbp .cbp-chip { font-size:11px; font-weight:600; color:var(--color-text-body); border:1px solid var(--color-bg-secondary); border-radius:99px; padding:2px 9px; }
.cbp .cbp-chip.tok { color:var(--color-primary-blue); border-color:color-mix(in srgb, var(--color-primary-blue) 15%, transparent); background:color-mix(in srgb, var(--color-primary-blue) 8%, transparent); }
.cbp .cbp-chip.mine { color:var(--color-ok-ink); border-color:color-mix(in srgb, var(--color-ok-ink) 25%, transparent); background:color-mix(in srgb, var(--color-ok-ink) 10%, transparent); }
.cbp .cbp-chip.proposed { color:var(--color-amber-ink); border-color:var(--color-warn-strong); background:var(--color-amber-bg); }
.cbp .cbp-hint { font-size:11px; color:var(--color-grey-400); margin-top:6px; }
.cbp .cbp-propose { margin-top:8px; border:1px dashed var(--admin-faint); border-radius:12px; padding:12px 14px; }
.cbp .cbp-propose input, .cbp .cbp-propose textarea, .cbp .cbp-propose select { width:100%; font-family:inherit; font-size:13px; padding:7px 9px; border:1px solid var(--admin-line); border-radius:8px; box-sizing:border-box; margin-bottom:8px; }
.cbp .cbp-btn { font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; border-radius:99px; padding:8px 16px; border:1px solid var(--color-primary-blue); background:var(--color-primary-blue); color:var(--color-bg-primary); }
.cbp .cbp-btn.ghost { background:var(--color-bg-primary); color:var(--color-primary-blue); }
.cbp .cbp-link { font-size:12px; font-weight:600; color:var(--color-primary-blue); background:none; border:none; cursor:pointer; padding:0; font-family:inherit; }
.cbp .cbp-err { color:var(--color-err-ink); font-size:12px; margin-top:6px; }
/* Touch: the reorder handle and the four priority pills are the whole point of
   this page for account admins, and both were ~20-25px targets. Grow them, and
   lift the propose-form fields to 16px so iOS does not zoom on focus. Desktop
   keeps its denser sizing. */
@media (pointer: coarse) {
  .cbp .cbp-handle { padding:11px 12px; font-size:20px; }
  .cbp .cbp-pills { gap:8px; }
  .cbp .cbp-pill { padding:9px 14px; }
  .cbp .cbp-propose input, .cbp .cbp-propose textarea, .cbp .cbp-propose select { font-size:16px; }
}
`;

// Rebuild the flat item list from a single group's reordered array, preserving
// every other group's order and the overall group sequence.
function rebuild(
  all: BacklogItem[],
  groups: RoadmapGroup[],
  group: string,
  reordered: BacklogItem[],
): BacklogItem[] {
  return groups.flatMap((g) =>
    g.key === group ? reordered : all.filter((i) => i.group_key === g.key),
  );
}

export function BacklogPortalView({
  items,
  groups,
  companyId,
  canPrioritize,
  canPropose,
  programId,
}: {
  items: BacklogItem[];
  groups: RoadmapGroup[];
  companyId: string;
  // Role gates (PR 2): admins reorder + set priorities; contributors propose;
  // viewers read. The server actions re-check, this only shapes the UI.
  canPrioritize: boolean;
  canPropose: boolean;
  // Set on a program page's roadmap tab: proposals made here carry the
  // program's tag. The hub's company-wide roadmap omits it.
  programId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [proposeGroup, setProposeGroup] = useState<string | null>(null);
  const [pTitle, setPTitle] = useState("");
  const [pNote, setPNote] = useState("");
  const [pPriority, setPPriority] = useState<BacklogPriority>("next");
  const [pHint, setPHint] = useState<string | null>(null);

  // Local copy so drag + priority edits feel instant; re-sync after a refresh.
  const [ordered, setOrdered] = useState<BacklogItem[]>(items);
  useEffect(() => setOrdered(items), [items]);

  const counts = useMemo(() => {
    const c: Record<BacklogPriority, number> = { now: 0, next: 0, later: 0, park: 0 };
    for (const it of ordered) c[effectivePriority(it)] += 1;
    return c;
  }, [ordered]);

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

  function onDragEnd(result: DropResult) {
    if (!canPrioritize) return;
    const { source, destination } = result;
    if (!destination || destination.droppableId !== source.droppableId) return;
    if (destination.index === source.index) return;
    const group = source.droppableId;
    const arr = ordered.filter((i) => i.group_key === group);
    const [moved] = arr.splice(source.index, 1);
    arr.splice(destination.index, 0, moved);
    const next = rebuild(ordered, groups, group, arr);
    setOrdered(next); // optimistic
    const ids = arr.map((i) => i.id);
    setErr(null);
    start(async () => {
      const r = await reorderMyGroup(group, ids);
      if (!r.ok) {
        setErr(r.error ?? "Couldn't save the new order.");
        setOrdered(items); // roll back to server truth
      } else {
        router.refresh();
      }
    });
  }

  function renderItem(it: BacklogItem, index: number) {
    const eff = effectivePriority(it);
    const tok = tokenLabel(it.token_low, it.token_high);
    return (
      <Draggable draggableId={it.id} index={index} key={it.id} isDragDisabled={!canPrioritize}>
        {(provided, snapshot) => (
          <div
            className={`cbp-item${snapshot.isDragging ? " dragging" : ""}`}
            ref={provided.innerRef}
            {...provided.draggableProps}
          >
            <span
              className="cbp-handle"
              {...provided.dragHandleProps}
              title={canPrioritize ? "Drag to reorder" : undefined}
              aria-label={canPrioritize ? "Drag to reorder" : undefined}
              style={canPrioritize ? undefined : { visibility: "hidden" }}
            >
              ⠿
            </span>
            <div className="cbp-main">
              <div className="cbp-item-top">
                {it.ref && <span className="cbp-ref">{it.ref}</span>}
                <span className="cbp-title">{it.title}</span>
                <span className="cbp-pills">
                  {canPrioritize ? (
                    BACKLOG_PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`cbp-pill${eff === p ? ` on-${p}` : ""}`}
                        disabled={pending}
                        onClick={() => run(() => setMyPriority(it.id, it.client_priority === p ? null : p))}
                        title={it.client_priority ? "Your priority" : "Edge8 proposed, click to set yours"}
                      >
                        {PRIORITY_LABEL[p]}
                      </button>
                    ))
                  ) : (
                    <span className={`cbp-pill on-${eff}`} style={{ cursor: "default" }}>{PRIORITY_LABEL[eff]}</span>
                  )}
                </span>
              </div>
              <div className="cbp-body">
                {it.who && <div><span className="k">Who: </span>{it.who}</div>}
                {it.today_state && <div><span className="k">Today: </span>{it.today_state}</div>}
                {it.build_desc && <div><span className="k">What we&apos;d build: </span>{it.build_desc}</div>}
                <div className="cbp-chips">
                  {(it.needs ?? []).map((n) => <span key={n} className="cbp-chip">{n}</span>)}
                  {tok && <span className="cbp-chip tok">est. {tok} Human Tokens</span>}
                  {it.source === "client" && (
                    <span className="cbp-chip proposed">{it.status === "proposed" ? "your proposal, awaiting Edge8" : "your idea"}</span>
                  )}
                  {it.client_priority && it.client_priority !== it.edge8_priority && (
                    <span className="cbp-chip mine">you changed from Edge8&apos;s {PRIORITY_LABEL[it.edge8_priority]}</span>
                  )}
                </div>
                {canPrioritize && it.client_priority && (
                  <div className="cbp-hint">
                    You set this. Click the highlighted pill again to revert to Edge8&apos;s suggestion ({PRIORITY_LABEL[it.edge8_priority]}).
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  }

  return (
    <div className="cbp">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <p className="cbp-intro">
        Your roadmap, section by section, as agreed with Edge8.{" "}
        {canPrioritize && (
          <>Set your priority on any item, drag the handle to reorder within a section, and use{" "}
          <em>Propose an item</em> to add your own (it comes to us to review).{" "}</>
        )}
        {!canPrioritize && canPropose && (
          <>Use <em>Propose an item</em> to add your own (it comes to us to review); your account
          admin controls priorities.{" "}</>
        )}
        Human Token estimates are pre-research ranges (1 Human Token = 1 hour of Edge8 expert time).
      </p>

      <div className="cbp-counts">
        {BACKLOG_PRIORITIES.map((p) => (
          <span key={p} className="cbp-count">{PRIORITY_LABEL[p]}: {counts[p]}</span>
        ))}
      </div>

      {err && <div className="cbp-err">{err}</div>}

      <DragDropContext onDragEnd={onDragEnd}>
        {groups.map((g) => {
          const groupItems = ordered.filter((i) => i.group_key === g.key);
          return (
            <div key={g.key} className="cbp-group">
              <div className="cbp-group-head">
                {g.step_label && <span className="cbp-step">{g.step_label}</span>}
                <span className="cbp-group-title">{g.title}</span>
              </div>
              {g.intro && <div className="cbp-group-intro">{g.intro}</div>}

              <Droppable droppableId={g.key}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {groupItems.map((it, i) => renderItem(it, i))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {companyId && canPropose && (proposeGroup === g.key ? (
                <div className="cbp-propose">
                  <ProposeAssist
                    onDraft={(d) => {
                      setPTitle(d.title);
                      setPNote(d.note);
                      setPPriority((BACKLOG_PRIORITIES as readonly string[]).includes(d.priority) ? (d.priority as BacklogPriority) : "next");
                      const suggested = groups.find((x) => x.key === d.groupKey);
                      setPHint(
                        d.groupKey !== g.key
                          ? `Tip: this might fit better under ${suggested?.title ?? d.groupKey}. You can propose it there instead, or send it here and Edge8 will place it.`
                          : null,
                      );
                    }}
                  />
                  <input placeholder="Short title for your idea" value={pTitle} onChange={(e) => setPTitle(e.target.value)} autoFocus />
                  <textarea placeholder="Optional: a sentence on what you're after" value={pNote} onChange={(e) => setPNote(e.target.value)} />
                  <select value={pPriority} onChange={(e) => setPPriority(e.target.value as BacklogPriority)}>
                    {BACKLOG_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                  {pHint && <div className="cbp-hint u-mb-2">{pHint}</div>}
                  <div className="u-row">
                    <button
                      type="button"
                      className="cbp-btn"
                      disabled={pending || !pTitle.trim()}
                      onClick={() => run(
                        () => proposeMyItem({ companyId, groupKey: g.key, title: pTitle, note: pNote, priority: pPriority, aiProgramId: programId }),
                        () => { setProposeGroup(null); setPTitle(""); setPNote(""); setPPriority("next"); setPHint(null); },
                      )}
                    >
                      Send to Edge8
                    </button>
                    <button type="button" className="cbp-btn ghost" onClick={() => { setProposeGroup(null); setPTitle(""); setPNote(""); setPHint(null); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="cbp-link u-mt-2" onClick={() => setProposeGroup(g.key)}>
                  + Propose an item for {g.step_label || g.title}
                </button>
              ))}
            </div>
          );
        })}
      </DragDropContext>
    </div>
  );
}
