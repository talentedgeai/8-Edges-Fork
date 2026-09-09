import { bannedLanguageError, brandNameError, emDashError, wordCount } from "../writer/checks";
import { brandPreamble, callWriterModel } from "../writer/model";
import { recentSentLetters, updateLetter } from "./data";
import type { StepRunner } from "./types";

// Step 3: the letter. First person, a greeting by first name, two short
// paragraphs about the week from the gathered data points, one line that
// ties the week to the three posts, signed. The subject is the sentence the
// letter is about and is never repeated in the body; the inbox shows it.

const MAX_WORDS = 220;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "preheader", "body_md"],
  properties: {
    subject: { type: "string", description: "At most 60 characters. A sentence, not a headline. Not a question every week." },
    preheader: { type: "string", description: "At most 110 characters. The grey line after the subject in the inbox." },
    body_md: { type: "string", description: "Markdown. Opens with 'Hi {first_name},' on its own line, then two or three short paragraphs, then a line that says what the three posts below share, then 'Dave' on its own line. Blank lines between paragraphs. About 170 words, never more than 220. No headings, no lists, no links." },
  },
} as const;

export const runWrite: StepRunner = async ({ letter, profile }) => {
  const points = letter.notes.gathered ?? [];
  const picked = letter.notes.picked ?? [];
  if (points.length === 0) return { ok: false, error: "Write: no gathered data points; run gather first." };
  if (picked.length === 0) return { ok: false, error: "Write: no picked posts; run pick first." };
  const previous = await recentSentLetters(4);

  const system = `${brandPreamble(profile)}

# Task
Write Dave's weekly letter to the people on the Arca Wellness list: founders and leaders who know him. It is a note from a person, not a newsletter. Rules that hold every week:
- Open with "Hi {first_name}," exactly, on its own line. The placeholder is filled per reader.
- Two or three short paragraphs from the data points: where he was, what happened, what it showed. Specific and true; nothing that is not in the data points.
- Then one line that says what the three posts below have in common, in his words.
- Sign off with "Dave" on its own line.
- About 170 words, never more than ${MAX_WORDS}: count them. No headings, no lists, no links, no client names.
- The subject is the one sentence the letter is about. Do not repeat it inside the body.
- Do not reuse a subject or an opening from the previous letters listed.`;
  const user = `# Data points (most recent first)
${points.map((p) => `- ${p.date}: ${p.fact} (${p.source})`).join("\n")}

# The three posts the letter introduces
${picked.map((p, i) => `${i + 1}. ${p.title}${p.pillar ? ` (${p.pillar})` : ""}`).join("\n")}

# Previous letters (do not repeat their subject or opening)
${previous.length ? previous.map((l) => `- ${l.subject}`).join("\n") : "(none yet: this is the first letter)"}`;

  const r = await callWriterModel<{ subject: string; preheader: string; body_md: string }>({ step: "letter-write", system, user, schema: SCHEMA });
  if (!r.ok) return r;
  const subject = r.data.subject?.trim() ?? "";
  const preheader = r.data.preheader?.trim() ?? "";
  const body = r.data.body_md?.trim() ?? "";

  const failures = [emDashError(`${subject}\n${preheader}\n${body}`), bannedLanguageError(body), brandNameError(`${subject}\n${body}`)].filter((e): e is string => Boolean(e));
  if (!subject) failures.push("No subject.");
  if (subject.length > 60) failures.push(`Subject is ${subject.length} characters; at most 60.`);
  if (preheader.length > 110) failures.push(`Preheader is ${preheader.length} characters; at most 110.`);
  if (!/^Hi \{first_name\},/m.test(body)) failures.push("The body does not open with 'Hi {first_name},'.");
  if (!/^Dave\s*$/m.test(body)) failures.push("The body is not signed 'Dave'.");
  if (wordCount(body) > MAX_WORDS) failures.push(`Body is ${wordCount(body)} words; at most ${MAX_WORDS}.`);
  if (subject && body.toLowerCase().includes(subject.toLowerCase().replace(/\.$/, ""))) failures.push("The body repeats the subject.");
  if (/^#|^- |\[.+\]\(/m.test(body)) failures.push("The body has a heading, a list or a link.");
  if (failures.length) return { ok: false, error: `Write: ${failures.join(" ")}` };

  const saved = await updateLetter(letter.id, { subject, preheader, body_md: body });
  if (!saved.ok) return saved;
  letter.subject = subject;
  letter.preheader = preheader;
  letter.bodyMd = body;
  return { ok: true, summary: `"${subject}", ${wordCount(body)} words.` };
};
