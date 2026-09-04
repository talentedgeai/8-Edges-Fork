import type { Metadata } from 'next'
import Link from 'next/link'

const title = 'Install 8 Edges | The Full Setup Guide | Edge8'
const description =
  'The complete guide to installing the 8 Edges Operating System: fork the repo, install the Supabase database, set your keys, and deploy to Vercel.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/8-edges-app/install/' },
  openGraph: { title, description, url: '/8-edges-app/install/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

const REPO_URL = 'https://github.com/talentedgeai/8edges'

export default function InstallGuidePage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <div className="page-hero-inner">
            <span className="section-label">The Full Install Guide</span>
            <h1 className="section-title section-title--sm" style={{ fontSize: 44 }}>From Fork to Live in an Afternoon</h1>
            <p className="page-hero-sub">
              Everything you need to get your own 8 Edges Operating System running: a GitHub fork, a free Supabase
              project, one SQL script, a handful of keys, and a Vercel deploy.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="e8a-guide">
            <h2>Before you start</h2>
            <p>You need four free accounts and about an hour:</p>
            <ul>
              <li>A <strong>GitHub</strong> account, to fork the repo</li>
              <li>A <strong>Supabase</strong> account, to host your database (free tier is fine)</li>
              <li>A <strong>Vercel</strong> account, to host the app (free tier is fine)</li>
              <li>An <strong>Anthropic API key</strong>, to power the agents (pay as you go)</li>
            </ul>

            <h2>Step 1: Fork the repo</h2>
            <p>
              Open <a href={REPO_URL} target="_blank" rel="noopener noreferrer">github.com/talentedgeai/8edges</a> and
              click <strong>Fork</strong>. Your fork carries the whole app: the three portals, the workflow library,
              the agent endpoints, and the database migrations.
            </p>
            <p>If you plan to customize locally:</p>
            <pre><code>{`git clone https://github.com/YOUR-USERNAME/8edges.git
cd 8edges
npm install
cp .env.example .env.local`}</code></pre>

            <h2>Step 2: Create your Supabase project</h2>
            <ol>
              <li>Sign in at supabase.com and create a new project. Any region, any name.</li>
              <li>From <strong>Project Settings → API</strong>, copy the <strong>project URL</strong>, the <strong>publishable key</strong>, and the <strong>secret key</strong>. You will paste them in step 4.</li>
            </ol>

            <h2>Step 3: Install the database</h2>
            <ol>
              <li>In your Supabase project, open the <strong>SQL Editor</strong>.</li>
              <li>Open <code>supabase/schema.sql</code> from your fork, paste the whole file, and click <strong>Run</strong>.</li>
              <li>When it finishes, open the <strong>Table Editor</strong> and switch the schema selector to <code>company_os</code>. You should see 148 tables: people, deals, invoices, goals, coaching, and the rest. The <a href="/8-edges-app/data-atlas.html">Data Atlas</a> is the interactive map of what you just installed.</li>
            </ol>
            <div className="e8a-guide-note">
              The script is idempotent: if a run is interrupted, run it again. It creates the <code>company_os</code> schema,
              every table, the rules baked into the database (for example, a key result cannot be saved without an
              accountable human), and the roles the data assistant uses.
            </div>

            <h2>Step 4: Set your keys</h2>
            <p>Nine required values in <code>.env.local</code> (and later in Vercel). Everything else in <code>.env.example</code> is optional.</p>
            <div className="e8a-table-wrap" style={{ marginTop: 20 }}>
              <table className="e8a-table">
                <thead>
                  <tr><th>Key</th><th>Where to get it</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>SUPABASE_URL</code></td><td>Supabase → Project Settings → API → Project URL</td></tr>
                  <tr><td><code>SUPABASE_SECRET_KEY</code></td><td>Same page → secret key. Server only, never exposed to the browser</td></tr>
                  <tr><td><code>NEXT_PUBLIC_SUPABASE_URL</code></td><td>Same project URL again, for the browser auth client</td></tr>
                  <tr><td><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></td><td>Same page → publishable key</td></tr>
                  <tr><td><code>ADMIN_EMAILS</code></td><td>Comma-separated emails allowed into the admin portal. Start with yours</td></tr>
                  <tr><td><code>ANTHROPIC_API_KEY</code></td><td>console.anthropic.com → API Keys</td></tr>
                  <tr><td><code>OPENROUTER_API_KEY</code> + <code>OPENROUTER_MODEL</code></td><td>openrouter.ai → Keys, plus a model slug</td></tr>
                  <tr><td><code>CHATBOT_DB_URL</code></td><td>A Postgres connection string using the <code>chatbot_reader</code> role the install script created</td></tr>
                  <tr><td><code>CRON_SECRET</code></td><td>Any long random string. Vercel sends it as a bearer token to the cron endpoints</td></tr>
                </tbody>
              </table>
            </div>

            <h2>Step 5: Deploy to Vercel</h2>
            <ol>
              <li>In Vercel, choose <strong>Add New → Project</strong> and import your fork.</li>
              <li>Paste the same environment variables into the project settings.</li>
              <li>Deploy. First build takes a few minutes.</li>
              <li>Open your deployment URL, sign in with an email from <code>ADMIN_EMAILS</code>, and you are in your own admin portal.</li>
            </ol>

            <h2>Step 6: Turn on the agents</h2>
            <p>
              The 13 scheduled agents are defined in <code>vercel.json</code> and start running automatically once
              <code>CRON_SECRET</code> is set: the coaching cycle, onboarding, review triggers, contractor payments,
              QuickBooks sync, the digests, and the campaign sender. To disable one, delete its entry from
              <code>vercel.json</code> and redeploy.
            </p>

            <h2>Optional integrations</h2>
            <p>Each of these switches on a feature when its keys are present, and stays silently off when they are not:</p>
            <ul>
              <li><strong>Resend</strong> (<code>RESEND_API_KEY</code>): transactional and marketing email</li>
              <li><strong>Stripe</strong> (<code>STRIPE_SECRET_KEY</code>): payments and checkout</li>
              <li><strong>QuickBooks</strong> (<code>QBO_CLIENT_ID</code>, <code>QBO_CLIENT_SECRET</code>): invoice sync and P&amp;L</li>
              <li><strong>Lark</strong> (<code>LARK_APP_ID</code>, <code>LARK_APP_SECRET</code>): team messaging and webhooks</li>
              <li><strong>Telegram</strong> (<code>TELEGRAM_BOT_TOKEN</code>): notifications</li>
              <li><strong>GitHub</strong> (<code>GH_PAT</code>): repo sync features</li>
            </ul>

            <h2>Stuck?</h2>
            <p>
              The <Link href="/8-edges-app/#offer">$99 community</Link> exists exactly for this: working sessions,
              install help, and direct answers. Or <Link href="/contact/">schedule a consultation</Link> and we will
              install everything for you.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
