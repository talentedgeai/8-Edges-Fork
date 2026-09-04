'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { allWorkflows } from '@/lib/workflowsData'

const REPO_URL = 'https://github.com/talentedgeai/8edges'
const DEMO_URL = 'https://8edges.app'
const ATLAS_URL = '/8-edges-app/data-atlas.html'

const featuredWorkflows = allWorkflows.slice(0, 12)

export default function EightEdgesAppPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) } }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <main>
      {/* ═══ 01 HERO ═════════════════════════════════════ */}
      <section className="site-page-hero">
        <div className="container">
          <div className="site-page-hero-inner">
            <span className="site-section-label">The 8 Edges Operating System</span>
            <h1 className="site-section-title">AI Doesn&apos;t Work When Your Data Lives in 10 Different Apps</h1>
            <p className="site-page-hero-sub">
              Your most precious resource is your data, and it is scattered: CRM in one app, HR in spreadsheets,
              goals in slides, finances behind another login. That is why every AI tool you have tried gives generic
              answers. 8 Edges puts your whole company in one database, so AI finally has something to work with.
            </p>
            <div className="site-e8a-btn-row">
              <a href={DEMO_URL} className="btn btn-primary" target="_blank" rel="noopener noreferrer">See the Live Demo</a>
              <a href="#offer" className="btn site-btn-secondary">Get It Installed for You</a>
            </div>
            <p className="u-mt-5 u-lg">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="site-link-muted">
                Or fork the source on GitHub
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 02 PAIN ═════════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Sound Familiar?</span>
            <h2 className="site-section-title">You Don&apos;t Have an AI Problem. You Have a Data Problem.</h2>
          </div>
          <div className="site-e8a-grid site-e8a-grid--3">
            <div className="site-e8a-card reveal">
              <h3>The generic chatbot</h3>
              <p>
                You ask AI about your business and get answers it could give anyone, because it can&apos;t see your
                deals, your people, or your numbers. It is smart about everything except your company.
              </p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>The copy-paste assistant</h3>
              <p>
                Every AI session starts with you pasting context in and ends with you pasting results back out into
                five different tools. You became the integration.
              </p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>The stalled pilot</h3>
              <p>
                The demo was magic. Then it hit your real stack: 10 apps, no shared database, nothing for the agent
                to read or write. Pilot dead in a month.
              </p>
            </div>
          </div>
          <p className="site-section-sub reveal u-mt-7">
            The fix isn&apos;t a better model. It&apos;s a home for your data.
          </p>
        </div>
      </section>

      {/* ═══ 03 THE TURN ═════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Meet 8 Edges</span>
            <h2 className="site-section-title">Every Person, Deal, Goal, and Dollar. One Database.</h2>
          </div>
          <div className="site-e8a-definition reveal">
            <div>
              <span className="site-e8a-definition-term">Company OS</span>
              <span className="site-e8a-definition-phonetic">/ˈkʌmpəni oʊ ɛs/</span>
            </div>
            <div className="site-e8a-definition-type">noun</div>
            <p className="site-e8a-definition-body">
              A single centralized database that every team member, every portal, and every AI agent reads from and
              writes to. An open-source Next.js app on a Supabase database, deployed on Vercel.
            </p>
          </div>
          <div className="site-e8a-stats">
            <div className="site-e8a-stat reveal">
              <div className="site-e8a-stat-num">148</div>
              <p className="site-e8a-stat-label">tables in one schema: deals, people, goals, invoices, coaching, events</p>
            </div>
            <div className="site-e8a-stat reveal">
              <div className="site-e8a-stat-num">3</div>
              <p className="site-e8a-stat-label">portals: admin, team member, and client, all on the same data</p>
            </div>
            <div className="site-e8a-stat reveal">
              <div className="site-e8a-stat-num">13</div>
              <p className="site-e8a-stat-label">scheduled agents running the company on autopilot</p>
            </div>
            <div className="site-e8a-stat reveal">
              <div className="site-e8a-stat-num">1</div>
              <p className="site-e8a-stat-label">source of truth. One login system, no double entry, no sync drift</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 04 PORTALS ══════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">One Database, Three Front Doors</span>
            <h2 className="site-section-title">Everyone Sees Exactly What They Should. Nothing More, Nothing Less.</h2>
          </div>
          <div className="site-e8a-grid site-e8a-grid--3">
            <div className="site-e8a-card reveal">
              <h3>Admin portal</h3>
              <p>The command center: your goals cascade and the four offices of the company.</p>
              <ul>
                <li><strong>Eight Edges:</strong> Goals, Metrics, Sync, Issues, Reviews</li>
                <li><strong>Revenue:</strong> Leads, Deals, Pipelines, Campaigns, Sales Intelligence</li>
                <li><strong>Talent:</strong> Team, Candidate Pool, Onboarding, Reviews, Time Off</li>
                <li><strong>Operations:</strong> Invoices, Payments, QuickBooks, Equipment, Policies</li>
                <li><strong>Innovation:</strong> Idea Backlog, AIO Pad, Gallery</li>
              </ul>
            </div>
            <div className="site-e8a-card reveal">
              <h3>Team portal</h3>
              <p>Each person&apos;s own view of the same database, plus the company layer everyone shares.</p>
              <ul>
                <li><strong>Me:</strong> My Work, My FAST Goals, My Coach, Time Off, Reviews</li>
                <li><strong>Company:</strong> Strategy, Company Goals, Core Values, Org Chart</li>
                <li><strong>Together:</strong> Work Boards, Ideas, Approvals, Directory</li>
              </ul>
            </div>
            <div className="site-e8a-card reveal">
              <h3>Client portal</h3>
              <p>A clean login for every client, pulled live from the same database. No status update emails.</p>
              <ul>
                <li><strong>Work:</strong> Client Hub, Delivery, Requests</li>
                <li><strong>Money:</strong> Invoices, live from the books</li>
                <li><strong>More:</strong> AI Programs, Events, Referrals, their own users</li>
              </ul>
            </div>
          </div>
          <div className="reveal u-mt-7 u-center-text">
            <a href={DEMO_URL} className="btn btn-primary" target="_blank" rel="noopener noreferrer">Click Around the Demo</a>
          </div>
        </div>
      </section>

      {/* ═══ 05 AGENTS ═══════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">This Is the Part Nobody Else Has</span>
            <h2 className="site-section-title">When Your Data Lives in One Place, AI Stops Chatting and Starts Working</h2>
            <p className="site-section-sub u-mt-4">
              Agents can only run a company they can see. Everything below ships in the codebase today.
            </p>
          </div>
          <div className="site-e8a-grid site-e8a-grid--2">
            <div className="site-e8a-card reveal">
              <h3>The data assistant</h3>
              <p>
                Ask questions in plain English and the admin agent queries the whole company database directly. It can
                also write records, send email, and invite portal members, with your permission, from chat.
              </p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>The scheduled operators</h3>
              <p>
                13 cron agents in production: the coaching cycle with hourly recaps, onboarding, probation and
                performance review triggers, contractor payments, QuickBooks refresh and invoice sync, idea and board
                digests, and a campaign sender that fires every 15 minutes.
              </p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>The hiring pipeline</h3>
              <p>
                Resume extraction, AI screening, and an AI interview panelist feed the Candidate Pool, so every
                applicant is processed the same way before a human spends a minute.
              </p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>The content engine</h3>
              <p>
                Brand writer, brand image generation, meeting summaries, and idea-to-plan pipelines, all drafting from
                what the company actually did instead of what a prompt guessed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 06 WORKFLOWS ════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">You Don&apos;t Start From Zero</span>
            <h2 className="site-section-title">100 Core Business Workflows, Already Built In</h2>
            <p className="site-section-sub u-mt-4">
              The repeatable operations of a real company, wired to the database and organized around the four
              offices: Revenue, Talent, Operations, Innovation. Here is a sample.
            </p>
          </div>
          <div className="site-e8a-workflow-wall">
            {featuredWorkflows.map((w) => (
              <Link key={w.slug} href={`/workflows/${w.slug}/`} className="site-e8a-workflow-chip reveal">
                <div className="site-e8a-workflow-chip-office">{w.category}</div>
                <div className="site-e8a-workflow-chip-title">{w.title}</div>
              </Link>
            ))}
          </div>
          <div className="reveal u-mt-7 u-center-text">
            <Link href="/workflows/" className="btn btn-primary">Browse All the Workflows</Link>
          </div>
        </div>
      </section>

      {/* ═══ 07 ARCHITECTURE ═════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Boring Technology, On Purpose</span>
            <h2 className="site-section-title">Next.js + Supabase + Vercel. That&apos;s the Whole Stack.</h2>
            <p className="site-section-sub u-mt-4">
              Standard open tools, free tiers to start, and any developer (or AI coding agent) can extend it.
            </p>
          </div>
          <div className="site-e8a-arch reveal">
            <div className="site-e8a-arch-row">
              <div className="site-e8a-arch-node">
                <div className="site-e8a-arch-node-title">Admin portal</div>
                <div className="site-e8a-arch-node-sub">founders and ops</div>
              </div>
              <div className="site-e8a-arch-node">
                <div className="site-e8a-arch-node-title">Team portal</div>
                <div className="site-e8a-arch-node-sub">every team member</div>
              </div>
              <div className="site-e8a-arch-node">
                <div className="site-e8a-arch-node-title">Client portal</div>
                <div className="site-e8a-arch-node-sub">every client</div>
              </div>
            </div>
            <div className="site-e8a-arch-connector" />
            <div className="site-e8a-arch-row">
              <div className="site-e8a-arch-node">
                <div className="site-e8a-arch-node-title">Next.js app on Vercel</div>
                <div className="site-e8a-arch-node-sub">one codebase, your fork</div>
              </div>
            </div>
            <div className="site-e8a-arch-connector" />
            <div className="site-e8a-arch-row">
              <div className="site-e8a-arch-node site-e8a-arch-node--db">
                <div className="site-e8a-arch-node-title">Supabase: the company_os database</div>
                <div className="site-e8a-arch-node-sub">148 tables, one source of truth, in your account</div>
              </div>
            </div>
            <div className="site-e8a-arch-connector" />
            <div className="site-e8a-arch-row">
              <div className="site-e8a-arch-node">
                <div className="site-e8a-arch-node-title">13 scheduled agents + Claude</div>
                <div className="site-e8a-arch-node-sub">reading the tree, writing the numbers</div>
              </div>
            </div>
          </div>
          <div className="site-e8a-btn-row reveal u-mt-8">
            <a href={ATLAS_URL} className="btn btn-primary">Explore the Data Atlas</a>
          </div>
          <p className="site-section-sub reveal u-mt-4 u-ml-auto u-mr-auto u-center-text">
            The interactive map of the whole database: every table, every column, every domain.
          </p>
        </div>
      </section>

      {/* ═══ 08 OWNERSHIP ════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">No Rent, No Lock-In</span>
            <h2 className="site-section-title">You Own the Source Code. Customize It However You Want.</h2>
          </div>
          <div className="site-e8a-grid site-e8a-grid--3">
            <div className="site-e8a-card reveal">
              <h3>Your fork, your rules</h3>
              <p>Rename it, restyle it, rip out what you don&apos;t need, add what you do. It is a standard Next.js and TypeScript codebase.</p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>Your database, your keys</h3>
              <p>The data sits in your own Supabase account under your own login. Cancel everything and it is still yours.</p>
            </div>
            <div className="site-e8a-card reveal">
              <h3>Built to be extended by AI</h3>
              <p>Claude Code and other coding agents handle this codebase well. Describe the feature you want, and your OS grows.</p>
            </div>
          </div>
          <p className="site-section-sub reveal u-mt-7">
            Every SaaS you use is someone else&apos;s database that you pay to visit.
          </p>
        </div>
      </section>

      {/* ═══ 09 INSTALL ══════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">From Fork to Live in an Afternoon</span>
            <h2 className="site-section-title">Here&apos;s Exactly How to Install It</h2>
          </div>
          <div className="site-e8a-steps reveal">
            <div className="site-e8a-step">
              <div className="site-e8a-step-num">01</div>
              <div>
                <h3>Fork the repo</h3>
                <p>One click on GitHub. The whole app, the migrations, and the workflow library come with it.</p>
              </div>
            </div>
            <div className="site-e8a-step">
              <div className="site-e8a-step-num">02</div>
              <div>
                <h3>Create a free Supabase project</h3>
                <p>Sign up, create a project, and copy your project URL and keys. About two minutes.</p>
              </div>
            </div>
            <div className="site-e8a-step">
              <div className="site-e8a-step-num">03</div>
              <div>
                <h3>Install the database</h3>
                <p>Paste the install script into the Supabase SQL editor and run it. Every table, rule, and seed lands in one pass.</p>
              </div>
            </div>
            <div className="site-e8a-step">
              <div className="site-e8a-step-num">04</div>
              <div>
                <h3>Set your keys</h3>
                <p>Copy <code>.env.example</code>, fill in the required values. The full key reference is below.</p>
              </div>
            </div>
            <div className="site-e8a-step">
              <div className="site-e8a-step-num">05</div>
              <div>
                <h3>Deploy to Vercel</h3>
                <p>Import your fork, paste the same keys, deploy. You are looking at your own company OS.</p>
              </div>
            </div>
          </div>
          <div className="reveal u-mt-7">
            <Link href="/8-edges-app/install/" className="btn btn-primary">Read the Full Install Guide</Link>
          </div>
        </div>
      </section>

      {/* ═══ 10 CONFIG ═══════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Every Key, Explained</span>
            <h2 className="site-section-title">9 Required Keys. Everything Else Is Optional.</h2>
          </div>
          <div className="site-e8a-table-wrap reveal">
            <table className="site-e8a-table">
              <thead>
                <tr><th>Key</th><th>What it unlocks</th></tr>
              </thead>
              <tbody>
                <tr><td><code>SUPABASE_URL</code> + <code>SUPABASE_SECRET_KEY</code></td><td>Server access to your database</td></tr>
                <tr><td><code>NEXT_PUBLIC_SUPABASE_URL</code> + <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></td><td>Browser auth and login</td></tr>
                <tr><td><code>ADMIN_EMAILS</code></td><td>Who gets into the admin portal</td></tr>
                <tr><td><code>ANTHROPIC_API_KEY</code></td><td>Claude, powering every agent feature</td></tr>
                <tr><td><code>OPENROUTER_API_KEY</code> + <code>OPENROUTER_MODEL</code></td><td>Secondary models</td></tr>
                <tr><td><code>CHATBOT_DB_URL</code></td><td>The plain-English data assistant</td></tr>
                <tr><td><code>CRON_SECRET</code></td><td>Secures the scheduled agents on Vercel</td></tr>
              </tbody>
            </table>
          </div>
          <p className="site-section-sub reveal u-mt-6">
            Optional integrations, each one a key away: Resend for email, Stripe for payments, Lark, QuickBooks,
            Telegram, GitHub sync. Unset keys just switch features off. The app degrades gracefully.
          </p>
        </div>
      </section>

      {/* ═══ 11 OFFER ════════════════════════════════════ */}
      <section className="section" id="offer">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Pick Your Path</span>
            <h2 className="site-section-title">Free If You Build. $99 If You Want Company. $15,000 If You Want It Done.</h2>
          </div>
          <div className="site-e8a-tiers">
            <div className="site-e8a-tier reveal">
              <div className="site-e8a-tier-name">Do It Yourself</div>
              <div className="site-e8a-tier-price">Free</div>
              <p className="site-e8a-tier-desc">Fork the repo and install it yourself with the guide. The full product. No trial, no crippled tier.</p>
              <ul>
                <li>The complete source code</li>
                <li>The database install script</li>
                <li>The full install guide</li>
                <li>Every workflow, portal, and agent</li>
              </ul>
              <a href={REPO_URL} className="btn btn-primary" target="_blank" rel="noopener noreferrer">Fork It on GitHub</a>
            </div>
            <div className="site-e8a-tier reveal">
              <div className="site-e8a-tier-name">Community</div>
              <div className="site-e8a-tier-price">$99<span>/month</span></div>
              <p className="site-e8a-tier-desc">For builders who don&apos;t want to build alone.</p>
              <ul>
                <li>The Edge8 builder community</li>
                <li>Working sessions and install help</li>
                <li>New workflow templates as they ship</li>
                <li>Direct answers from the team</li>
              </ul>
              <Link href="/contact/" className="btn btn-primary">Join the Community</Link>
            </div>
            <div className="site-e8a-tier site-e8a-tier--featured reveal">
              <div className="site-e8a-tier-name">Done for You</div>
              <div className="site-e8a-tier-price">$15,000<span> one time</span></div>
              <p className="site-e8a-tier-desc">We install 8 Edges, wire it up to 5 of your existing data sources, migrate your data, and hand you the keys.</p>
              <ul>
                <li>Full installation and configuration</li>
                <li>Up to 5 data sources connected</li>
                <li>Your data migrated in</li>
                <li>Team walkthrough and handover</li>
              </ul>
              <Link href="/contact/" className="btn site-btn-secondary">Schedule a Consultation</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 12 PROOF ════════════════════════════════════ */}
      <section className="section site-section--tint">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Already Running in the Wild</span>
            <h2 className="site-section-title">We Run Edge8 on It. Every Deal, Hire, Goal, and Invoice.</h2>
            <p className="site-section-sub u-mt-4">
              8 Edges isn&apos;t a product we built to sell. It is the system we built to run our own company, from the
              sales pipeline to payroll to the weekly goal check-ins, and then opened up. The 13 agents you read about
              above ran today.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 13 FAQ ══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="site-section-label">Questions People Actually Ask</span>
            <h2 className="site-section-title">FAQ</h2>
          </div>
          <div className="site-e8a-faq reveal">
            <details>
              <summary>Where does my data live?</summary>
              <p>In your own Supabase project, under your own account. We never see it, and we couldn&apos;t if we wanted to.</p>
            </details>
            <details>
              <summary>Do I need to be a developer?</summary>
              <p>To fork and deploy, a little comfort with GitHub helps and the install guide walks you through every click. To use it day to day, no. And the done-for-you path needs nothing at all.</p>
            </details>
            <details>
              <summary>What does it cost to run?</summary>
              <p>Supabase and Vercel free tiers cover a small team. The Claude API is pay-as-you-go, and you control which agents run.</p>
            </details>
            <details>
              <summary>Can I customize it?</summary>
              <p>It&apos;s your fork. Change anything: pages, workflows, branding, agents. It is a standard Next.js codebase that AI coding tools handle well.</p>
            </details>
            <details>
              <summary>What do I get for $99 a month?</summary>
              <p>The community: install help, working sessions, and new workflow templates as they ship. The software itself stays free either way.</p>
            </details>
          </div>
        </div>
      </section>

      {/* ═══ 14 CLOSE ════════════════════════════════════ */}
      <section className="site-contact-blue section">
        <div className="container">
          <div className="site-contact-blue-inner">
            <div className="reveal">
              <h2 className="site-section-title u-mb-4">Stop Renting Your Company&apos;s Brain</h2>
              <p className="site-section-sub">One database. Three portals. 13 agents. Yours.</p>
            </div>
            <div className="site-contact-blue-cta site-e8a-btn-row reveal">
              <a href={DEMO_URL} className="btn btn-primary" target="_blank" rel="noopener noreferrer">See the Live Demo</a>
              <Link href="/contact/" className="btn site-e8a-btn-white">Schedule a Consultation</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
