import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { publishBlogAsset } from "@/lib/marketing/blog-publish";
import { notifyOps } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
export const fetchCache = "force-no-store";
export const maxDuration = 300;

// Vercel cron (see vercel.json): daily. Auto-publishes blog assets that were
// queued by moving them to `status='scheduled'` once their publish_date has
// arrived. Runs the SAME deterministic publishBlogAsset the admin button uses,
// so validation, brand routing (Edge8 -> edge8.ai; brands without a live blog
// are refused), normalization, revalidation, and live-URL verification all
// apply. Because a cron runs in a request context, revalidatePath('/blog')
// works here — the index updates the moment a post goes live. Publishes nothing
// when nothing is due; leaves anything that fails validation as 'scheduled' and
// reports it, so a bad post never silently disappears.

type DueRow = {
  id: string;
  title: string;
  publish_date: string | null;
  brands: { name: string } | { name: string }[] | null;
};

function brandName(row: DueRow): string {
  const b = Array.isArray(row.brands) ? row.brands[0] : row.brands;
  return b?.name ?? "—";
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await companyOs
    .from("marketing_content")
    .select("id, title, publish_date, brands(name)")
    .eq("channel", "blog")
    .eq("status", "scheduled")
    .lte("publish_date", today)
    .order("publish_date", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueRow[];
  const published: { title: string; url: string }[] = [];
  const failed: { title: string; brand: string; errors: string[] }[] = [];

  for (const row of due) {
    const result = await publishBlogAsset(row.id, "scheduled-publish-cron");
    if (result.ok) {
      published.push({ title: row.title, url: result.liveUrl });
    } else {
      // Leave it as 'scheduled' so it retries next run and stays visible; report.
      failed.push({ title: row.title, brand: brandName(row), errors: result.errors });
    }
  }

  // Notify ops only when something actually happened, matching the other crons'
  // quiet-by-default behavior.
  if (published.length || failed.length) {
    const lines: string[] = [];
    if (published.length) {
      lines.push(`Published ${published.length} scheduled post${published.length === 1 ? "" : "s"}:`);
      for (const p of published) lines.push(`  • ${p.title} → ${p.url}`);
    }
    if (failed.length) {
      lines.push(`Could not publish ${failed.length} due post${failed.length === 1 ? "" : "s"} (left scheduled):`);
      for (const f of failed) lines.push(`  • ${f.title} (${f.brand}): ${f.errors.join("; ")}`);
    }
    await notifyOps(lines.join("\n")).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    checked: due.length,
    published: published.length,
    failed: failed.length,
    details: { published, failed },
  });
}
