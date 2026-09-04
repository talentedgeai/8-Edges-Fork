// The ONLY sanctioned path for /team code to read company_os. Every /team page
// and server action must go through here (or an equally-scoped helper) rather
// than importing the service-role `companyOs` client directly — a lint rule
// enforces that ban. The service-role key bypasses RLS, so a single unscoped
// query would leak the whole company; funnelling reads through one helper that
// injects the actor's scope filter makes that structurally impossible.

import { companyOs } from "@/lib/supabase";
import type { TeamActor } from "@/lib/team-auth";
import type { SensitiveRow } from "@/lib/admin/people-sensitive";
import { one } from "@/lib/embedded";

// Tables /team may read, and the column + scope each is filtered on. A table not
// listed here cannot be read from /team. Expand this deliberately, one table per
// slice, always with an explicit scope key. `team_member` filters by
// actor.teamMemberScope; `person` by actor.personScope.
type ScopeKind = "team_member" | "person";
const SCOPE_ALLOWLIST: Record<string, { column: string; scope: ScopeKind }> = {
  time_off: { column: "team_member_id", scope: "team_member" },
  ideas: { column: "person_id", scope: "person" },
  onboarding_plans: { column: "team_member_id", scope: "team_member" },
  onboarding_tasks: { column: "team_member_id", scope: "team_member" },
  // Equipment is scoped on the CURRENT holder, so an employee sees only what
  // they are holding right now — never the register, and never an item they
  // handed back (its custody row stays, but the item is someone else's).
  equipment: { column: "current_holder_id", scope: "person" },
  equipment_requests: { column: "person_id", scope: "person" },
};

function scopeIds(actor: TeamActor, scope: ScopeKind): string[] {
  return scope === "team_member" ? actor.teamMemberScope : actor.personScope;
}

// Scoped read: returns a query builder already filtered to the actor's scope.
// Chain further .eq/.order/.limit as needed; the scope filter cannot be removed.
export function teamRead(actor: TeamActor, table: keyof typeof SCOPE_ALLOWLIST, select: string) {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`teamRead: '${table}' is not in the /team scope allowlist`);
  return companyOs.from(table).select(select).in(cfg.column, scopeIds(actor, cfg.scope));
}

// The actor's OWN employment summary (self-scoped by construction: filtered on
// actor.teamMemberId, which comes from the JWT-derived actor, never client input).
// Department/position/manager are reference labels, safe for the employee to see.
type PersonLite = {
  full_name: string | null;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
};
type ManagerName = { full_name: string | null; preferred_name: string | null };
// The employee-safe slice of people.metadata (populated from the Airtable
// import). Full DOB / bank / ID live in people_sensitive, never here.
export type ProfileExtras = {
  hometown: string | null;
  education: string | null;
  hobbies: string[];
  personalEmail: string | null;
  birthMonth: number | null;
  birthDay: number | null;
};
export type OwnProfile = {
  id: string;
  employee_number: string | null;
  employment_type: string | null;
  work_location: string | null;
  status: string | null;
  start_date: string | null;
  employmentStage: string | null;
  probationEndsOn: string | null;
  person: PersonLite | null;
  avatarUrl: string | null;
  departmentName: string | null;
  positionTitle: string | null;
  managerName: string | null;
  extras: ProfileExtras;
};

function extrasOf(metadata: Record<string, unknown> | null): ProfileExtras {
  const m = metadata ?? {};
  const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const asNum = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    hometown: asStr(m.hometown),
    education: asStr(m.education),
    hobbies: Array.isArray(m.hobbies) ? (m.hobbies as unknown[]).filter((h): h is string => typeof h === "string") : [],
    personalEmail: asStr(m.personal_email),
    birthMonth: asNum(m.birth_month),
    birthDay: asNum(m.birth_day),
  };
}

// PostgREST returns to-one embeds as an object, but can surface arrays; normalize.

function nameOf(p: ManagerName | null): string | null {
  return p ? p.preferred_name || p.full_name : null;
}

