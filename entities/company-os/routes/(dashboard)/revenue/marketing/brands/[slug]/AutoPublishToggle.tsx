"use client";

import { useActionRunner } from "@/entities/company-os/ui/useActionRunner";
import { setBrandAutoPublish } from "../actions";

// The writer agent's one switch per brand. Off: a run stops at "ready to
// publish" and a person presses Publish. On: the run publishes the post and
// re-derives the channel posts with no human step.
export function AutoPublishToggle({ brandId, on }: { brandId: string; on: boolean }) {
  const { note, pending, run } = useActionRunner();
  return (
    <section className="admin-card admin-section-card u-mb-5">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Writer agent</h2>
        <span className="admin-cell-muted u-sm">{on ? "Auto-publish is on" : "Auto-publish is off"}</span>
      </div>
      <label className="u-row-top">
        <input
          type="checkbox"
          className="u-mt-1"
          checked={on}
          disabled={pending}
          onChange={(e) => run(() => setBrandAutoPublish(brandId, e.target.checked), e.target.checked ? "Auto-publish on." : "Auto-publish off.")}
        />
        <span>
          <strong className="u-strong">Publish automatically</strong>
          <span className="admin-hint u-inline u-ml-2">
            When every check passes, publish the post and re-derive the channel posts with no human step. Off: the run parks at ready to publish.
          </span>
        </span>
      </label>
      {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"} u-mt-3`}>{note.text}</p>}
    </section>
  );
}
