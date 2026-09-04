'use client'

import { useState } from 'react'

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
const MAX_PASSPORT_MB = 10

type Member = {
  full_name: string
  tshirt_size: string
  passports: File[]
}

const emptyMember = (): Member => ({ full_name: '', tshirt_size: '', passports: [] })

export default function TripForm() {
  const [family, setFamily] = useState({
    family_name: '',
    contact_name: '',
    contact_email: '',
    website: '', // honeypot
  })
  const [members, setMembers] = useState<Member[]>([emptyMember()])
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleFamily = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFamily({ ...family, [e.target.name]: e.target.value })

  const updateMember = (i: number, patch: Partial<Member>) =>
    setMembers(members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))

  const addMember = () => setMembers([...members, emptyMember()])
  const removeMember = (i: number) => setMembers(members.filter((_, idx) => idx !== i))

  const handlePassports = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const tooBig = files.find((f) => f.size > MAX_PASSPORT_MB * 1024 * 1024)
    if (tooBig) {
      setError(`Each passport photo must be under ${MAX_PASSPORT_MB} MB`)
      e.target.value = ''
      return
    }
    setError(null)
    updateMember(i, { passports: files })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    for (const m of members) {
      if (!m.full_name.trim() || !m.tshirt_size) {
        setError('Please give every family member a name and t-shirt size.')
        return
      }
    }
    setStatus('sending')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('family_name', family.family_name)
      fd.append('contact_name', family.contact_name)
      fd.append('contact_email', family.contact_email)
      fd.append('website', family.website)
      fd.append('member_count', String(members.length))
      members.forEach((m, i) => {
        fd.append(`member_name_${i}`, m.full_name)
        fd.append(`member_size_${i}`, m.tshirt_size)
        m.passports.forEach((file) => fd.append(`member_passport_${i}`, file))
      })

      const res = await fetch('/api/vietnam-adventure-info-form', { method: 'POST', body: fd })
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
      <div className="apply-success">
        <h2>Thank you!</h2>
        <p>
          We&apos;ve received your details for the Vietnam adventure. If you still need to send
          passport photos, just open this form again and resubmit with them attached.
        </p>
      </div>
    )
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      <p className="contact-form-eyebrow">Your family</p>

      <div className="contact-field">
        <label htmlFor="family_name">Family name *</label>
        <input
          id="family_name"
          name="family_name"
          type="text"
          required
          value={family.family_name}
          onChange={handleFamily}
        />
      </div>

      <div className="contact-field-row">
        <div className="contact-field">
          <label htmlFor="contact_name">Your name *</label>
          <input
            id="contact_name"
            name="contact_name"
            type="text"
            required
            autoComplete="name"
            value={family.contact_name}
            onChange={handleFamily}
          />
        </div>
        <div className="contact-field">
          <label htmlFor="contact_email">Email *</label>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            required
            autoComplete="email"
            value={family.contact_email}
            onChange={handleFamily}
          />
        </div>
      </div>

      <p className="contact-form-eyebrow" style={{ marginTop: 12 }}>
        Family members &amp; t-shirt sizes
      </p>

      {members.map((m, i) => (
        <div key={i} className="trip-member">
          <div className="trip-member-head">
            <span className="trip-member-label">Member {i + 1}</span>
            {members.length > 1 && (
              <button type="button" className="trip-member-remove" onClick={() => removeMember(i)}>
                Remove
              </button>
            )}
          </div>
          <div className="contact-field-row">
            <div className="contact-field">
              <label htmlFor={`name_${i}`}>Full name *</label>
              <input
                id={`name_${i}`}
                type="text"
                required
                value={m.full_name}
                onChange={(e) => updateMember(i, { full_name: e.target.value })}
              />
            </div>
            <div className="contact-field">
              <label htmlFor={`size_${i}`}>T-shirt size *</label>
              <select
                id={`size_${i}`}
                required
                value={m.tshirt_size}
                onChange={(e) => updateMember(i, { tshirt_size: e.target.value })}
              >
                <option value="" disabled>
                  Select a size
                </option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="contact-field">
            <label htmlFor={`passport_${i}`}>
              Passport photo(s) — optional, you can add more than one (max {MAX_PASSPORT_MB} MB each)
            </label>
            <input
              id={`passport_${i}`}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => handlePassports(i, e)}
            />
            {m.passports.length > 0 && (
              <div className="trip-files">
                {m.passports.map((f, fi) => (
                  <span key={fi} className="trip-file-name">
                    {f.name} ({Math.round(f.size / 1024)} KB)
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="btn trip-add" onClick={addMember}>
        + Add family member
      </button>

      <div className="trip-privacy">
        <strong>Passports — only if you haven&apos;t sent one yet</strong>
        <p>
          Most travelers have already sent their passports — if you have, you can skip this. For
          anyone who still needs to: Vietnamese regulation treats the boat as a hotel, and a
          passport (your official ID) is required to check in.
        </p>
        <strong>How we protect it</strong>
        <p>
          Photos are stored securely with restricted access, and we delete every passport image
          within 30 days of the trip ending.
        </p>
      </div>

      {/* honeypot */}
      <input
        type="text"
        name="website"
        value={family.website}
        onChange={handleFamily}
        tabIndex={-1}
        aria-hidden
        style={{ display: 'none' }}
      />

      {error && <p className="apply-error">{error}</p>}

      <button type="submit" className="btn btn-primary contact-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Submitting…' : 'Submit'}
      </button>

      <p className="contact-form-note">We&apos;ll only use these details to organize the trip.</p>
    </form>
  )
}