// Resolve a manager's person record from a team_members id. Deliberately a
// separate lookup: embedding `team_members!manager_id` on the self-referencing
// FK is ambiguous, and PostgREST resolves it in the REVERSE direction (rows
// whose manager_id points at you — your reports), so the "manager" came back
// as the first direct report. Bit us on the /team home card; never re-embed.
type ManagerPerson = ManagerName & { email: string | null };
async function getManagerPerson(managerId: string | null): Promise<ManagerPerson | null> {
  if (!managerId) return null;
  const { data } = await companyOs
    .from("team_members")
    .select("people:people!person_id(full_name, preferred_name, email)")
    .eq("id", managerId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  return one(r.people as ManagerPerson | ManagerPerson[] | null);
}

export async function getOwnProfile(actor: TeamActor): Promise<OwnProfile | null> {
  const { data } = await companyOs
    .from("team_members")
    .select(
      "id, employee_number, employment_type, work_location, status, start_date, manager_id, employment_stage, probation_ends_on, " +
        "people:people!person_id(full_name, preferred_name, email, phone, gender, emergency_contact_name, emergency_contact_phone, avatar_url, metadata), " +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const dept = one(r.departments as { name: string | null } | { name: string | null }[] | null);
  const pos = one(r.positions as { title: string | null } | { title: string | null }[] | null);
  const mgr = await getManagerPerson((r.manager_id as string | null) ?? null);
  const person = one(r.people as PersonLite | PersonLite[] | null);
  return {
    id: r.id as string,
    employee_number: (r.employee_number as string | null) ?? null,
    employment_type: (r.employment_type as string | null) ?? null,
    work_location: (r.work_location as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    start_date: (r.start_date as string | null) ?? null,
    employmentStage: (r.employment_stage as string | null) ?? null,
    probationEndsOn: (r.probation_ends_on as string | null) ?? null,
    person,
    avatarUrl: person?.avatar_url ?? null,
    departmentName: dept?.name ?? null,
    positionTitle: pos?.title ?? null,
    managerName: nameOf(mgr),
    extras: extrasOf(person?.metadata ?? null),
  };
}

// Ownership assertion for id-taking mutations: confirms a target row belongs to
// the actor's scope BEFORE the caller mutates it. Closes IDOR — an action must
// never trust a client-supplied id as the authorization subject. Returns the
// row's scope id when in scope, or null when the row is missing or out of scope.
export async function assertInScope(
  actor: TeamActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  id: string,
): Promise<string | null> {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`assertInScope: '${table}' is not in the /team scope allowlist`);
  const { data } = await companyOs.from(table).select(`${cfg.column}`).eq("id", id).maybeSingle();
  if (!data) return null;
  const owner = (data as unknown as Record<string, string>)[cfg.column];
  return scopeIds(actor, cfg.scope).includes(owner) ? owner : null;
}

// Scoped insert: the ONLY way /team code creates company_os rows. Forces the
// table's scope column to the actor's OWN id (never the broader manager scope,
// and never a client-supplied value) so a create can only ever be "for myself".
// Spreading `row` before the forced key means any client-supplied value for
// that column is silently overwritten, not merely validated.
export async function teamInsertOwn(
  actor: TeamActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  row: Record<string, unknown>,
): Promise<{ data: { id: string } | null; error: string | null }> {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`teamInsertOwn: '${table}' is not in the /team scope allowlist`);
  const ownId = cfg.scope === "team_member" ? actor.teamMemberId : actor.personId;
  const { data, error } = await companyOs
    .from(table)
    .insert({ ...row, [cfg.column]: ownId } as Record<string, unknown>)
    .select("id")
    .maybeSingle();
  return { data: (data as { id: string } | null) ?? null, error: error?.message ?? null };
}

// Scoped update: re-derives ownership via assertInScope immediately before
// writing, so a mutation can never trust a stale or client-forged id. Callers
// that need a narrower check than "actor's scope" (e.g. strictly self, not
// self-plus-reports) must assert that themselves before calling this.
export async function teamUpdateInScope(
  actor: TeamActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const owner = await assertInScope(actor, table, id);
  if (!owner) return { ok: false, error: "Not found." };
  const { error } = await companyOs.from(table).update(patch).eq("id", id);
  return { ok: !error, error: error?.message ?? null };
}

// The actor's own leave balance + policy label, read from team_directory but
// filtered to exactly one row (their own, by actor.teamMemberId — never client
// input). team_directory is not in SCOPE_ALLOWLIST because it is unsafe to read
// broadly (it carries every member's leave balance); this is a narrow,
// purpose-built exception, the same shape as getOwnProfile below.
export type OwnLeaveSummary = {
  policyName: string | null;
  totalDays: number | null;
  usedDays: number | null;
};

export async function getOwnLeaveSummary(actor: TeamActor): Promise<OwnLeaveSummary | null> {
  const { data } = await companyOs
    .from("team_directory")
    .select("leave_policy, total_days, used_days")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { leave_policy: string | null; total_days: number | string | null; used_days: number | string | null };
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return { policyName: r.leave_policy, totalDays: num(r.total_days), usedDays: num(r.used_days) };
}

// The actor's leave policy approval mode, read via team_members.leave_policy_id
// (the FK, not team_directory's Day Off COALESCE — the decision must follow the
// policy we assign, not the synced label). Self-scoped by actor.teamMemberId.
// No policy on file means manual approval: auto-approve is opt-in per policy.
export type OwnApprovalPolicy = { policyName: string | null; autoApprove: boolean };

export async function getOwnApprovalPolicy(actor: TeamActor): Promise<OwnApprovalPolicy> {
  const { data } = await companyOs
    .from("team_members")
    .select("leave_policies:leave_policies!leave_policy_id(name, auto_approve)")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  const r = data as unknown as Record<string, unknown> | null;
  const lp = one((r?.leave_policies ?? null) as { name: string | null; auto_approve: boolean } | { name: string | null; auto_approve: boolean }[] | null);
  return { policyName: lp?.name ?? null, autoApprove: lp?.auto_approve === true };
}

// The actor's manager's contact details, for notifying on a new time-off
// request. Self-scoped by actor.teamMemberId; returns null if the actor has no
// manager or the manager has no email on file.
export type ManagerContact = { email: string; displayName: string };

export async function getManagerContact(actor: TeamActor): Promise<ManagerContact | null> {
  const { data } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  const managerId = ((data as unknown as { manager_id: string | null } | null)?.manager_id) ?? null;
  const person = await getManagerPerson(managerId);
  if (!person?.email) return null;
  return { email: person.email, displayName: person.preferred_name || person.full_name || person.email };
}

// The company directory: current team members (active, on leave, or on notice —
// people who work here today; pre_start and departed are excluded), with a FIXED
// safe column list. Company-visible by design, so it takes no per-actor filter —
// but it deliberately does NOT read the team_directory view, which carries every
// member's leave balance, and it exposes no contact details (deferred decision:
// names/roles only). Widening these columns is a reviewed change, not a tweak.
const DIRECTORY_STATUSES = ["active", "on_leave", "notice"];

export type DirectoryEntry = {
  id: string;
  name: string;
  avatarUrl: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  location: string | null;
  managerName: string | null;
};

export async function getDirectory(): Promise<DirectoryEntry[]> {
  const { data } = await companyOs
    .from("team_members")
    .select(
      "id, work_location, manager_id, " +
        "people:people!person_id(full_name, preferred_name, avatar_url), " +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .in("status", DIRECTORY_STATUSES);
  type Name = { full_name: string | null; preferred_name: string | null; avatar_url?: string | null };
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const person = one(r.people as Name | Name[] | null);
    return {
    id: r.id as string,
    managerId: (r.manager_id as string | null) ?? null,
    // The directory shows the full legal name (fall back to nickname/email).
    name: person?.full_name || person?.preferred_name || "—",
    avatarUrl: person?.avatar_url ?? null,
    positionTitle:
      one(r.positions as { title: string | null } | { title: string | null }[] | null)?.title ?? null,
    departmentName:
      one(r.departments as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    location: (r.work_location as string | null) ?? null,
    };
  });
  // Managers are directory rows themselves — resolve names in-memory instead of
  // via the ambiguous self-referencing embed (see getManagerPerson).
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  const entries = rows.map(({ managerId, ...r }) => ({
    ...r,
    managerName: (managerId && nameById.get(managerId)) || null,
  }));
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// The org chart: same audience and safe column list as the directory (names,
// roles, departments — no contact details), plus manager_id and employment_type
// so the page can assemble the reporting tree and label contractors.
export type OrgEntry = {
  id: string;
  personId: string;
  name: string;
  positionTitle: string | null;
  departmentName: string | null;
  employmentType: string | null;
  managerId: string | null;
};

export async function getOrgChart(): Promise<OrgEntry[]> {
  const { data } = await companyOs
    .from("team_members")
    .select(
      "id, person_id, manager_id, employment_type, " +
        "people:people!person_id(full_name, preferred_name), " +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .in("status", DIRECTORY_STATUSES);
  type Name = { full_name: string | null; preferred_name: string | null };
  const entries = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const person = one(r.people as Name | Name[] | null);
    const dept = one(r.departments as { name: string | null } | { name: string | null }[] | null);
    const pos = one(r.positions as { title: string | null } | { title: string | null }[] | null);
    return {
      id: r.id as string,
      personId: r.person_id as string,
      name: nameOf(person) ?? "—",
      positionTitle: pos?.title ?? null,
      departmentName: dept?.name ?? null,
      employmentType: (r.employment_type as string | null) ?? null,
      managerId: (r.manager_id as string | null) ?? null,
    };
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// Open headcount, keyed by the hiring manager who owns it. job_requisitions
// stores hiring_manager_id against people, not team_members, so callers that
// work in team_member ids (the org chart) match on OrgEntry.personId. Company
// visible like the rest of /team: title, location, and the public posting link
// only — never salary bands or candidate data.
export type OpenRole = {
  id: string;
  title: string;
  slug: string | null;
  location: string | null;
  employmentType: string | null;
  isPublic: boolean;
  hiringManagerPersonId: string | null;
};

export async function getOpenRoles(): Promise<OpenRole[]> {
  const { data } = await companyOs
    .from("job_requisitions")
    .select("id, title, slug, location, employment_type, is_public, hiring_manager_id")
    .eq("status", "open");
  const roles = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? "Open role",
    slug: (r.slug as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    employmentType: (r.employment_type as string | null) ?? null,
    isPublic: Boolean(r.is_public),
    hiringManagerPersonId: (r.hiring_manager_id as string | null) ?? null,
  }));
  return roles.sort((a, b) => a.title.localeCompare(b.title));
}

// Ideas that Spark Solutions: ideas and learnings are company-visible by
// design (the Learn and Share value — the whole team sees the feed), so like
// getDirectory these take no per-actor filter. The safety boundary is the
// FIXED column list (nothing beyond what the submitter typed plus their name)
// and the archived exclusion — archiving in the admin backlog is how a post
// is taken off the team feed. Widening the columns is a reviewed change.
export type SharedIdea = {
  id: string;
  kind: string;
  person_id: string;
  title: string;
  problem: string | null;
  data_needed: string | null;
  workflow: string | null;
  roi: string | null;
  story: string | null;
  takeaway: string | null;
  source_urls: string[] | null;
  office: string | null;
  ai_plan: string | null;
  ai_error: string | null;
  status: string;
  created_at: string;
  submitterName: string;
};

const SHARED_IDEA_SELECT =
  "id, kind, person_id, title, problem, data_needed, workflow, roi, story, takeaway, source_urls, " +
  "office, ai_plan, ai_error, status, created_at, " +
  "people:people!person_id(full_name, preferred_name)";

function toSharedIdea(r: Record<string, unknown>): SharedIdea {
  const person = one(r.people as ManagerName | ManagerName[] | null);
  const { people: _people, ...rest } = r;
  return { ...(rest as Omit<SharedIdea, "submitterName">), submitterName: nameOf(person) ?? "—" };
}

export async function getSharedIdeas(): Promise<SharedIdea[]> {
  const { data } = await companyOs
    .from("ideas")
    .select(SHARED_IDEA_SELECT)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSharedIdea);
}

// Single idea for the detail page. Archived rows stay visible to their own
// submitter (their history) but disappear for everyone else.
export async function getSharedIdea(actor: TeamActor, id: string): Promise<SharedIdea | null> {
  const { data } = await companyOs
    .from("ideas")
    .select(SHARED_IDEA_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const idea = toSharedIdea(data as unknown as Record<string, unknown>);
  if (idea.status === "archived" && idea.person_id !== actor.personId) return null;
  return idea;
}

// A colleague's company-visible profile: the directory-safe fields plus the
// get-to-know-you extras people self-edit (hometown, education, hobbies).
// Deliberately NO contact details and nothing from people_sensitive — the same
// boundary as the directory; widening it is a reviewed change, not a tweak.
export type MemberProfile = {
  id: string;
  name: string;
  fullName: string | null;
  avatarUrl: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  workLocation: string | null;
  employmentType: string | null;
  startDate: string | null;
  managerId: string | null;
  managerName: string | null;
  hometown: string | null;
  education: string | null;
  hobbies: string[];
};

export async function getMemberProfile(teamMemberId: string): Promise<MemberProfile | null> {
  const { data } = await companyOs
    .from("team_members")
    .select(
      "id, manager_id, employment_type, work_location, start_date, " +
        "people:people!person_id(full_name, preferred_name, avatar_url, metadata), " +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .eq("id", teamMemberId)
    .in("status", DIRECTORY_STATUSES)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  type Person = {
    full_name: string | null;
    preferred_name: string | null;
    avatar_url: string | null;
    metadata: Record<string, unknown> | null;
  };
  const person = one(r.people as Person | Person[] | null);
  const extras = extrasOf(person?.metadata ?? null);
  const managerId = (r.manager_id as string | null) ?? null;
  const mgr = await getManagerPerson(managerId);
  return {
    id: r.id as string,
    name: nameOf(person) ?? "—",
    fullName: person?.full_name ?? null,
    avatarUrl: person?.avatar_url ?? null,
    positionTitle:
      one(r.positions as { title: string | null } | { title: string | null }[] | null)?.title ?? null,
    departmentName:
      one(r.departments as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    workLocation: (r.work_location as string | null) ?? null,
    employmentType: (r.employment_type as string | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    managerId,
    managerName: nameOf(mgr),
    hometown: extras.hometown,
    education: extras.education,
    hobbies: extras.hobbies,
  };
}

// Self-scoped profile writes. Every function here is filtered on
// actor.personId (from the JWT-derived actor, never client input) and touches
// ONLY the fields an employee may edit about themselves. Employment fields,
// full_name (used for payroll), and the company email stay admin-managed;
// widening these allowlists is a security decision, not a convenience.

// people columns the employee may self-edit.
const OWN_PEOPLE_COLUMNS = [
  "preferred_name",
  "phone",
  "gender",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;
type OwnPeopleColumn = (typeof OWN_PEOPLE_COLUMNS)[number];
// people.metadata keys the employee may self-edit (birth_month/day are derived
// from the full DOB, which itself lives in the restricted people_sensitive).
const OWN_METADATA_KEYS = [
  "personal_email",
  "hometown",
  "education",
  "hobbies",
  "birth_month",
  "birth_day",
] as const;
type OwnMetadataKey = (typeof OWN_METADATA_KEYS)[number];

// Merge-write the actor's own people columns + metadata. metadata is read then
// merged (the JS client can't do a jsonb `||`), so empty/null keys are removed
// rather than written as nulls, keeping the blob tidy.
export async function updateOwnBasics(
  actor: TeamActor,
  columns: Partial<Record<OwnPeopleColumn, string | null>>,
  metadata: Partial<Record<OwnMetadataKey, unknown>>,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: current } = await companyOs
    .from("people")
    .select("metadata")
    .eq("id", actor.personId)
    .maybeSingle();
  const baseMeta = ((current as { metadata: Record<string, unknown> | null } | null)?.metadata) ?? {};
  const nextMeta: Record<string, unknown> = { ...baseMeta };
  for (const k of OWN_METADATA_KEYS) {
    if (!(k in metadata)) continue;
    const v = metadata[k];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) delete nextMeta[k];
    else nextMeta[k] = v;
  }
  const patch: Record<string, unknown> = { metadata: nextMeta, updated_at: new Date().toISOString() };
  for (const c of OWN_PEOPLE_COLUMNS) {
    if (c in columns) patch[c] = columns[c] ?? null;
  }
  const { error } = await companyOs.from("people").update(patch).eq("id", actor.personId);
  return { ok: !error, error: error?.message ?? null };
}

// The actor's own restricted PII row (self-scoped). Returns null if none yet.
export async function getOwnSensitive(actor: TeamActor): Promise<SensitiveRow | null> {
  const { data } = await companyOs
    .from("people_sensitive")
    .select("*")
    .eq("person_id", actor.personId)
    .maybeSingle();
  return (data as SensitiveRow | null) ?? null;
}

// The actor's own company email — for the audit actor label and bank-change
// alert. Fetched server-side; never trust a client-supplied email as identity.
export async function getOwnEmail(actor: TeamActor): Promise<string | null> {
  const { data } = await companyOs
    .from("people")
    .select("email")
    .eq("id", actor.personId)
    .maybeSingle();
  return (data as { email: string } | null)?.email ?? null;
}
