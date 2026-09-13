// The Supabase tables the crm entity owns (design §4).
export const CRM_TABLES = [
  "call_scorecards",
  "call_transcripts",
  "deals",
  "inquiries",
  "lead",
  "lifecycle_transitions",
  "meeting_action_items",
  "meeting_associations",
  "meeting_participants",
  "meetings",
  "pipeline_stages",
  "pipelines",
] as const;
