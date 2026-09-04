import type { Episode } from "../lib/episode";

/**
 * The standalone 8 Edges intro film, script v8.
 * Source of truth for the words: docs/marketing/video-scripts/eight-edges-intro.md
 * Published read-only at /video-scripts/eight-edges-intro-video-script.html
 *
 * Target 2:55 at 145 wpm. Beats are one paragraph each, which is the unit the
 * voiceover is written in and the unit the screen changes on.
 *
 * Screens are live admin pages. Three beats use rendered cards instead, because
 * a stat and four words on a black field are not a product screen.
 */
const episode: Episode = {
  slug: "eight-edges-intro",
  number: null,
  arc: "Launch",
  title: "8 Edges intro",
  titleCardAfter: null, // The film opens cold and ends on the 8 EDGES card.
  endCard: "intro-film",
  endCardSeconds: 7,

  // Add selectors here before recording any Talent or Operations screen. The
  // script is explicit: blur candidate and staff names wherever they appear.
  privacy: [],

  beats: [
    {
      id: "hook-strategy",
      vo: "You run a company of two hundred people. You know the strategy. But do the other one hundred ninety nine actually know how to execute it?",
      hold: 0.6,
      action: async (page, s) => {
        await s.goto("/admin");
        await s.hold(1.5);
        await s.scroll(700, 3200);
      },
    },
    {
      id: "hook-stuck",
      vo: "And you want AI to help. Everyone does. But here's the reality: in most companies, AI is stuck. Nobody's designed the workflows, so it doesn't have a real job. And your data's spread across a dozen tools, so it has nothing solid to work from.",
      hold: 0.4,
      action: async (page, s) => {
        await s.card("scattered-tools");
        await s.hold(4);
      },
    },
    {
      id: "hook-stanford",
      vo: "Don't take my word for it. Stanford looked at fifty one successful AI programs. 77% of the work was not the AI technology. It was the data, and redesigning the workflows.",
      hold: 1.2,
      action: async (page, s) => {
        await s.card("stat-77");
        await s.hold(4);
      },
    },
    {
      id: "offices-outcomes",
      vo: "So where do you start? Not with a re-org. Start with what you're actually trying to achieve. Four outcomes: greater revenue. Higher performing talent. Streamlined operations. And a culture that innovates.",
      hold: 0.5,
      action: async (page, s) => {
        await s.card("four-outcomes");
        await s.hold(6);
      },
    },
    {
      id: "offices-name",
      vo: "We call this the Four Offices of the Future. It's a way to organize the work so AI can help, without reorganizing your business. One database underneath. Four offices on top. Let me show you each one, live.",
      hold: 0.6,
      action: async (page, s) => {
        await s.goto("/admin");
        await s.pushIn(".admin-sidebar, nav", 1.2);
        await s.hold(2);
        await s.pullOut();
      },
    },

    {
      id: "revenue-spine",
      vo: "This is the Office of Revenue. Every contact, every company, every conversation, in one place.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/revenue/companies");
        await s.hold(1.2);
        await s.scroll(600, 2600);
      },
    },
    {
      id: "revenue-call-to-proposal",
      vo: "Now watch this. A sales call ends. The transcript goes in. The AI updates the CRM, moves the deal, and drafts the proposal. Live, in under ten minutes. Your salesperson stays focused on the relationship, and nothing slips through the cracks.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/revenue/deals");
        await s.hold(2);
        await s.goto("/proposals");
        await s.hold(1.5);
        await s.scroll(500, 2400);
      },
    },
    {
      id: "revenue-outcome",
      vo: "Deals move faster, and fewer of them die quietly. That's greater revenue.",
      hold: 1.4,
      action: async (page, s) => {
        await s.hold(2);
      },
    },

    {
      id: "talent-pipeline",
      vo: "The Office of Talent. Three hundred applications just came in for your open roles. The AI has already read every single resume, scored every candidate, and ranked the list. Your recruiter meets the top five and makes the call.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/talent/jobs");
        await s.hold(1.6);
        await s.goto("/admin/talent/applications");
        await s.hold(1.5);
        await s.scroll(500, 2600);
      },
    },
    {
      id: "talent-after-hire",
      vo: "And after the hire? Onboarding plans, the org chart, and every manager walking into their one-on-ones with a prepared brief instead of a blank page.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/talent/onboarding");
        await s.hold(2);
        await s.goto("/admin/talent/team");
        await s.hold(2);
      },
    },
    {
      id: "talent-outcome",
      vo: "Your managers spend their time developing people, not pushing paper. That's higher performing talent.",
      hold: 1.4,
      action: async (page, s) => {
        await s.hold(2);
      },
    },

    {
      id: "operations-machinery",
      vo: "The Office of Operations. Leave requests, equipment, vendors, the books. All the machinery that quietly eats your managers' week.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/operations/time-off");
        await s.hold(2);
        await s.goto("/admin/operations/equipment");
        await s.hold(2);
      },
    },
    {
      id: "operations-outcome",
      vo: "Here, the AI does the tracking and the syncing, straight from the source systems. Your people just approve and decide. No chasing, no stale spreadsheets, nothing waiting in an inbox. That's streamlined operations.",
      hold: 1.4,
      action: async (page, s) => {
        await s.goto("/admin/revenue/invoices");
        await s.hold(2.5);
        await s.scroll(400, 2200);
      },
    },

    {
      id: "innovation-ideas",
      vo: "And the Office of Innovation. Every idea from your team lands here, instead of dying in a chat thread. The best ones get built into new workflows, and every workflow you've seen today started exactly this way.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin/innovation/ideas");
        await s.hold(2);
        await s.scroll(400, 2200);
        await s.goto("/workflows");
        await s.hold(2);
      },
    },
    {
      id: "innovation-outcome",
      vo: "When your whole team is improving how the company runs, week after week? That's an innovative culture.",
      hold: 1.4,
      action: async (page, s) => {
        await s.hold(2);
      },
    },

    {
      id: "close-machine",
      vo: "Four offices. One database. AI does the reading, the tracking, and the preparing. Your people do the deciding.",
      hold: 0.4,
      action: async (page, s) => {
        await s.goto("/admin");
        await s.hold(1.5);
        await s.pushIn(".admin-sidebar, nav", 1.15);
        await s.hold(2);
      },
    },
    {
      id: "close-outcomes",
      vo: "Greater revenue. Higher performing talent. Streamlined operations. A culture that innovates. We run our own company on this, and everything you just saw is live. This is 8 Edges.",
      hold: 1.6,
      action: async (page, s) => {
        await s.pullOut();
        await s.card("four-outcomes");
        await s.hold(6);
      },
    },
  ],
};

export default episode;
