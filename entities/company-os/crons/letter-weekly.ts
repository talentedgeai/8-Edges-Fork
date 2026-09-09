import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfileBySlug } from "@/entities/company-os/modules/campaigns/brand-profiles";
import { startLetterRun } from "@/entities/company-os/modules/campaigns/letter/advance";
import { runLetterStep } from "@/entities/company-os/modules/campaigns/letter/run-step";
import { LETTER_ACTOR } from "@/entities/company-os/modules/campaigns/letter/types";
import { SELF_BRAND_SLUG } from "@/kernel/config/brand";

// Vercel cron (see vercel.json): Monday 00:00 UTC, 07:00 in Ho Chi Minh City.
// Opens next Tuesday's letter as a draft broadcast for the house brand and
// starts the letter agent on it. The run parks at ready with a test in the
// approver's inbox; approving and starting the send stay human. If a draft the
// agent opened is still waiting from a previous week, nothing new is opened.

const ROUTINE_ID = "/api/cron/letter-weekly/";
const BATCH_SIZE = 50;

async function handler(): Promise<Response> {
  const profile = await getBrandProfileBySlug(SELF_BRAND_SLUG);
  if (!profile) return NextResponse.json({ error: `Brand ${SELF_BRAND_SLUG} not found.` }, { status: 500 });

  const { data: waiting, error: waitingError } = await companyOs
    .from("email_campaigns")
    .select("id")
    .eq("status", "draft")
    .eq("created_by", LETTER_ACTOR)
    .limit(1);
  if (waitingError) return NextResponse.json({ error: waitingError.message }, { status: 500 });
  if (waiting && waiting.length > 0) return NextResponse.json({ opened: false, waiting: waiting[0].id, message: "A letter the agent opened is still a draft." });

  const week = new Date().toISOString().slice(0, 10);
  const { data: created, error } = await companyOs
    .from("email_campaigns")
    .insert({
      name: `Letter · week of ${week}`,
      subject: "Letter (the agent writes this)",
      body_md: "",
      status: "draft",
      brand_id: profile.brandId,
      batch_size: BATCH_SIZE,
      from_email: process.env.MARKETING_EMAIL_FROM ?? null,
      reply_to: process.env.MARKETING_REPLY_TO ?? null,
      created_by: LETTER_ACTOR,
    })
    .select("id")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "insert returned no row" }, { status: 500 });

  const started = await startLetterRun(created.id);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: 500 });
  const first = await runLetterStep(created.id);
  return NextResponse.json({ opened: true, campaign: created.id, first });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
