import type { WorkflowGraphDef } from '../graph'

/**
 * The real control flow of the daily check-in agent, the weekly summary, and
 * the state a person moves through on any one day. Coordinates are explicit:
 * every branch, converge point, loop and failure path is placed by hand so the
 * diagram stays legible.
 */

export const DAILY_AGENT: WorkflowGraphDef = {
  id: 'daily',
  width: 840,
  height: 1010,
  nodes: [
    { id: 't0', kind: 'trigger', label: '09:00 (+07) the reminder fires', sub: 'every weekday, both teams', x: 330, y: 46, w: 270, h: 58 },
    { id: 'h0', kind: 'human', label: 'post to both chats:\ntime to update your cards', x: 330, y: 138, w: 300, h: 70 },
    { id: 't1', kind: 'trigger', label: '09:30 (+07) the check-in fires', sub: 'thirty minutes later', x: 330, y: 236, w: 270, h: 58 },
    { id: 'a1', kind: 'action', label: 'load the two team rosters', sub: 'Product Team and EO, one Lark chat each', x: 330, y: 328, w: 290, h: 62 },
    { id: 'a2', kind: 'action', label: 'read the Workboard per person', sub: 'cards, moves, comments since last post', x: 330, y: 422, w: 260, h: 62 },
    { id: 'f1', kind: 'flag', label: 'read fails: abort,\npost nothing', x: 95, y: 422, w: 180, h: 62 },
    { id: 'd1', kind: 'decision', label: 'any card moved or\ncommented in 24h?', x: 330, y: 526, w: 260, h: 72 },
    { id: 'd2', kind: 'decision', label: 'day off booked?', x: 655, y: 526, w: 200, h: 60 },
    { id: 'r1', kind: 'terminal', label: 'listed as off, never pinged', x: 655, y: 626, w: 200, h: 48 },
    { id: 'h2', kind: 'human', label: 'Lark DM the person:\nupdate your cards', sub: 'the post lists them as pending', x: 655, y: 718, w: 200, h: 78 },
    { id: 'v1', kind: 'wait', label: 'wait one hour', sub: 'then look again', x: 655, y: 818, w: 220, h: 58 },
    { id: 'r2', kind: 'terminal', label: '17:30, still nothing:\nnamed in tomorrow’s post', x: 655, y: 918, w: 220, h: 52 },
    { id: 'a3', kind: 'action', label: 'compose the check-in', sub: 'done yesterday, doing today, blockers', x: 330, y: 642, w: 300, h: 62 },
    { id: 'd3', kind: 'decision', label: 'first run of the day?', x: 330, y: 748, w: 230, h: 60 },
    { id: 'h1', kind: 'human', label: 'post to the team’s Lark chat', sub: 'send fails: summary to run log', x: 330, y: 856, w: 250, h: 64 },
    { id: 'a4', kind: 'human', label: 'late: reply in thread,\nedit the morning post', x: 97, y: 856, w: 185, h: 70 },
    { id: 'w1', kind: 'write', label: 'log the run: routine_runs', sub: 'human and AI tokens counted', x: 330, y: 960, w: 280, h: 62 },
  ],
  edges: [
    { from: 't0', to: 'h0' },
    { from: 'h0', to: 't1', label: 'thirty minutes to update cards', labelAt: [455, 195] },
    { from: 't1', to: 'a1' },
    { from: 'a1', to: 'a2' },
    { from: 'a2', to: 'f1', kind: 'fail', fromSide: 'left', toSide: 'right' },
    { from: 'a2', to: 'd1' },
    { from: 'd1', to: 'a3', label: 'yes', labelAt: [345, 590] },
    { from: 'd1', to: 'd2', fromSide: 'right', fromOffset: [0, -12], toSide: 'left', toOffset: [0, -12], label: 'no', labelAt: [507, 506] },
    { from: 'd2', to: 'r1', label: 'yes', labelAt: [670, 582] },
    { from: 'd2', to: 'h2', fromSide: 'right', points: [[775, 526], [775, 718]], toSide: 'right', label: 'no', labelAt: [790, 622] },
    { from: 'h2', to: 'v1' },
    { from: 'v1', to: 'd1', kind: 'agent', fromSide: 'left', points: [[530, 818], [530, 540]], toSide: 'right', toOffset: [0, 14], label: 'look again', labelAt: [495, 700] },
    { from: 'v1', to: 'r2', label: 'day ends', labelAt: [690, 880] },
    { from: 'a3', to: 'd3' },
    { from: 'd3', to: 'h1', label: 'yes', labelAt: [345, 818] },
    { from: 'd3', to: 'a4', fromSide: 'left', points: [[97, 748]], toSide: 'top', label: 'late', labelAt: [150, 740] },
    { from: 'h1', to: 'w1' },
    { from: 'a4', to: 'w1', fromSide: 'bottom', points: [[97, 960]], toSide: 'left' },
  ],
}

