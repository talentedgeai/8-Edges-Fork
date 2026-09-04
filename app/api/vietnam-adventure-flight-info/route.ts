import { Resend } from 'resend'
import { PALETTE } from '@/lib/design/palette'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'
import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/html'
import { isEmail } from '@/lib/validate'

function fmt(date?: string, time?: string) {
  if (!date && !time) return '—'
  return [date, time].filter(Boolean).join(' ')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.website) return NextResponse.json({ ok: true })

    const family_name  = String(body.family_name  ?? '').trim()
    const contact_email = String(body.contact_email ?? '').trim()

    if (!family_name || !contact_email) {
      return NextResponse.json({ error: 'Family name and email are required' }, { status: 400 })
    }
    if (!isEmail(contact_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'))

    const { data: family } = await supabase
      .from('trip_families')
      .select('id, contact_name')
      .ilike('family_name', family_name)
      .limit(1)
      .maybeSingle()

    const { error: insertErr } = await supabase.from('trip_flights').insert({
      family_id:         family?.id ?? null,
      contact_name:      family?.contact_name ?? family_name,
      contact_email,
      // Inbound — arriving in Hanoi
      outbound_flight:   body.inbound_flight   || null,
      outbound_arr_date: body.inbound_arr_date  || null,
      outbound_arr_time: body.inbound_arr_time  || null,
      // Outbound — departing from Vietnam
      return_flight:     body.outbound_flight   || null,
      return_dep_date:   body.outbound_dep_date || null,
      return_dep_time:   body.outbound_dep_time || null,
      notes:             body.notes             || null,
    })

    if (insertErr) {
      console.error('trip_flights insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save flight details' }, { status: 500 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      try {
        const resend = new Resend(apiKey)
        const to = (process.env.TRIP_NOTIFY_EMAIL ?? 'accounting@edge8.ai')
          .split(',').map((e: string) => e.trim()).filter(Boolean)

        await resend.emails.send({
          from: 'Edge8 Adventures <contact@edge8.ai>',
          to,
          replyTo: contact_email,
          subject: `Vietnam Adventure flight info — ${family_name}`,
          html: `
            <h2>Flight details submitted</h2>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px;margin-bottom:20px">
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid};width:160px">Family</td><td><strong>${escapeHtml(family_name)}</strong></td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:${PALETTE.greyMid}">Email</td><td><a href="mailto:${escapeHtml(contact_email)}">${escapeHtml(contact_email)}</a></td></tr>
            </table>
            <h3 style="font-family:sans-serif;font-size:13px;text-transform:uppercase;color:${PALETTE.greyMid};letter-spacing:.05em;margin-bottom:8px">Arriving in Hanoi</h3>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin-bottom:20px">
              <tr><td style="padding:4px 16px 4px 0;color:${PALETTE.greyMid};width:160px">Flight</td><td>${escapeHtml(body.inbound_flight || '—')}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:${PALETTE.greyMid}">Arrival</td><td>${fmt(body.inbound_arr_date, body.inbound_arr_time)}</td></tr>
            </table>
            <h3 style="font-family:sans-serif;font-size:13px;text-transform:uppercase;color:${PALETTE.greyMid};letter-spacing:.05em;margin-bottom:8px">Departing from Vietnam</h3>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
              <tr><td style="padding:4px 16px 4px 0;color:${PALETTE.greyMid};width:160px">Flight</td><td>${escapeHtml(body.outbound_flight || '—')}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:${PALETTE.greyMid}">Departure</td><td>${fmt(body.outbound_dep_date, body.outbound_dep_time)}</td></tr>
            </table>
            ${body.notes ? `<h3 style="font-family:sans-serif;font-size:13px;text-transform:uppercase;color:${PALETTE.greyMid};letter-spacing:.05em;margin-bottom:8px">Comments / Requests</h3><p style="font-family:sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(body.notes)}</p>` : ''}
          `,
        })
      } catch (mailErr) {
        console.error('Resend error:', mailErr)
      }
    }

    const larkUrl = process.env.LARK_WEBHOOK_URL
    if (larkUrl) {
      try {
        const text = `✈️ Flight info — ${family_name}\nArriving: ${body.inbound_flight || '—'} on ${fmt(body.inbound_arr_date, body.inbound_arr_time)}\nDeparting: ${body.outbound_flight || '—'} on ${fmt(body.outbound_dep_date, body.outbound_dep_time)}`
        await fetch(larkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg_type: 'text', content: { text } }),
        })
      } catch (larkErr) {
        console.error('Lark webhook error:', larkErr)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Flight info form error:', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
