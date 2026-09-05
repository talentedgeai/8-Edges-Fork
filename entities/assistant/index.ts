// The assistant entity's public surface: the two chat back ends, the shared
// conversation history, and the meeting transcript / summary helpers that the
// admin and team screens drive (multi-entity design §3, rules 1 and 2).
//
// Everything here is server-side. That is deliberate, not an oversight: the two
// chat back ends open a Postgres connection under a restricted role, the meeting
// helpers pull the Anthropic SDK and a .docx parser, and the history store holds
// the service-role Supabase client. A barrel is included in a bundle as a whole,
// so the moment a "use client" component imported this file every one of those
// would follow it into the browser. The two React pieces the widgets share
// (BotText, ConversationHistory) are therefore also on ./client.ts, the
// browser-safe door (ME-13).
//
// The surface grows when a call site needs it, not in anticipation: knip reports
// an export nothing imports, which is what keeps the door narrow. `tables.ts` is
// the entity's other declaration file and is deliberately not re-exported — it is
// read by the ownership gate and by the assistant's own code, not by callers.

// ── Conversation history, shared by both assistants ────────────────────────
export { upsertConversation } from "./lib/history/store";
export { deriveTitle } from "./lib/history/title";

// ── Admin assistant back end ───────────────────────────────────────────────
// The two back ends export the same three names, so the door disambiguates
// them; call sites alias back to the short name where the body reads better.
export { runReadOnlyQuery as runAdminChatQuery } from "./lib/admin-chat/db";
export { chatbotTools as adminChatTools, PRIVILEGED_TOOL_NAMES } from "./lib/admin-chat/tools";
export { buildSystemPrompt as buildAdminChatPrompt } from "./lib/admin-chat/system-prompt";
export { isPrivilegedChatUser } from "./lib/admin-chat/privileged";
export {
  performApprovedWrite,
  performApprovedEmail,
  performApprovedPortalInvite,
} from "./lib/admin-chat/actions";

// ── Team assistant back end ────────────────────────────────────────────────
export { runReadOnlyQuery as runTeamChatQuery } from "./lib/team-chat/db";
export { chatbotTools as teamChatTools } from "./lib/team-chat/tools";
export { buildSystemPrompt as buildTeamChatPrompt } from "./lib/team-chat/system-prompt";

// ── Meeting transcripts and summaries ──────────────────────────────────────
export { extractTranscript, MEETING_MAX_BYTES } from "./lib/meeting-extract";
export { summarizeMeeting } from "./lib/meeting-summary";

// ── AI Journey survey pair (portal survey page and API route) ──────────────
export { backfillCompanyIndustry, isAiJourneyPurpose, resolveCompanyPrefill } from "./lib/ai-journey";

// ── BotText for the two team server pages that render it ──────────────────
// Client components take it from ./client.ts; a server page may take it here.
export { BotText } from "./ui/BotText";
