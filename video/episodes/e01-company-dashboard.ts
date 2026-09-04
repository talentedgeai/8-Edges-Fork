import type { Episode } from "../lib/episode";

/**
 * E01 of the daily series. Words come from the approved script in
 * public/workflows/private/e8/demo-video-series.html, section 05.
 *
 * This is the pilot episode: settle zoom, caption legibility, and pacing here
 * before batch recording E01 to E06. Getting it wrong later means re-recording
 * six episodes, not one.
 */
const episode: Episode = {
  slug: "e01-company-dashboard",
  number: "01",
  arc: "Operating System",
  title: "Company Dashboard",
  titleCardAfter: "cold-open", // Cold open first, card at the first beat boundary.
  endCard: "standard",

  privacy: [],

  beats: [
    {
      id: "cold-open",
      vo: "If you asked five people in your company how the business is doing, you'd get five answers. This screen exists so there's only one.",
      // Hand-tuned to match the brand kit caption sample for E01.
      captions: [
        ["Ask five people how the business is doing,", "you get five answers. This screen exists so there's one."],
      ],
      hold: 0.5,
      action: async (page, s) => {
        await s.goto("/admin");
        await s.scroll(500, 3000); // Open mid-scroll. No logo, no title, already moving.
      },
    },
    {
      id: "one-screen",
      vo: "This is the Company Dashboard in 8 Edges. One screen, the whole company: the goals you committed to, the metrics that prove progress, and the issues standing in the way.",
      hold: 0.4,
      action: async (page, s) => {
        await s.scroll(-500, 2000);
        await s.hold(2);
      },
    },
    {
      id: "not-for-show",
      vo: "First: nothing on this page is typed in for show. Every number rolls up from live metrics. Every goal reflects real check-ins. If the dashboard looks bad, the business is actually off track, and that's the point.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/edges/metrics");
        await s.hold(2);
        await s.pushIn("table, .admin-table", 1.3);
        await s.hold(2);
        await s.pullOut();
      },
    },
    {
      id: "opinionated",
      vo: "Second: it's opinionated. Green means on pace, amber means drifting, red means someone owns a fix. You don't debate what the colors mean in the meeting.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/edges/goals");
        await s.hold(3);
      },
    },
    {
      id: "drill-down",
      vo: "Third: everything drills down. Click a goal, you see whose work feeds it. Click a metric, you get the history, not just this week's number.",
      hold: 0.4,
      action: async (page, s) => {
        await s.click("a[href*='/admin/edges/goals/'], .admin-card a");
        await s.hold(2.5);
      },
    },
    {
      id: "close",
      vo: "One screen, one version of the truth. Tomorrow: how goals cascade from the company to every single person.",
      hold: 1.2,
      action: async (page, s) => {
        await s.goto("/admin");
        await s.hold(2.5);
      },
    },
  ],
};

export default episode;
