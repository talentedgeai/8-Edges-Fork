"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/admin/format";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import {
  RECOMMENDATIONS,
  ROUND_MODES,
  DEFAULT_CRITERIA,
  type RecommendationKey,
} from "@/lib/admin/interview-panel";
import {
  addPanelist,
  createInterviewRound,
  deleteInterviewRound,
  getInterviewRounds,
  getTranscript,
  listTeamMembers,
  removePanelist,
  runAiPanelist,
  saveTranscriptText,
  submitScorecard,
  uploadInterviewTranscript,
  type InterviewRound,
  type PanelSeat,
  type TeamOption,
} from "./interview-actions";

const MODE_LABEL = new Map<string, string>(ROUND_MODES.map((m) => [m.value, m.label]));

// Interview journey for one application: rounds (each with its panel, transcript,
// and scorecards) plus an add-round form. Loads its own data on open, mirroring
// the lazy loads elsewhere in the manage drawer.
export function InterviewRounds({ applicationId }: { applicationId: string }) {
  const [rounds, setRounds] = useState<InterviewRound[] | null>(null);
  const [team, setTeam] = useState<TeamOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    const r = await getInterviewRounds(applicationId);
    if (r.ok) setRounds(r.rounds);
    else setErr(r.error);
  }

  useEffect(() => {
    let live = true;
    setRounds(null);
    setErr(null);
    getInterviewRounds(applicationId).then((r) => {
      if (!live) return;
      if (r.ok) setRounds(r.rounds);
      else setErr(r.error);
    });
    listTeamMembers().then((r) => {
      if (live && r.ok) setTeam(r.members);
    });
    return () => {
      live = false;
    };
  }, [applicationId]);

  const teamById = new Map(team.map((t) => [t.id, t.name]));

  return (
    <div className="u-mt-4">
      <div className="admin-label u-row u-between u-mb-2">
        <span>Interview journey</span>
        {rounds && rounds.length > 0 && (
          <span className="admin-cell-muted">
            {rounds.length} round{rounds.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {err && <div className="admin-alert admin-alert--err">{err}</div>}
      {rounds === null && !err && <div className="admin-hint">Loading…</div>}
      {rounds && rounds.length === 0 && <div className="admin-empty">No interview rounds yet.</div>}

      {rounds && rounds.length > 0 && (
        <ol className="u-stack u-gap-3 u-m-0 u-p-0 u-list-plain">
          {rounds.map((round, i) => (
            <RoundCard key={round.id} index={i} round={round} teamById={teamById} onChange={reload} />
          ))}
        </ol>
      )}

      {adding ? (
        <AddRoundForm
          applicationId={applicationId}
          team={team}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="u-mt-3">
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setAdding(true)}>
            + Add round
          </button>
        </div>
      )}
    </div>
  );
}

function RoundCard({
  index,
  round,
  teamById,
  onChange,
}: {
  index: number;
  round: InterviewRound;
  teamById: Map<string, string>;
  onChange: () => Promise<void>;
}) {
  const humans = round.seats.filter((s) => !s.isAi);
  const submitted = humans.filter((s) => s.scorecard?.submittedAt).length;
  // Blind-first: the AI seat is revealed only once every human on this round has
  // submitted. A round with no humans never reveals (there is nobody to anchor).
  const humansAllIn = humans.length > 0 && humans.every((s) => s.scorecard?.submittedAt);
  const humanScorecards = humans.map((s) => s.scorecard).filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <li className="u-p-4 admin-box">
      <div className="u-row u-wrap u-mb-2">
        <span
          className="admin-badge-inverse"
        >
          {index + 1}
        </span>
        <span className="admin-cell-strong">{round.title || "Interview"}</span>
        <span className="admin-cell-muted">
          {MODE_LABEL.get(round.mode) || round.mode}
          {round.scheduledAt ? ` · ${formatDate(round.scheduledAt)}` : ""}
        </span>
        <span className="admin-cell-muted u-ml-auto u-sm">
          {submitted}/{humans.length} scorecard{humans.length === 1 ? "" : "s"} in
        </span>
        <ConfirmButton
          label="Delete"
          className="admin-btn admin-btn--sm"
          title="Delete this interview round?"
          body="Its panel seats and scorecards are deleted with it. This cannot be undone."
          confirmLabel="Delete round"
          onConfirm={() => deleteInterviewRound(round.id)}
          onDone={() => void onChange()}
        />
      </div>

      <TranscriptPanel round={round} onChange={onChange} />

      <div className="u-stack u-mt-3">
        {round.seats.map((seat) => (
          <PanelSeatRow
            key={seat.interviewerId}
            round={round}
            seat={seat}
            humansAllIn={humansAllIn}
            humanScorecards={humanScorecards}
            hasTranscript={Boolean(round.transcriptDocId)}
            onChange={onChange}
          />
        ))}
      </div>

      <AddSeatControl round={round} teamById={teamById} onChange={onChange} />
    </li>
  );
}

