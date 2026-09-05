import { Resend } from 'resend'
import { companyOs } from '@/kernel/data/supabase'
import { getOrCreatePerson } from '@/kernel/data/company-os'
import { promotePersonToLead } from '@/entities/company-os'
import { notifyOps } from '@/kernel/messaging/lark'
import { NextRequest, NextResponse } from 'next/server'
import { insertInquiries } from '@/entities/company-os';

const FROM = 'Edge8 <contact@edge8.ai>'

// ── Spam gate ──────────────────────────────────────────────────────────────
// The honeypot below catches naive bots. This catches the form-spam wave that
// fills the *visible* required fields with random tokens (e.g. "qWRgRRGYlOXe…")
// and fabricated Gmail addresses, leaving the hidden honeypot empty. Tuned for
// precision: a real submission must never be dropped, so we gate on the two
// fields a human never fabricates — a random-token *name* (company is exempt:
// legit brands like "GlaxoSmithKline" look tokenish) and a non-deliverable
// Gmail. A hit returns a silent 200 — no person/inquiry/lead/email — so the bot
// sees success and moves on.

// A random-token name: one long, unbroken ASCII-alphanumeric run (real names
// carry spaces, hyphens, apostrophes, or accents — all excluded here) whose
// casing is erratic. Real single names are Titlecase, all-lower, or ALL-CAPS;
// these bot tokens are lowercase-led with capitals ("hiOTWjN…") or carry 3+
// scattered capitals ("CFNCqyMJ…"). Casing (not vowels) is the tell, so
// consonant-heavy real names like "Krishnamurthy" and Mc/Mac surnames pass.
function isRandomToken(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (s.length < 12) return false
  if (!/^[A-Za-z0-9]+$/.test(s)) return false
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s)) return false // all-lower/ALL-CAPS pass
  const startsLower = /^[a-z]/.test(s)
  const upperCount = (s.match(/[A-Z]/g) ?? []).length
  return startsLower || upperCount >= 3
}

// Gmail ignores dots but forbids consecutive dots, so "a..b@gmail.com" is not a
// deliverable address — a reliable tell for a fabricated inbox.
function hasInvalidGmailDots(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const m = value.trim().toLowerCase().match(/^([^@]+)@(?:gmail|googlemail)\.com$/)
  return m !== null && m[1].includes('..')
}

function looksSpammy(name: unknown, email: unknown): boolean {
  return isRandomToken(name) || hasInvalidGmailDots(email)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, company, teamSize, message, website } = body

    // Honeypot
    if (website) return NextResponse.json({ ok: true })

    if (!name || !email || !company) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Silent spam gate (see helpers above): mirror the honeypot — feign success,
    // create nothing. Logged so real blocks are auditable in Vercel logs.
    if (looksSpammy(name, email)) {
      console.warn('contact spam blocked:', { name, email, company })
      return NextResponse.json({ ok: true })
    }

    // Recipients — split ADMIN_EMAILS CSV or fall back
    const to = (process.env.ADMIN_EMAILS ?? 'dave@edge8.ai')
      .split(',').map((e: string) => e.trim()).filter(Boolean)

    // 1️⃣ Save to company_os (people + inquiries). `company` has no column on
    //    people (relational model) so it rides in inquiries.metadata.
    const person = await getOrCreatePerson({ email, name, source: 'edge8.ai' })
    if (person.ok) {
      const { error: inquiryError } = await insertInquiries({
        person_id:   person.id,
        type:        'consultation',
        subject:     'AI Audit Request',
        message:     message || null,
        source:      'edge8.ai',
        source_site: 'edge8.ai',
        status:      'new_lead',
        metadata:    { company, team_size: teamSize || null, name, email },
      })
      if (inquiryError) console.error('company_os inquiry error:', inquiryError)
      // Inbound = speed-to-lead clock starts: promote into the SDR queue.
      const promoted = await promotePersonToLead(person.id, { reason: 'inbound_inquiry' })
      if (!promoted.ok) console.error('lead promotion error:', promoted.error)
    } else {
      console.error('company_os person error:', person.error)
    }

    // Ops channel notice (every submission)
    void notifyOps(
      `🔔 New AI Audit / Contact\n${name} <${email}>${company ? ` · ${company}` : ''}${teamSize ? ` · team ${teamSize}` : ''}${message ? `\n${message}` : ''}`,
    )

    // 2️⃣ Send email via Resend
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to,
      replyTo: email,
      subject: `New AI Audit Request — ${name} at ${company}`,
      html: `
        <h2>New AI Audit Request</h2>
        <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:15px">
          <tr><td style="padding:8px 16px 8px 0;color:#666;width:140px">Name</td><td style="padding:8px 0"><strong>${name}</strong></td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666">Company</td><td style="padding:8px 0">${company}</td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666">Team size</td><td style="padding:8px 0">${teamSize || '—'}</td></tr>
          <tr><td style="padding:8px 16px 8px 0;color:#666;vertical-align:top">Message</td><td style="padding:8px 0">${message ? message.replace(/\n/g, '<br>') : '—'}</td></tr>
        </table>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