export const WEEKLY_SUMMARY: WorkflowGraphDef = {
  id: 'weekly',
  width: 840,
  height: 800,
  nodes: [
    { id: 't1', kind: 'trigger', label: 'Wednesday 09:00 (+07): planning day', sub: 'the week ran Wednesday to Tuesday', x: 330, y: 46, w: 300, h: 58 },
    { id: 'a1', kind: 'action', label: 'read the week’s cards per team', sub: 'shipped, carried over, blocked', x: 330, y: 138, w: 260, h: 62 },
    { id: 'f1', kind: 'flag', label: 'read fails: abort,\nno summary', x: 95, y: 138, w: 180, h: 62 },
    { id: 'a2', kind: 'action', label: 'sum Human Tokens per person', sub: 'Human Token Tracker, Wednesday to Tuesday', x: 330, y: 236, w: 310, h: 62 },
    { id: 'a3', kind: 'action', label: 'sum AI tokens per team', sub: 'routine runs and agent sessions', x: 330, y: 334, w: 300, h: 62 },
    { id: 'd1', kind: 'decision', label: 'anyone with zero card\nupdates all week?', x: 330, y: 440, w: 280, h: 72 },
    { id: 'f2', kind: 'flag', label: 'named in the summary\nfor the team lead', x: 655, y: 440, w: 210, h: 62 },
    { id: 'a4', kind: 'action', label: 'compose the weekly summary', sub: 'outcomes, tokens, blockers, misses', x: 330, y: 548, w: 300, h: 62 },
    { id: 'h1', kind: 'human', label: 'post to both Lark chats', sub: 'read aloud at planning', x: 330, y: 652, w: 260, h: 64 },
    { id: 'f3', kind: 'flag', label: 'send fails: summary\nto the run log', x: 95, y: 652, w: 180, h: 62 },
    { id: 'w1', kind: 'write', label: 'log the run: routine_runs', sub: 'the summary’s own tokens count too', x: 330, y: 756, w: 300, h: 62 },
  ],
  edges: [
    { from: 't1', to: 'a1' },
    { from: 'a1', to: 'f1', kind: 'fail', fromSide: 'left', toSide: 'right' },
    { from: 'a1', to: 'a2' },
    { from: 'a2', to: 'a3' },
    { from: 'a3', to: 'd1' },
    { from: 'd1', to: 'f2', kind: 'fail', label: 'yes', labelAt: [505, 432] },
    { from: 'd1', to: 'a4', label: 'no', labelAt: [345, 512] },
    { from: 'f2', to: 'a4', fromSide: 'bottom', points: [[655, 548]], toSide: 'right' },
    { from: 'a4', to: 'h1' },
    { from: 'h1', to: 'f3', kind: 'fail', fromSide: 'left', toSide: 'right' },
    { from: 'h1', to: 'w1' },
    { from: 'f3', to: 'w1', fromSide: 'bottom', points: [[95, 756]], toSide: 'left' },
  ],
}

export const PERSON_DAY: WorkflowGraphDef = {
  id: 'person-day',
  width: 900,
  height: 310,
  nodes: [
    { id: 'stale', kind: 'state', label: 'stale', x: 95, y: 100, w: 110, h: 44 },
    { id: 'pinged', kind: 'state', label: 'pinged', x: 330, y: 100, w: 130, h: 44 },
    { id: 'fresh', kind: 'state', label: 'fresh', x: 560, y: 100, w: 120, h: 44 },
    { id: 'posted', kind: 'state', label: 'posted', x: 790, y: 100, w: 140, h: 44 },
    { id: 'off', kind: 'state', label: 'off', x: 200, y: 230, w: 110, h: 44 },
    { id: 'missed', kind: 'terminal', label: '17:30, no update:\nnamed tomorrow', x: 470, y: 230, w: 160, h: 52 },
    { id: 'threaded', kind: 'terminal', label: 'late: in the thread,\npost edited', x: 790, y: 230, w: 150, h: 52 },
  ],
  edges: [
    { from: 'stale', to: 'pinged', kind: 'agent', label: 'no day off', labelAt: [212, 92] },
    { from: 'stale', to: 'off', kind: 'agent', fromSide: 'bottom', points: [[95, 230]], toSide: 'left', label: 'day off booked', labelAt: [95, 175] },
    { from: 'pinged', to: 'pinged', kind: 'agent', fromSide: 'top', fromOffset: [-30, 0], points: [[300, 40], [360, 40]], toSide: 'top', toOffset: [30, 0], label: 'every hour', labelAt: [330, 32] },
    { from: 'pinged', to: 'fresh', kind: 'muted', label: 'updates a card', labelAt: [445, 92] },
    { from: 'fresh', to: 'posted', kind: 'agent', label: 'by 09:30', labelAt: [675, 92] },
    { from: 'fresh', to: 'threaded', kind: 'agent', fromSide: 'bottom', fromOffset: [10, 0], points: [[570, 230]], toSide: 'left', label: 'after 09:30', labelAt: [640, 222] },
    { from: 'pinged', to: 'missed', kind: 'agent', fromSide: 'bottom', points: [[330, 170], [470, 170]], toSide: 'top', label: '17:30, no update', labelAt: [400, 162] },
    { from: 'off', to: 'posted', kind: 'agent', fromSide: 'bottom', points: [[200, 282], [885, 282], [885, 100]], toSide: 'right', label: 'listed as off', labelAt: [540, 296] },
  ],
}
