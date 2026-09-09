"use client";

// The 8 Edges ladder picker: which company key result a goal hangs off. Shared
// by the coach page (CoachProfileView) and the member's own page (/team/goals)
// so both offer the same company goals, in the same shape. Objectives are only
// grouping headers here; a goal ladders to a key result.
//
// The value encoding (ladderValue / parseLadder) lives in lib/coaching/ladder
// so server components can use it: importing it from this client module hands
// back a client reference, not a function.

import type { EdgesOptions } from "@/entities/team/modules/coaching/types";

export function LadderSelect({
  edges,
  value,
  onChange,
  disabled,
  id,
  emptyLabel = "No ladder",
  required,
}: {
  edges: EdgesOptions;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
  emptyLabel?: string;
  // Native required: the "" placeholder option blocks submit until a pick.
  required?: boolean;
}) {
  return (
    <select
      id={id}
      className="admin-input"
      value={value}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Ladders to (8 Edges)"
    >
      <option value="">{emptyLabel}</option>
      {edges.objectives.map((o, i) => (
        <optgroup key={o.id} label={`O${i + 1}: ${o.label}`}>
          {edges.keyResults
            .filter((k) => k.objectiveId === o.id)
            .map((k, j) => (
              <option key={k.id} value={`key_result:${k.id}`}>
                {`KR${j + 1}: ${k.label}`}
              </option>
            ))}
        </optgroup>
      ))}
      {edges.keyResults.some((k) => !k.objectiveId) && (
        <optgroup label="Other key results">
          {edges.keyResults
            .filter((k) => !k.objectiveId)
            .map((k) => (
              <option key={k.id} value={`key_result:${k.id}`}>
                {k.label}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  );
}
