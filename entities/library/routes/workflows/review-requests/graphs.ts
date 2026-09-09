import type { WorkflowGraphDef } from '../graph'

/**
 * The real control flow of the review-request workflow: the chat request,
 * the reviewer assignment, and the review's lifecycle. Coordinates are
 * explicit so every branch, converge point, and failure path stays legible.
 */

export const REQUEST_AGENT: WorkflowGraphDef = {
  id: 'request',
  width: 900,
  height: 1010,
  nodes: [
    { id: 't1', kind: 'trigger', label: 'Talent asks the team assistant', sub: '"send a probation review link for Ngoc"', x: 360, y: 46, w: 280, h: 62 },
    { id: 'a1', kind: 'action', label: 'call request_review_link', sub: 'subject name, reviewer names or emails', x: 360, y: 142, w: 280, h: 62 },
    { id: 'd1', kind: 'decision', label: 'caller may assign reviewers?', sub: 'talent director, admin, or the manager', x: 360, y: 240, w: 270, h: 72 },
    { id: 'f1', kind: 'flag', label: 'refuse: explain who can', x: 690, y: 246, w: 200, h: 52 },
    { id: 'd2', kind: 'decision', label: 'subject resolves to one\nteam member?', x: 360, y: 352, w: 240, h: 72 },
    { id: 'f2', kind: 'flag', label: 'ask: which of these two?', sub: 'never guess a person', x: 690, y: 358, w: 210, h: 58 },
    { id: 'd3', kind: 'decision', label: 'an open cycle exists?', sub: 'probation or performance', x: 360, y: 464, w: 230, h: 70 },
    { id: 'w1', kind: 'write', label: 'open the cycle:\nself + manager rows', sub: 'same as the scheduler', x: 120, y: 470, w: 200, h: 66 },
    { id: 'd4', kind: 'decision', label: 'each reviewer is a team member,\nor a name with an email?', x: 360, y: 576, w: 280, h: 76 },
    { id: 'f3', kind: 'flag', label: 'no email, no match: report,\nadd the rest', x: 690, y: 582, w: 205, h: 62 },
    { id: 'd5', kind: 'decision', label: 'already a reviewer\non this cycle?', x: 360, y: 692, w: 230, h: 70 },
    { id: 'r1', kind: 'terminal', label: 'no-op: reuse the row', x: 690, y: 704, w: 180, h: 46 },
    { id: 'w2', kind: 'write', label: 'insert review row', sub: 'team: bound to their id; external: email + token', x: 360, y: 800, w: 280, h: 62 },
    { id: 'h1', kind: 'human', label: 'reply in chat: one link per reviewer,\nplus who was skipped', sub: 'nothing is emailed until asked', x: 360, y: 900, w: 300, h: 76 },
  ],
  edges: [
    { from: 't1', to: 'a1' },
    { from: 'a1', to: 'd1' },
    { from: 'd1', to: 'f1', kind: 'fail', label: 'no', labelAt: [550, 234] },
    { from: 'd1', to: 'd2', label: 'yes', labelAt: [375, 296] },
    { from: 'd2', to: 'f2', kind: 'fail', label: 'ambiguous', labelAt: [530, 346] },
    { from: 'd2', to: 'd3', label: 'yes', labelAt: [375, 408] },
    { from: 'd3', to: 'w1', fromSide: 'left', toSide: 'right', label: 'no', labelAt: [235, 460] },
    { from: 'd3', to: 'd4', label: 'yes', labelAt: [375, 518] },
    { from: 'w1', to: 'd4', fromSide: 'bottom', points: [[120, 576]], toSide: 'left' },
    { from: 'd4', to: 'f3', kind: 'fail', label: 'no', labelAt: [558, 570] },
    { from: 'd4', to: 'd5', label: 'yes', labelAt: [375, 635] },
    { from: 'd5', to: 'r1', label: 'yes', labelAt: [550, 696] },
    { from: 'd5', to: 'w2', kind: 'agent', label: 'no', labelAt: [375, 748] },
    { from: 'w2', to: 'h1' },
    { from: 'r1', to: 'h1', fromSide: 'bottom', points: [[690, 887]], toSide: 'right', toOffset: [0, -13] },
    { from: 'f3', to: 'h1', kind: 'fail', fromSide: 'right', points: [[840, 582], [840, 913]], toSide: 'right', toOffset: [0, 13] },
  ],
}

