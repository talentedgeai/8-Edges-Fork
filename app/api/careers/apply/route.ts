import { Resend } from 'resend'
import { PALETTE } from '@/lib/design/palette'
import { supabase, companyOs } from '@/lib/supabase'
import {
  getOrCreatePerson,
  getOrCreateApplication,
  attachApplicationResume,
} from '@/lib/company-os'
import { notifyOps } from '@/lib/lark'
import { screenApplication } from '@/lib/resume-screen'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { escapeHtml } from '@/lib/html'
import { isEmail } from '@/lib/validate'

export const runtime = 'nodejs'

const FROM = 'Edge8 Careers <contact@edge8.ai>'
const DEFAULT_RECIPIENTS = ['mai@edge8.ai']
const MAX_RESUME_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 10_000

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const website = String(form.get('website') ?? '')
    if (website) return NextResponse.json({ ok: true }) // honeypot

    const job_id = String(form.get('job_id') ?? '')
    const job_title = String(form.get('job_title') ?? '')
    const job_slug = String(form.get('job_slug') ?? '')
    const full_name = String(form.get('full_name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim() || null
    const linkedin = String(form.get('linkedin') ?? '').trim() || null
    const cover_letter = String(form.get('cover_letter') ?? '').trim().slice(0, MAX_TEXT_CHARS) || null
    const resume = form.get('resume')

    if (!job_id || !full_name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    if (!(resume instanceof File) || resume.size === 0) {
      return NextResponse.json({ error: 'Resume file is required' }, { status: 400 })
    }
    if (resume.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: 'Resume is too large (max 10 MB)' }, { status: 400 })
    }

    // Per-role questions come from the requisition (source of truth), never
    // from the client — the answers snapshot pairs each configured question
    // with the submitted answer_<i> field.
    const { data: reqRow } = await companyOs
      .from('job_requisitions')
      .select('application_questions')
      .eq('id', job_id)
      .maybeSingle()
    const questions: string[] = Array.isArray(reqRow?.application_questions)
      ? (reqRow.application_questions as unknown[]).filter((q): q is string => typeof q === 'string').slice(0, 3)
      : []
    const answers = questions.map((q, i) => ({
      q,
      a: String(form.get(`answer_${i}`) ?? '').trim().slice(0, MAX_TEXT_CHARS),
    }))

    // 1) Upload resume to private storage bucket
    const filename = sanitizeFilename(resume.name || 'resume.pdf')
    const storagePath = `${job_id}/${randomUUID()}-${filename}`
    const buffer = Buffer.from(await resume.arrayBuffer())
    const { error: uploadErr } = await supabase.storage
      .from('resumes')
      .upload(storagePath, buffer, {
        contentType: resume.type || 'application/octet-stream',
        upsert: false,
      })
    if (uploadErr) {
      console.error('Resume upload error:', uploadErr)
      return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 })
    }

    // 2) company_os: person → application → resume document
    const person = await getOrCreatePerson({
      email,
      name: full_name,
      phone,
      linkedin,
      source: 'edge8.ai/careers',
    })
    if (!person.ok) {
      console.error('Person upsert error:', person.error)
      return NextResponse.json({ error: 'Failed to save applicant' }, { status: 500 })
    }

    const application = await getOrCreateApplication(person.id, job_id, {
      coverLetter: cover_letter,
      answers,
      meta: { job_slug, job_title },
    })
    if (!application.ok) {
      console.error('Application error:', application.error)
      return NextResponse.json({ error: 'Failed to link application' }, { status: 500 })
    }

    // Tag the applicant as a job seeker so recruiter tooling (applicant status
    // control, Contact 360) treats them as an applicant. Only fill an unset
    // persona — never overwrite an existing prospect/client/employee who also
    // happens to apply. Best-effort; a failure here must not fail the apply.
    await companyOs
      .from('people')
      .update({ persona: 'job_seeker' })
      .eq('id', person.id)
      .is('persona', null)

    const doc = await attachApplicationResume(application.id, {
      storagePath,
      mimeType: resume.type || null,
      byteSize: resume.size,
      personName: full_name,
    })
    if (!doc.ok) {
      console.error('Resume document error:', doc.error)
      return NextResponse.json({ error: 'Failed to save resume' }, { status: 500 })
    }

    // 3) AI resume screen runs after the response is sent; the applicant never
    // waits on it. Failures land in ai_screen_status for admin re-scan.
    waitUntil(screenApplication(application.id))

    // 4) Signed URL for recruiter convenience (7 days)
    const { data: signed } = await supabase.storage
      .from('resumes')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

    // 5) Notify recruiters via Resend (best-effort)
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    const recipients = Array.from(new Set([...DEFAULT_RECIPIENTS, ...adminEmails]))
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      try {
        const answersHtml = answers
          .filter((x) => x.a)
          .map(
            (x) =>
              `<tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid};vertical-align:top">Q: ${escapeHtml(x.q)}</td><td style="white-space:pre-wrap">${escapeHtml(x.a)}</td></tr>`,
          )
          .join('')
        const resend = new Resend(apiKey)
        await resend.emails.send({
          from: FROM,
          to: recipients,
          replyTo: email,
          subject: `New application: ${job_title || 'role'} — ${full_name}`,
          html: `
            <h2>New job application</h2>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Role</td><td><strong>${escapeHtml(job_title)}</strong> (${escapeHtml(job_slug)})</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Applicant</td><td>${escapeHtml(full_name)}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Phone</td><td>${phone ? escapeHtml(phone) : '—'}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">LinkedIn</td><td>${linkedin ? `<a href="${escapeHtml(linkedin)}">${escapeHtml(linkedin)}</a>` : '—'}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Resume</td><td>${signed?.signedUrl ? `<a href="${signed.signedUrl}">Download (7-day link)</a>` : escapeHtml(storagePath)}</td></tr>
              ${cover_letter ? `<tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid};vertical-align:top">Cover letter</td><td style="white-space:pre-wrap">${escapeHtml(cover_letter)}</td></tr>` : ''}
              ${answersHtml}
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Application ID</td><td><code>${application.id}</code></td></tr>
            </table>
          `,
        })
      } catch (mailErr) {
        console.error('Resend error:', mailErr)
      }
    }

    // Ops channel notice (every submission)
    void notifyOps(
      `🔔 New job application\n${full_name} <${email}> — ${job_title || 'role'}${phone ? ` · ${phone}` : ''}${linkedin ? `\n${linkedin}` : ''}`,
    )

    return NextResponse.json({ ok: true, application_id: application.id })
  } catch (err) {
    console.error('Apply route error:', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
