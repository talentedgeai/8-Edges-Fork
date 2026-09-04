// The .tcr scoped styles for the team roadmap rendering (group heads, item
// cards, priority pills), shared by the company-wide Roadmap tab and the AI
// Program view's Roadmap tab so both render identically.

export const ROADMAP_STYLES = `
.tcr { --pri-now:var(--color-primary-blue); --pri-next:var(--color-ok-ink); --pri-later:var(--color-grey-600); --pri-park:var(--color-amber-ink); max-width: 880px; }
.tcr .tcr-group { margin-bottom: 22px; }
.tcr .tcr-group-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 4px; }
.tcr .tcr-step { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 9px; border-radius:99px; background:color-mix(in srgb, var(--color-primary-blue) 10%, transparent); color:var(--color-primary-blue); }
.tcr .tcr-group-title { font-weight:700; font-size:15px; }
.tcr .tcr-group-intro { color:var(--color-text-body); font-size:13px; margin:2px 0 12px; }
.tcr .tcr-item { border:1px solid var(--admin-line); border-radius:12px; padding:13px 15px; margin-bottom:9px; background:var(--color-bg-primary); }
.tcr .tcr-item-top { display:flex; gap:9px; align-items:flex-start; flex-wrap:wrap; }
.tcr .tcr-ref { flex:none; font-size:12px; font-weight:700; color:var(--color-primary-blue); background:color-mix(in srgb, var(--color-primary-blue) 10%, transparent); border-radius:6px; padding:3px 7px; }
.tcr .tcr-title { font-weight:650; font-size:14px; flex:1 1 220px; }
.tcr .tcr-pri { flex:none; font-size:12px; font-weight:700; padding:4px 11px; border-radius:99px; }
.tcr .tcr-pri.now { background:var(--pri-now); color:var(--color-bg-primary); }
.tcr .tcr-pri.next { background:color-mix(in srgb, var(--color-ok-ink) 15%, transparent); color:var(--pri-next); }
.tcr .tcr-pri.later { background:var(--color-grey-75); color:var(--pri-later); }
.tcr .tcr-pri.park { background:var(--color-amber-bg); color:var(--pri-park); }
.tcr .tcr-body { font-size:13px; margin-top:8px; color:var(--color-primary-dark); }
.tcr .tcr-body .k { color:var(--color-text-body); font-weight:600; }
.tcr .tcr-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center; }
.tcr .tcr-chip { font-size:11px; font-weight:600; color:var(--color-text-body); border:1px solid var(--color-bg-secondary); border-radius:99px; padding:2px 9px; }
.tcr .tcr-chip.tok { color:var(--color-primary-blue); border-color:color-mix(in srgb, var(--color-primary-blue) 15%, transparent); background:color-mix(in srgb, var(--color-primary-blue) 8%, transparent); }
.tcr .tcr-chip.client { color:var(--color-ok-ink); border-color:color-mix(in srgb, var(--color-ok-ink) 25%, transparent); background:color-mix(in srgb, var(--color-ok-ink) 10%, transparent); }
`;
