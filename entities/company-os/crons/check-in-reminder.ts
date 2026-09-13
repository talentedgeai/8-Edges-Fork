import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { notifyProduct, notifyEo } from "@/kernel/messaging/lark";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 2 * * 1-5";

// Vercel cron (see vercel.json): weekdays 02:00 UTC (09:00 Asia/Ho_Chi_Minh).
// Step 01 of the Daily Check-in Agent (/workflows/daily-check-in-agent/): the
// nudge that gives everyone thirty minutes to move their cards before the 09:30
// run reads the board. It sends the same line to both team chats and reads
// nothing, so it cannot fail on data.
const TEXT =
  "Time to update your cards. The check-in reads the Workboard at 09:30 — " +
  "move what you finished, pick up what you are doing today, and write any blocker on the card.";

async function handler(_req: Request) {
  await Promise.all([notifyProduct(TEXT), notifyEo(TEXT)]);
  return NextResponse.json({ reminded: ["product", "eo"] });
}

export const GET = (req: Request) => withRoutineRun("/api/cron/check-in-reminder/", req, handler);
