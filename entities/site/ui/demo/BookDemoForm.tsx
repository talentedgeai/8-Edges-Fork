'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import { SUPPORT_EMAIL } from "@/kernel/config/organisation";

type Status = 'idle' | 'sending' | 'sent' | 'error'
const EMPTY = { name: '', email: '', company: '', teamSize: '', message: '', website: '' }

// Same fields, endpoint and honeypot as the site's contact page, so a demo
// booking lands in the CRM exactly like any other inquiry; the message is
// prefixed so the sales team can see where it came from.
export default function BookDemoForm() {
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState('')
  const [touched, setTouched] = useState(false)

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.company.trim() || !form.teamSize) {
      setTouched(true)
      setStatus('error')
      setErrorText('Please fill in name, work email, company and team size, or email us at')
      return
    }
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, message: `[8 Edges demo] ${form.message}`.trim() }),
      })
      if (res.ok) setStatus('sent')
      else { setStatus('error'); setErrorText('Something went wrong. Please try again or email us at') }
    } catch {
      setStatus('error')
      setErrorText('Could not reach the server. Please try again or email us at')
    }
  }

  if (status === 'sent') {
    return (
      <div className="e8d-book-sent">
        <div className="e8d-book-sent-icon" aria-hidden>✓</div>
        <h2>On it. Reply within one business day.</h2>
        <p>We&rsquo;ll set up a live walkthrough of 8 Edges on your own data, and tell you honestly if it isn&rsquo;t a fit.</p>
      </div>
    )
  }

  const invalid = (v: string) => touched && !v.trim()

  return (
    <form className="site-contact-form" onSubmit={submit} noValidate>
      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="e8d-name">Full name <span aria-hidden>*</span></label>
          <input id="e8d-name" name="name" type="text" required autoComplete="name" value={form.name} onChange={onChange} aria-invalid={invalid(form.name)} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="e8d-email">Work email <span aria-hidden>*</span></label>
          <input id="e8d-email" name="email" type="email" required autoComplete="email" value={form.email} onChange={onChange} aria-invalid={invalid(form.email)} />
        </div>
      </div>
      <div className="site-contact-field-row">
        <div className="site-contact-field">
          <label htmlFor="e8d-company">Company <span aria-hidden>*</span></label>
          <input id="e8d-company" name="company" type="text" required autoComplete="organization" value={form.company} onChange={onChange} aria-invalid={invalid(form.company)} />
        </div>
        <div className="site-contact-field">
          <label htmlFor="e8d-team">Team size <span aria-hidden>*</span></label>
          <select id="e8d-team" name="teamSize" required value={form.teamSize} onChange={onChange} aria-invalid={touched && !form.teamSize}>
            <option value="" disabled>Select one…</option>
            <option value="1 - 10">1 – 10</option>
            <option value="11 - 50">11 – 50</option>
            <option value="51 - 200">51 – 200</option>
            <option value="200+">200+</option>
          </select>
        </div>
      </div>
      <div className="site-contact-field">
        <label htmlFor="e8d-message">What would you want it to run first?</label>
        <textarea id="e8d-message" name="message" rows={3} value={form.message} onChange={onChange} />
      </div>
      {/* Honeypot */}
      <input type="text" name="website" value={form.website} onChange={onChange} tabIndex={-1} aria-hidden className="u-hidden" /* layout-ok: hidden honeypot field */ />
      {status === 'error' && (
        <p className="e8d-form-error" role="alert">{errorText} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      )}
      <button type="submit" className="btn btn-primary site-contact-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Book the Demo →'}
      </button>
      <p className="site-contact-form-note">Reply within 1 business day</p>
    </form>
  )
}