function TranscriptPanel({ round, onChange }: { round: InterviewRound; onChange: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function view() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (text === null) {
      const r = await getTranscript(round.id);
      if (r.ok) setText(r.text);
      else setErr(r.error);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("transcript", file);
    const r = await uploadInterviewTranscript(round.id, fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!r.ok) return setErr(r.error);
    setText(null);
    await onChange();
  }

  async function savePaste() {
    setBusy(true);
    setErr(null);
    const r = await saveTranscriptText(round.id, paste);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setPaste("");
    setShowPaste(false);
    setText(null);
    await onChange();
  }

  return (
    <div className="admin-panel-soft">
      <div className="u-row u-wrap">
        <span className="admin-label u-m-0">
          Transcript
        </span>
        {round.transcriptDocId ? (
          <>
            <span className="admin-cell-muted">on file</span>
            <button type="button" className="admin-btn admin-btn--sm" onClick={view}>
              {open ? "Hide" : "View"}
            </button>
          </>
        ) : (
          <span className="admin-cell-muted">none yet</span>
        )}
        <span className="u-row u-ml-auto">
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={busy}
            onClick={() => setShowPaste((v) => !v)}
          >
            {round.transcriptDocId ? "Replace by paste" : "Paste"}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Saving…" : "Upload"}
          </button>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.vtt,.srt,text/plain"
          className="u-hidden-input"
          onChange={onFile}
        />
      </div>

      {showPaste && (
        <div className="u-mt-2">
          <textarea
            className="admin-input"
            rows={5}
            placeholder="Paste the interview transcript…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="u-row u-mt-2">
            <button
              type="button"
              className="admin-btn admin-btn--primary admin-btn--sm"
              disabled={busy || !paste.trim()}
              onClick={savePaste}
            >
              {busy ? "Saving…" : "Save transcript"}
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setShowPaste(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {err}
        </div>
      )}

      {open && (
        <div
          className="u-mt-2 u-pl-3 admin-quote u-prewrap admin-scroll-sm"
        >
          {text === null ? <span className="admin-hint">Loading transcript…</span> : text || "—"}
        </div>
      )}
    </div>
  );
}

function PanelSeatRow({
  round,
  seat,
  humansAllIn,
  humanScorecards,
  hasTranscript,
  onChange,
}: {
  round: InterviewRound;
  seat: PanelSeat;
  humansAllIn: boolean;
  humanScorecards: NonNullable<PanelSeat["scorecard"]>[];
  hasTranscript: boolean;
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const sc = seat.scorecard;
  const rec = sc?.recommendation ? RECOMMENDATIONS.find((r) => r.key === sc.recommendation) : null;

  // Blind-first: an AI scorecard is hidden until every human on the round is in.
  const aiBlind = seat.isAi && Boolean(sc) && !humansAllIn;
  const showScorecard = Boolean(sc) && !editing && !aiBlind;

  async function runAi() {
    setAiBusy(true);
    setAiErr(null);
    const r = await runAiPanelist(round.id);
    setAiBusy(false);
    if (!r.ok) return setAiErr(r.error);
    await onChange();
  }

  return (
    <div className="u-p-2 admin-box">
      <div className="u-row u-wrap">
        <span
          aria-hidden
          className={`admin-tag-pill admin-tag-pill--bold${seat.isAi ? " admin-tag-pill--accent" : ""}`}
        >
          {seat.isAi ? "AI" : seat.role === "lead" ? "LEAD" : seat.role.toUpperCase()}
        </span>
        <span className="admin-cell-strong">{seat.name}</span>
        {rec && !aiBlind && (
          <span className="u-sm u-strong" style={{ color: recTone(rec.tone) }} /* layout-ok: tone is a token var chosen at runtime */>
            {rec.label}
            {sc?.overallScore != null ? ` · ${sc.overallScore}/5` : ""}
          </span>
        )}
        {aiBlind && (
          <span className="admin-cell-muted u-sm">
            scored · hidden
          </span>
        )}
        <span className="u-row u-ml-auto">
          {seat.isAi ? (
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              disabled={aiBusy || !hasTranscript}
              title={hasTranscript ? undefined : "Add a transcript first"}
              onClick={runAi}
            >
              {aiBusy ? "Scoring…" : sc ? "Re-run" : "Run AI panelist"}
            </button>
          ) : (
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close" : sc ? "Edit scorecard" : "Submit scorecard"}
            </button>
          )}
          {!seat.isAi && !sc && seat.role !== "lead" && (
            <ConfirmButton
              label="Remove"
              className="admin-btn admin-btn--sm"
              title={`Remove ${seat.name} from this panel?`}
              body="They lose their seat on this round. You can add them back later."
              confirmLabel="Remove"
              onConfirm={() => removePanelist(round.id, seat.interviewerId)}
              onDone={() => void onChange()}
            />
          )}
        </span>
      </div>

      {aiErr && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {aiErr}
        </div>
      )}

      {seat.isAi && !sc && !aiErr && (
        <div className="admin-hint u-mt-1">
          {hasTranscript
            ? "The AI panelist scores automatically when a transcript is added. Run it now if needed."
            : "Add a transcript for this round and the AI panelist scores it automatically."}
        </div>
      )}

      {aiBlind && (
        <div className="admin-hint u-mt-1">
          The AI has scored this round. It stays hidden until every interviewer submits, so it can’t sway the panel.
        </div>
      )}

      {showScorecard && sc && (
        <div className="u-stack u-mt-2">
          {sc.scores.length > 0 && (
            <div className="u-stack">
              {sc.scores.map((s) => {
                const flag = seat.isAi && humansAllIn && disagrees(s.score, humanScores(humanScorecards, s.criterion));
                return (
                  <div key={s.criterion} className="u-row">
                    <span className="admin-cell-muted u-min-1">
                      {s.criterion}
                    </span>
                    <span className="admin-cell-strong">{s.score != null ? `${s.score}/5` : "—"}</span>
                    {flag && <DisagreeTag />}
                    {s.comment && <span className="admin-cell-muted">{s.comment}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {seat.isAi && humansAllIn && disagrees(sc.overallScore, humanScorecards.map((h) => h.overallScore)) && (
            <div className="u-sm">
              <DisagreeTag /> <span className="admin-cell-muted">overall differs from a human panelist by a full point</span>
            </div>
          )}
          {sc.summary && <div className="u-prewrap">{sc.summary}</div>}
          {sc.submittedAt && (
            <div className="admin-cell-muted">
              {seat.isAi ? "Scored" : "Submitted"} {formatDate(sc.submittedAt)}
            </div>
          )}
        </div>
      )}

      {editing && !seat.isAi && (
        <ScorecardForm
          round={round}
          seat={seat}
          onDone={async () => {
            setEditing(false);
            await onChange();
          }}
        />
      )}
    </div>
  );
}

function DisagreeTag() {
  return (
    <span
      className="admin-tag-pill admin-tag-pill--bold admin-tag-pill--warn"
    >
      GAP
    </span>
  );
}

function humanScores(cards: NonNullable<PanelSeat["scorecard"]>[], criterion: string): (number | null)[] {
  return cards.flatMap((c) => c.scores.filter((s) => s.criterion === criterion).map((s) => s.score));
}

// True if any human score sits a full point or more from the AI score.
function disagrees(aiScore: number | null, others: (number | null)[]): boolean {
  if (aiScore == null) return false;
  return others.some((o) => o != null && Math.abs(o - aiScore) >= 1);
}

type ScoreRow = { criterion: string; score: number | null; comment: string };

function ScorecardForm({
  round,
  seat,
  onDone,
}: {
  round: InterviewRound;
  seat: PanelSeat;
  onDone: () => Promise<void>;
}) {
  const existing = seat.scorecard;
  const [recommendation, setRecommendation] = useState<RecommendationKey | null>(existing?.recommendation ?? null);
  const [overall, setOverall] = useState<number | null>(existing?.overallScore ?? null);
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [rows, setRows] = useState<ScoreRow[]>(
    existing && existing.scores.length > 0
      ? existing.scores.map((s) => ({ criterion: s.criterion, score: s.score, comment: s.comment ?? "" }))
      : DEFAULT_CRITERIA.map((c) => ({ criterion: c, score: null, comment: "" })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setRow(i: number, patch: Partial<ScoreRow>) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await submitScorecard(round.id, seat.interviewerId, {
      recommendation,
      overallScore: overall,
      summary,
      scores: rows,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    await onDone();
  }

  return (
    <div className="admin-form u-mt-3">
      <div className="admin-field">
        <label className="admin-label">Recommendation</label>
        <div className="u-row">
          {RECOMMENDATIONS.map((r) => {
            const on = recommendation === r.key;
            return (
              <button
                key={r.key}
                type="button"
                className="admin-btn admin-btn--sm"
                aria-pressed={on}
                onClick={() => setRecommendation(on ? null : r.key)}
                style={
                  on
                    ? { borderColor: recTone(r.tone), color: recTone(r.tone), fontWeight: 600 }
                    : undefined
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Overall score</label>
        <ScoreButtons value={overall} onChange={setOverall} />
      </div>

      <div className="admin-field">
        <label className="admin-label">Criteria</label>
        <div className="u-stack">
          {rows.map((row, i) => (
            <div key={i} className="u-stack u-gap-1">
              <div className="u-row u-wrap">
                <input
                  className="admin-input u-flex-1 u-max-3"
                  value={row.criterion}
                  placeholder="Criterion"
                  onChange={(e) => setRow(i, { criterion: e.target.value })}
                />
                <ScoreButtons value={row.score} onChange={(v) => setRow(i, { score: v })} />
              </div>
              <input
                className="admin-input"
                value={row.comment}
                placeholder="Evidence / comment (optional)"
                onChange={(e) => setRow(i, { comment: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn--sm u-self-start"
            onClick={() => setRows((cur) => [...cur, { criterion: "", score: null, comment: "" }])}
          >
            + Add criterion
          </button>
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Summary</label>
        <textarea
          className="admin-input"
          rows={3}
          placeholder="Overall read on the candidate from this round…"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>

      {err && <div className="admin-alert admin-alert--err">{err}</div>}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Submit scorecard"}
        </button>
      </div>
    </div>
  );
}

function ScoreButtons({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="u-row">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`Score ${n}`}
            aria-pressed={on}
            onClick={() => onChange(on ? null : n)}
            className={`admin-score-btn${on ? " is-on" : ""}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function AddSeatControl({
  round,
  teamById,
  onChange,
}: {
  round: InterviewRound;
  teamById: Map<string, string>;
  onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seated = new Set(round.seats.map((s) => s.interviewerId));
  const options = [...teamById.entries()].filter(([id]) => !seated.has(id));

  async function add() {
    if (!personId) return;
    setBusy(true);
    setErr(null);
    const r = await addPanelist(round.id, personId, "interviewer");
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setPersonId("");
    setOpen(false);
    await onChange();
  }

  if (!open) {
    return (
      <div className="u-mt-2">
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(true)}>
          + Add panelist
        </button>
      </div>
    );
  }

  return (
    <div className="u-row u-wrap u-mt-2">
      <select
        className="admin-select u-max-3"
        value={personId}
        onChange={(e) => setPersonId(e.target.value)}
      >
        <option value="">Choose a team member…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy || !personId} onClick={add}>
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {err && <span className="u-sm u-err">{err}</span>}
    </div>
  );
}

function AddRoundForm({
  applicationId,
  team,
  onDone,
  onCancel,
}: {
  applicationId: string;
  team: TeamOption[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<string>("video");
  const [when, setWhen] = useState("");
  const [panelists, setPanelists] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function togglePanelist(id: string) {
    setPanelists((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function create() {
    setBusy(true);
    setErr(null);
    const scheduledAt = when ? new Date(when).toISOString() : null;
    const r = await createInterviewRound(applicationId, { title, mode, scheduledAt, panelistIds: panelists });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    await onDone();
  }

  return (
    <div className="admin-form u-mt-3 u-p-4 admin-box">
      <div className="admin-field">
        <label className="admin-label">Round title</label>
        <input
          className="admin-input"
          placeholder="Recruiter screen, Engineering interview, Founder interview…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Mode</label>
          <select className="admin-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            {ROUND_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">When (optional)</label>
          <input className="admin-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Human panelists</label>
        {team.length === 0 ? (
          <div className="admin-hint">Loading team…</div>
        ) : (
          <div className="u-row u-wrap u-gap-2 admin-scroll-xs">
            {team.map((t) => {
              const on = panelists.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="admin-btn admin-btn--sm"
                  aria-pressed={on}
                  onClick={() => togglePanelist(t.id)}
                  style={on ? { borderColor: "var(--admin-accent)", color: "var(--admin-accent)", fontWeight: 600 } : undefined}
                >
                  {on ? "✓ " : ""}
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="admin-hint u-mt-1">
          The AI panelist is seated automatically.
        </div>
      </div>

      {err && <div className="admin-alert admin-alert--err">{err}</div>}

      <div className="admin-form-actions">
        <button
          type="button"
          className="admin-btn admin-btn--primary admin-btn--sm"
          disabled={busy || !title.trim() || panelists.length === 0}
          onClick={create}
        >
          {busy ? "Creating…" : "Create round"}
        </button>
        <button type="button" className="admin-btn admin-btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function recTone(tone: string): string {
  if (tone === "ok") return "var(--admin-ok-ink)";
  if (tone === "warn") return "var(--admin-warn-ink)";
  return "var(--admin-err-ink)";
}
