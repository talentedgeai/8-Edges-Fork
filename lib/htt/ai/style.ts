/**
 * House style for AI-written copy, ported from the Human Token Tracker
 * (lib/ai/style.ts), distilled from Wikipedia's "Signs of AI writing". Two
 * layers: a prompt contract the model is told to follow, and a deterministic
 * scrub that fixes the mechanical tells no matter what the model returns.
 * (Dash characters in the scrub are written as unicode escapes to honour the
 * repo-wide "no em dash characters" rule.)
 */

/** Prompt block appended to every summary request. */
export const STYLE_CONTRACT = `Write in plain English a business owner would use. Hard rules, all of them:

- No bullet points, no numbered lists, no headings, no bold. Prose only.
- Straight quotes and apostrophes only. Never em dashes or en dashes; use a comma, a period, or the word "to".
- Plain verbs. Say "is", not "serves as", "stands as", "marks", "boasts", or "showcases".
- Banned words: delve, tapestry, landscape, pivotal, crucial, vibrant, intricate, meticulous, fostering, underscore, testament, interplay, bolstered, garner, showcase, enduring, additionally.
- No puffery and no editorializing: nothing "reflects broader trends", nothing "sets the stage", nothing leaves an "indelible mark", nothing is "deeply rooted" or "rich heritage".
- No rule of three. Do not list qualities in threes for rhythm.
- No negative parallelisms: never "not just X, but Y", never "not only... but also".
- No trailing -ing analysis: never end a sentence with "highlighting the importance of..." or "emphasizing its significance".
- No vague attributions: no "observers note", no "industry reports suggest". Say who or say nothing.
- No collaborative framing: never "we should note", "it's important to recognize", or any address to the reader.
- No summary-essay endings: do not close with an upbeat "overall" or "future prospects" sentence.
- Every sentence must carry a concrete fact from the source. If the source does not say it, do not write it.`;

/**
 * Mechanical scrub applied to model output. Belt and braces for the tells that
 * can be fixed deterministically; the semantic rules live in the prompt.
 */
export function stripAiTells(text: string): string {
  let t = text;
  // Curly quotes and apostrophes to straight.
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // Em and en dashes to a comma pause.
  t = t.replace(/\s*[\u2014\u2013]\s*/g, ", ");
  // Bullet markers at line starts (the exec summary must be prose).
  t = t.replace(/^[\s]*[-*\u2022]\s+/gm, "");
  // Markdown bold/italics markers.
  t = t.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  // Markdown headings.
  t = t.replace(/^#{1,6}\s+/gm, "");
  // Collapse whitespace artifacts left behind.
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
