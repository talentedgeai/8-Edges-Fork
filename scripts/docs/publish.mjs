#!/usr/bin/env node
/**
 * Publish an HTML document to https://www.edge8.ai/workflows/private/e8/<slug>.
 *
 *   node scripts/docs/publish.mjs ~/code-projects/edge8-docs/my-doc.html
 *   node scripts/docs/publish.mjs my-doc.html --slug custom-slug
 *   node scripts/docs/publish.mjs my-doc.html --base https://<preview>.vercel.app
 *
 * The filename is the slug unless --slug says otherwise. Publishing the same
 * slug again overwrites it, so the link never changes.
 *
 * Needs DOCS_PUBLISH_TOKEN in the environment (or in ~/.claude/.env).
 */
import { readFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { homedir } from 'node:os'

function loadToken() {
  if (process.env.DOCS_PUBLISH_TOKEN) return process.env.DOCS_PUBLISH_TOKEN
  const envFile = resolve(homedir(), '.claude/.env')
  if (!existsSync(envFile)) return null
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DOCS_PUBLISH_TOKEN='))
  return line ? line.slice('DOCS_PUBLISH_TOKEN='.length).trim().replace(/^["']|["']$/g, '') : null
}

function slugify(name) {
  return name
    .replace(/\.html?$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : undefined
}

const file = process.argv[2]
if (!file || file.startsWith('--')) {
  console.error('Usage: node scripts/docs/publish.mjs <file.html> [--slug <slug>] [--base <url>]')
  process.exit(1)
}

const path = resolve(file.replace(/^~/, homedir()))
if (!existsSync(path)) {
  console.error(`No such file: ${path}`)
  process.exit(1)
}

const token = loadToken()
if (!token) {
  console.error('DOCS_PUBLISH_TOKEN is not set. Add it to ~/.claude/.env or the environment.')
  process.exit(1)
}

const html = readFileSync(path, 'utf8')
const slug = arg('--slug') || slugify(basename(path))
const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || slug).trim()
// This site runs with trailingSlash: true, so /api/docs/publish answers with a
// 308 to /api/docs/publish/ and the POST body is lost on the redirect. Always
// post to the slashed form.
const base = (arg('--base') || 'https://www.edge8.ai').replace(/\/+$/, '')

const res = await fetch(`${base}/api/docs/publish/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ slug, title, html }),
})

const out = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`Publish failed (${res.status}): ${out.error || 'unknown error'}`)
  process.exit(1)
}

console.log(`Published "${title}"`)
console.log(out.url)
