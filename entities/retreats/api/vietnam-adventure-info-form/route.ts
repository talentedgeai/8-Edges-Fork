import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/kernel/config/env'
import { notifyOps } from '@/kernel/messaging/lark'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { escapeHtml } from '@/kernel/config/html'
import { isEmail } from '@/kernel/config/validate'


const FROM = 'Edge8 Adventures <contact@edge8.ai>'
const DEFAULT_NOTIFY = 'accounting@edge8.ai'
const MAX_PASSPORT_BYTES = 10 * 1024 * 1024
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

type MemberRow = {
  full_name: string
  tshirt_size: string
  signedUrls: string[]
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    // honeypot
    if (String(form.get('website') ?? '')) return NextResponse.json({ ok: true })

    const family_name = String(form.get('family_name') ?? '').trim()
    const contact_name = String(form.get('contact_name') ?? '').trim()
    const contact_email = String(form.get('contact_email') ?? '').trim()

    if (!family_name || !contact_name || !contact_email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isEmail(contact_email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const memberCount = Number(form.get('member_count') ?? 0)
    if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > 25) {
      return NextResponse.json({ error: 'Please add at least one family member' }, { status: 400 })
    }

    // Parse and validate members before any DB writes.
    type ParsedMember = { full_name: string; tshirt_size: string; passports: File[] }
    const members: ParsedMember[] = []
    for (let i = 0; i < memberCount; i++) {
      const full_name = String(form.get(`member_name_${i}`) ?? '').trim()
      const tshirt_size = String(form.get(`member_size_${i}`) ?? '').trim()
      if (!full_name || !tshirt_size) {
        return NextResponse.json({ error: 'Each member needs a name and t-shirt size' }, { status: 400 })
      }
      if (!SIZES.includes(tshirt_size)) {
        return NextResponse.json({ error: `Invalid t-shirt size: ${tshirt_size}` }, { status: 400 })
      }
      const passports = form
        .getAll(`member_passport_${i}`)
        .filter((p): p is File => p instanceof File && p.size > 0)
      for (const p of passports) {
        if (!ALLOWED_TYPES.includes(p.type)) {
          return NextResponse.json({ error: 'Passport must be a JPG, PNG, WEBP or PDF' }, { status: 400 })
        }
        if (p.size > MAX_PASSPORT_BYTES) {
          return NextResponse.json({ error: 'Passport file is too large (max 10 MB)' }, { status: 400 })
        }
      }
      members.push({ full_name, tshirt_size, passports })
    }

    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'))

    // 1) Insert family
    const { data: family, error: familyErr } = await supabase
      .from('trip_families')
      .insert({ family_name, contact_name, contact_email })
      .select('id')
      .single()
    if (familyErr || !family) {
      console.error('Family insert error:', familyErr)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
    }

    // 2) Insert every member row in one statement. The ids are minted here so
    // the passport paths can be built without reading them back, and a family
    // of ten no longer costs ten inserts before the first upload starts.
    const memberIds = members.map(() => randomUUID())
    const { error: memberErr } = await supabase.from('trip_members').insert(
      members.map((m, i) => ({
        id: memberIds[i],
        family_id: family.id,
        full_name: m.full_name,
        tshirt_size: m.tshirt_size,
      })),
    )
    if (memberErr) {
      console.error('Member insert error:', memberErr)
      return NextResponse.json({ error: 'Failed to save a family member' }, { status: 500 })
    }

    // 3) Passports stay per file: each one is its own upload and its own row.
    const rows: MemberRow[] = []
    let totalPhotos = 0
    for (const [index, m] of members.entries()) {
      const member_id = memberIds[index]
      const signedUrls: string[] = []
      for (const file of m.passports) {
        const ext = EXT[file.type] ?? 'bin'
        const path = `${family.id}/${member_id}/${randomUUID()}.${ext}`
        const buffer = Buffer.from(await file.arrayBuffer())
        const { error: upErr } = await supabase.storage
          .from('passports')
          .upload(path, buffer, { contentType: file.type, upsert: false })
        if (upErr) {
          console.error('Passport upload error:', upErr)
          return NextResponse.json({ error: 'Failed to upload a passport photo' }, { status: 500 })
        }
        const { error: ppErr } = await supabase
          .from('trip_passports')
          .insert({ member_id, path })
        if (ppErr) {
          console.error('Passport row insert error:', ppErr)
          return NextResponse.json({ error: 'Failed to save a passport photo' }, { status: 500 })
        }
        const { data: signed } = await supabase.storage
          .from('passports')
          .createSignedUrl(path, 60 * 60 * 24 * 7)
        if (signed?.signedUrl) signedUrls.push(signed.signedUrl)
        totalPhotos++
      }
      rows.push({ full_name: m.full_name, tshirt_size: m.tshirt_size, signedUrls })
    }

    // 4) Notify accounting via Resend (best-effort)
    const notifyTo = (process.env.TRIP_NOTIFY_EMAIL ?? DEFAULT_NOTIFY)
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      try {
        const resend = new Resend(apiKey)
        const memberRowsHtml = rows
          .map((r) => {
            const photos = r.signedUrls.length
              ? r.signedUrls
                  .map((u, idx) => `<a href="${u}">photo ${idx + 1}</a>`)
                  .join(', ')
              : '—'
            return `<tr><td style="padding:4px 16px 4px 0">${escapeHtml(r.full_name)}</td><td style="padding:4px 16px 4px 0">${r.tshirt_size}</td><td>${photos}</td></tr>`
          })
          .join('')
        await resend.emails.send({
          from: FROM,
          to: notifyTo,
          replyTo: contact_email,
          subject: `Vietnam Adventure form: ${family_name} (${rows.length} traveler${rows.length === 1 ? '' : 's'})`,
          html: `
            <h2>New Vietnam Adventure submission</h2>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px;margin-bottom:16px">
              <tr><td style="padding:6px 16px 6px 0;color:#666">Family</td><td><strong>${escapeHtml(family_name)}</strong></td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Contact</td><td>${escapeHtml(contact_name)}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Email</td><td><a href="mailto:${escapeHtml(contact_email)}">${escapeHtml(contact_email)}</a></td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Passport photos</td><td>${totalPhotos}</td></tr>
            </table>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
              <tr><th align="left" style="padding:4px 16px 4px 0">Name</th><th align="left" style="padding:4px 16px 4px 0">Size</th><th align="left">Passports</th></tr>
              ${memberRowsHtml}
            </table>
            <p style="color:#999;font-size:12px;margin-top:16px">Passport links expire after 7 days. Photos are auto-deleted within 30 days of the trip.</p>
          `,
        })
      } catch (mailErr) {
        console.error('Resend error:', mailErr)
      }
    }

    // 5) Notify Lark via incoming webhook (best-effort; skipped if not configured)
    const larkUrl = process.env.LARK_WEBHOOK_URL
    if (larkUrl) {
      try {
        const text = `🌏 Vietnam Adventure form submitted\nFamily: ${family_name}\nContact: ${contact_name} <${contact_email}>\nTravelers: ${rows.length} | Passport photos: ${totalPhotos}`
        await fetch(larkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg_type: 'text', content: { text } }),
        })
      } catch (larkErr) {
        console.error('Lark webhook error:', larkErr)
      }
    }

    // Ops channel notice (every submission)
    void notifyOps(
      `🌏 New Vietnam Adventure form\nFamily: ${family_name}\nContact: ${contact_name} <${contact_email}>\nTravelers: ${rows.length} | Passport photos: ${totalPhotos}`,
    )

    return NextResponse.json({ ok: true, family_id: family.id })
  } catch (err) {
    console.error('Vietnam Adventure form error:', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
