// The Supabase tables the crm entity owns (design §4).
export const CRM_TABLES = [
  "call_scorecards",
  "call_transcripts",
  "deal_stage_current",
  "deal_stage_log",
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
  "revenue_snapshots",
  "revenue_targets",
] as const;
