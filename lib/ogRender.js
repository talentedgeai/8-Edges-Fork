/**
 * Shared Open Graph card renderer — single source of truth for every page's
 * social share image. Each route's opengraph-image.tsx calls renderCard(key).
 *
 * Brand tokens mirror app/globals.css:
 *   blue #287BE8 · blue-bright #3B8CF5 · mint #6FF2C1 · dark #101014
 */
const { ImageResponse } = require('next/og')
const { readFileSync } = require('fs')
const { join } = require('path')
const React = require('react')

const h = React.createElement
const root = () => process.cwd()

const COLORS = {
  blue: '#287BE8',
  blueBright: '#3B8CF5',
  mint: '#6FF2C1',
  dark: '#101014',
  white: '#FFFFFF',
}

// key -> card definition. photo is a repo-relative path or null (typographic).
const CARDS = {
  'saigon-private': { eyebrow: 'Infinite Leverage', lines: [{ t: 'Your Path to' }, { t: 'AI ROI', accent: true }], pill: 'You + Engineer + AI = Custom Apps', photo: 'public/og/saigon-private.jpg', size: 72, alt: 'Private AI Build Retreats in Saigon · Edge8' },
  'reserve': { eyebrow: 'Reserve', lines: [{ t: 'Claim your' }, { t: 'private retreat', accent: true }], pill: 'Saigon · 3–5 days · from $7,000', photo: 'public/og/saigon-private.jpg', size: 66, alt: 'Reserve your retreat · Edge8' },

  'home': { eyebrow: 'Edge8', lines: [{ t: 'Become Tech-Forward.' }, { t: 'Achieve 8× efficiency.', accent: true }], photo: null, size: 64, alt: 'Edge8 — AI Leadership, Automation & Global Talent' },
  'about': { eyebrow: 'About Edge8', lines: [{ t: '25 years in tech.' }, { t: '30+ AI programs.', accent: true }], photo: 'public/og/about.jpg', size: 64, alt: 'About Edge8 — Dave Hajdu' },
  'ai-programs': { eyebrow: 'AI Programs', lines: [{ t: 'Ship' }, { t: '3 AI agents a quarter', accent: true }], photo: null, size: 62, alt: 'AI Programs — Edge8' },
  'caio-leadership': { eyebrow: 'Fractional CAIO', lines: [{ t: 'AI leadership without' }, { t: 'the $300K mistake', accent: true }], photo: 'public/og/caio.jpg', size: 56, alt: 'Fractional CAIO — Edge8' },
  'global-staffing': { eyebrow: 'Global Staffing', lines: [{ t: 'AI engineers in Vietnam' }, { t: '75% less than US rates', accent: true }], photo: 'public/og/global-staffing.jpg', size: 52, alt: 'Hire AI Engineers in Vietnam — Edge8' },
  'training-and-certification': { eyebrow: 'AI Officer Certification', lines: [{ t: '500+ certified' }, { t: 'across Fortune 500s', accent: true }], photo: 'public/og/training.jpg', size: 60, alt: 'AI Officer Certification — Edge8' },
  'your-first-ai-hire': { eyebrow: 'Your First AI Hire', lines: [{ t: 'Your first AI Officer for' }, { t: '$5,400, not $150K+', accent: true }], photo: null, size: 56, alt: 'Your First AI Hire — Edge8' },
  'careers': { eyebrow: 'Careers at Edge8', lines: [{ t: 'Join the' }, { t: 'AI frontier', accent: true }], photo: 'public/og/careers.jpg', size: 72, alt: 'Careers — Edge8' },
  'blog': { eyebrow: 'Insights', lines: [{ t: 'AI strategy, agents' }, { t: '& leadership', accent: true }], photo: null, size: 62, alt: 'Blog — Edge8' },
  'contact': { eyebrow: "Let's talk", lines: [{ t: 'Your first AI Program plan' }, { t: 'in 88 minutes', accent: true }], photo: null, size: 54, alt: 'Book a Conversation — Edge8' },

  'experience': { eyebrow: 'The Vietnam Experience', lines: [{ t: 'What a week in' }, { t: 'Saigon looks like', accent: true }], photo: 'public/og/experience.jpg', size: 60, alt: 'The Vietnam Experience — Edge8' },
  'arrival': { eyebrow: 'The Arrival', lines: [{ t: 'VIP from the' }, { t: 'second you land', accent: true }], photo: 'public/og/arrival.jpg', size: 62, alt: 'The Arrival — The Vietnam Experience' },
  'tve-infinite-leverage': { eyebrow: 'Infinite Leverage', lines: [{ t: 'The method behind' }, { t: 'the build', accent: true }], photo: 'public/og/infinite-leverage.jpg', size: 62, alt: 'Infinite Leverage — The Vietnam Experience' },
  'place': { eyebrow: 'The Place', lines: [{ t: 'Where you' }, { t: 'live and build', accent: true }], photo: 'public/og/place.jpg', size: 64, alt: 'The Place — The Vietnam Experience' },
  'the-week': { eyebrow: 'The Week', lines: [{ t: 'Shaped' }, { t: 'hour by hour', accent: true }], photo: 'public/og/the-week.jpg', size: 66, alt: 'The Week — The Vietnam Experience' },
  'travel-buddy': { eyebrow: 'Travel Buddy', lines: [{ t: 'Someone with you' }, { t: 'every step', accent: true }], photo: 'public/og/travel-buddy.jpg', size: 62, alt: 'Travel Buddy — The Vietnam Experience' },
  'people': { eyebrow: 'The People', lines: [{ t: 'The team' }, { t: 'beside you', accent: true }], photo: 'public/og/people.jpg', size: 66, alt: 'The People — The Vietnam Experience' },
  'dave': { eyebrow: 'Meet Dave · CAIO', lines: [{ t: 'Your host and' }, { t: 'AI leader', accent: true }], photo: 'public/og/dave.jpg', size: 60, alt: 'Dave — The Vietnam Experience' },
  'quan': { eyebrow: 'Meet Quan · Retreat Host', lines: [{ t: 'The week feels' }, { t: 'effortless', accent: true }], photo: 'public/og/quan.jpg', size: 60, alt: 'Quan — The Vietnam Experience' },
  'trac': { eyebrow: 'Meet Trac · Lead Engineer', lines: [{ t: 'He builds the AI' }, { t: 'that runs it all', accent: true }], photo: 'public/og/trac.jpg', size: 58, alt: 'Trac — The Vietnam Experience' },
}