export const REVIEWER_FLOW: WorkflowGraphDef = {
  id: 'reviewer',
  width: 820,
  height: 760,
  nodes: [
    { id: 't1', kind: 'trigger', label: 'reviewer opens the link', sub: '/surveys/perf-review-manager?review=<id>&t=<token>', x: 300, y: 46, w: 280, h: 62 },
    { id: 'd1', kind: 'decision', label: 'token matches the row?', sub: 'or a signed-in team member who is the reviewer', x: 300, y: 146, w: 280, h: 72 },
    { id: 'f1', kind: 'flag', label: 'not found: wrong or stale link', x: 630, y: 146, w: 210, h: 58 },
    { id: 'd2', kind: 'decision', label: 'row still open?', x: 300, y: 250, w: 200, h: 60 },
    { id: 'r1', kind: 'terminal', label: 'closed: read-only thanks', x: 630, y: 250, w: 200, h: 48 },
    { id: 'a0', kind: 'action', label: 'no account needed', sub: 'name and email prefilled from the row', x: 300, y: 366, w: 300, h: 64 },
    { id: 'a1', kind: 'action', label: 'render the manager form', sub: 'decision section shown to the manager only', x: 300, y: 466, w: 280, h: 62 },
    { id: 'w1', kind: 'write', label: 'submit: ratings + text on the row', sub: 'never a survey_responses row', x: 300, y: 568, w: 280, h: 62 },
    { id: 'h1', kind: 'human', label: 'manager and talent notified', sub: 'Lark DM + email, fail-soft', x: 300, y: 670, w: 280, h: 62 },
  ],
  edges: [
    { from: 't1', to: 'd1' },
    { from: 'd1', to: 'f1', kind: 'fail', label: 'no', labelAt: [480, 138] },
    { from: 'd1', to: 'd2', label: 'yes', labelAt: [315, 200] },
    { from: 'd2', to: 'r1', label: 'no', labelAt: [465, 242] },
    { from: 'd2', to: 'a0', label: 'yes', labelAt: [315, 310] },
    { from: 'a0', to: 'a1' },
    { from: 'a1', to: 'w1' },
    { from: 'w1', to: 'h1' },
  ],
}

export const REVIEW_STATES: WorkflowGraphDef = {
  id: 'review-states',
  width: 900,
  height: 300,
  nodes: [
    { id: 'open', kind: 'state', label: 'open', x: 80, y: 70, w: 110, h: 44 },
    { id: 'sub', kind: 'state', label: 'submitted', x: 300, y: 70, w: 140, h: 44 },
    { id: 'fin', kind: 'state', label: 'finalized', x: 530, y: 70, w: 140, h: 44 },
    { id: 'ack', kind: 'state', label: 'acknowledged', x: 750, y: 70, w: 150, h: 44 },
    { id: 't0', kind: 'trigger', label: 'scheduler or chat\nopens here', x: 80, y: 190, w: 170, h: 58 },
    { id: 'dec', kind: 'write', label: 'probation decision recorded', sub: 'confirm, extend, or end', x: 420, y: 190, w: 240, h: 60 },
    { id: 'end', kind: 'terminal', label: 'employment stage\nupdated', x: 750, y: 190, w: 150, h: 56 },
  ],
  edges: [
    { from: 't0', to: 'open', kind: 'agent', fromSide: 'top', toSide: 'bottom' },
    { from: 'open', to: 'sub', kind: 'muted', label: 'reviewer submits', labelAt: [245, 40] },
    { from: 'sub', to: 'fin', kind: 'muted', label: 'manager finalizes', labelAt: [485, 40] },
    { from: 'fin', to: 'ack', kind: 'muted', label: 'subject reads', labelAt: [710, 40] },
    { from: 'fin', to: 'dec', kind: 'muted', fromSide: 'bottom', toSide: 'top', label: 'probation only', labelAt: [548, 122] },
    { from: 'dec', to: 'end', kind: 'agent' },
  ],
}
