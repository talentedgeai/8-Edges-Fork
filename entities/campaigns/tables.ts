// The Supabase tables the campaigns entity owns (design §4).
export const CAMPAIGNS_TABLES = [
  "book_chapters",
  "books",
  "email_campaign_recipients",
  "email_campaigns",
  "email_events",
  "marketing_asset_images",
  "marketing_campaigns",
  "marketing_content",
  "marketing_pillars",
  "marketing_recaps",
] as const;