function buildTree(card, photoSrc) {
  const isPhoto = Boolean(photoSrc)
  const contentWidth = isPhoto ? 760 : 1072

  const background = isPhoto
    ? [
        h('img', { key: 'bg', src: photoSrc, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' } }),
        h('div', { key: 'scrim', style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, background: 'linear-gradient(90deg, rgba(16,16,20,0.92) 0%, rgba(16,16,20,0.80) 42%, rgba(16,16,20,0.25) 100%)' } }),
      ]
    : [
        h('div', { key: 'base', style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, background: '#0B0B12' } }),
        h('div', { key: 'glow', style: { position: 'absolute', top: -140, right: -120, width: 720, height: 720, background: 'radial-gradient(circle, rgba(40,123,232,0.55) 0%, rgba(40,123,232,0) 70%)' } }),
        h('div', { key: 'glow2', style: { position: 'absolute', bottom: -220, left: -160, width: 640, height: 640, background: 'radial-gradient(circle, rgba(111,242,193,0.16) 0%, rgba(111,242,193,0) 70%)' } }),
      ]

  const headlineLines = card.lines.map((ln, i) =>
    h('div', { key: 'l' + i, style: { display: 'flex', color: ln.accent ? COLORS.blueBright : COLORS.white } }, ln.t),
  )

  const content = [
    h('div', { key: 'eyebrow', style: { display: 'flex', fontSize: 20, fontWeight: 500, color: COLORS.mint, marginBottom: 22 } }, card.eyebrow),
    h('div', { key: 'head', style: { display: 'flex', flexDirection: 'column', fontSize: card.size || 60, lineHeight: 1.08, fontWeight: 500, color: COLORS.white } }, headlineLines),
  ]
  if (card.pill) {
    content.push(
      h('div', { key: 'foot', style: { display: 'flex', alignItems: 'center', marginTop: 40 } }, [
        h('div', { key: 'pill', style: { display: 'flex', alignItems: 'center', background: COLORS.blue, color: COLORS.white, fontSize: 24, fontWeight: 500, padding: '14px 28px', borderRadius: 40 } }, card.pill),
      ]),
    )
  }

  return h('div', { style: { width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Manrope' } }, [
    ...background,
    h('div', { key: 'content', style: { position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 64, width: contentWidth, height: 630 } }, content),
  ])
}

async function renderCardDef(card) {
  if (!card) throw new Error('renderCardDef: missing card definition')
  // Satori (behind ImageResponse) parses neither woff2 nor variable fonts: a
  // variable TTF throws in parseFvarAxis. So OG rendering uses static TTF
  // instances while the browser gets the variable woff2 subsets. Same typeface.
  const manropeRegular = readFileSync(join(root(), 'public/fonts/manrope-og-400.ttf'))
  const manropeMedium = readFileSync(join(root(), 'public/fonts/manrope-og-500.ttf'))
  let photoSrc = null
  if (card.photo) {
    const buf = readFileSync(join(root(), card.photo))
    photoSrc = `data:image/jpeg;base64,${buf.toString('base64')}`
  }
  return new ImageResponse(buildTree(card, photoSrc), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Manrope', data: manropeMedium, weight: 500, style: 'normal' },
      { name: 'Manrope', data: manropeRegular, weight: 400, style: 'normal' },
    ],
  })
}

async function renderCard(key) {
  const card = CARDS[key]
  if (!card) throw new Error(`Unknown OG card: ${key}`)
  // Satori (behind ImageResponse) parses neither woff2 nor variable fonts: a
  // variable TTF throws in parseFvarAxis. So OG rendering uses static TTF
  // instances while the browser gets the variable woff2 subsets. Same typeface.
  const manropeRegular = readFileSync(join(root(), 'public/fonts/manrope-og-400.ttf'))
  const manropeMedium = readFileSync(join(root(), 'public/fonts/manrope-og-500.ttf'))
  let photoSrc = null
  if (card.photo) {
    const buf = readFileSync(join(root(), card.photo))
    photoSrc = `data:image/jpeg;base64,${buf.toString('base64')}`
  }
  return new ImageResponse(buildTree(card, photoSrc), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Manrope', data: manropeMedium, weight: 500, style: 'normal' },
      { name: 'Manrope', data: manropeRegular, weight: 400, style: 'normal' },
    ],
  })
}

module.exports = { CARDS, buildTree, renderCard, renderCardDef, OG_SIZE: { width: 1200, height: 630 } }
