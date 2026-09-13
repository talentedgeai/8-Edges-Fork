"use client";

import { useState } from "react";

export type MultiSelectOption = { value: string; label: string };

// A toolbar filter that takes several values: a select-styled button that
// reads "All clients" / "Acme, Globex" / "3 clients", and a popover of
// checkboxes. Nothing is selected = no filter. The popover follows the OS's
// one menu pattern (absolute flyout + full-screen click-catcher, see the
// record kebab in admin.css); there is no other menu primitive to share.
export function MultiSelect({
  label,
  noun,
  options,
  value,
  onChange,
}: {
  // The aria label and the "All …" wording: label "Filter by client", noun "clients".
  label: string;
  noun: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => value.includes(o.value));
  const text =
    chosen.length === 0 ? `All ${noun}` : chosen.length <= 2 ? chosen.map((o) => o.label).join(", ") : `${chosen.length} ${noun}`;

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className={`admin-select admin-multiselect-btn${chosen.length ? " is-filtering" : ""}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {text}
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu admin-multiselect-menu" role="listbox" aria-label={label} aria-multiselectable>
            {options.map((o) => (
              <label key={o.value} className="admin-multiselect-item" role="option" aria-selected={value.includes(o.value)}>
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
            {chosen.length > 0 && (
              <button type="button" className="admin-auth-link admin-multiselect-clear" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
