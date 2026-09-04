'use client'

import { useState } from 'react'

const DEADLINE = 'July 14, 2026'

type Form = {
  family_name: string
  contact_email: string
  inbound_flight: string
  inbound_arr_date: string
  inbound_arr_time: string
  outbound_flight: string
  outbound_dep_date: string
  outbound_dep_time: string
  notes: string
  website: string // honeypot
}

const empty: Form = {
  family_name: '', contact_email: '',
  inbound_flight: '', inbound_arr_date: '', inbound_arr_time: '',
  outbound_flight: '', outbound_dep_date: '', outbound_dep_time: '',
  notes: '',
  website: '',
}

export default function FlightForm() {
  const [form, setForm] = useState<Form>(empty)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.family_name || !form.contact_email) {
      setError('Please fill in your family name and email.')
      return
    }
    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/vietnam-adventure-flight-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')
      setStatus('sent')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="site-apply-success">
        <h2>Got it — thank you!</h2>
        <p>We&apos;ve received your flight details. We&apos;ll be in touch if we need anything else.</p>
      </div>
    )
  }

  return (
    <form className="site-contact-form" onSubmit={handleSubmit} noValidate>

      <div className="site-trip-privacy" style={{ marginBottom: 24 }}>
        <strong>Deadline: {DEADLINE}</strong>
        <p>Please submit by {DEADLINE} so we can arrange airport transfers and coordinate group arrivals.</p>
      </div>

      {/* ── Family ────────────────────────────────────── */}
      <p className="site-contact-form-eyebrow">Your family</p>
      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="family_name">Family name *</label>
          <input id="family_name" name="family_name" type="text" required
            placeholder="e.g. Pyka" value={form.family_name} onChange={set} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="contact_email">Your email *</label>
          <input id="contact_email" name="contact_email" type="email" required
            autoComplete="email" value={form.contact_email} onChange={set} />
        </div>
      </div>

      {/* ── Arriving in Hanoi ─────────────────────────── */}
      <p className="site-contact-form-eyebrow" style={{ marginTop: 16 }}>Arriving in Hanoi</p>
      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="inbound_flight">Airline &amp; Flight #</label>
          <input id="inbound_flight" name="inbound_flight" type="text"
            placeholder="e.g. VN415" value={form.inbound_flight} onChange={set} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="inbound_arr_date">Arrival date</label>
          <input id="inbound_arr_date" name="inbound_arr_date" type="date"
            value={form.inbound_arr_date} onChange={set} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="inbound_arr_time">Arrival time</label>
          <input id="inbound_arr_time" name="inbound_arr_time" type="time"
            value={form.inbound_arr_time} onChange={set} />
        </div>
      </div>

      {/* ── Departing from Vietnam ────────────────────── */}
      <p className="site-contact-form-eyebrow" style={{ marginTop: 16 }}>Departing from Vietnam</p>
      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="outbound_flight">Airline &amp; Flight #</label>
          <input id="outbound_flight" name="outbound_flight" type="text"
            placeholder="e.g. VN408" value={form.outbound_flight} onChange={set} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="outbound_dep_date">Departure date</label>
          <input id="outbound_dep_date" name="outbound_dep_date" type="date"
            value={form.outbound_dep_date} onChange={set} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="outbound_dep_time">Departure time</label>
          <input id="outbound_dep_time" name="outbound_dep_time" type="time"
            value={form.outbound_dep_time} onChange={set} />
        </div>
      </div>

      {/* ── Comments / Requests ───────────────────────── */}
      <p className="site-contact-form-eyebrow" style={{ marginTop: 16 }}>Comments or special requests</p>
      <div className="site-contact-field">
        <label htmlFor="notes">Anything you'd like us to know?</label>
        <textarea id="notes" name="notes" rows={4}
          placeholder="e.g. connecting flight, dietary needs, meeting point preference…"
          value={form.notes} onChange={set}
          style={{ resize: 'vertical' }} />
      </div>

      {/* Honeypot */}
      <input type="text" name="website" value={form.website} onChange={set}
        tabIndex={-1} aria-hidden style={{ display: 'none' }} />

      {error && <p className="site-apply-error">{error}</p>}

      <button type="submit" className="btn btn-primary site-contact-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Submitting…' : 'Submit Flight Details'}
      </button>

      <p className="site-contact-form-note">Deadline: {DEADLINE} · One submission per family</p>
    </form>
  )
}
