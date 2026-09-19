import { bannedLanguageError, brandNameError, emDashError, wordCount, wordRangeError } from "./checks";
import { appendBlogNotes, loadBlogAsset, updateBlogAsset } from "./data";
import { brandPreamble, callWriterModel } from "./model";
import { wordRangeFrom } from "./profile-rules";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 2: one editing pass over the blog with the brand's editing lens. The
// model returns the edited body and a change log; the step passes when the body
// holds the house rules and the word range and the log says what changed.

export const editOutput = z.object({
  body_md: z.string().describe("The full edited post in Markdown: paragraphs, ## and ### headings, bold, lists, links. No HTML, no FAQ section, no title heading."),
  // Not `.min(1)`: the derived schema is also the validator, so a bound here
  // would reject an empty log with a Zod message and leave the step's own
  // "returned no change log" check below unreachable. The instruction lives in
  // the description, where the model reads it, and the check below enforces it.
  change_log: z.array(z.string()).describe("One line per change made: what was cut, moved, sharpened or added, and why. Never empty; if nothing needed changing, say what was checked and why it held."),
});

export const runEdit: StepRunner = async ({ campaign, profile }) => {
  const range = wordRangeFrom(profile);
  if (!range) return { ok: false, error: "The brand profile states no blog word range. Add it under Marketing > Brands." };
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to edit." };

  const system = `${brandPreamble(profile)}

## Editing lens (apply it to every section)
${profile.editingLensMd ?? "(the brand has no editing lens; apply the voice and hard rules and cut anything that does not earn its place)"}

## Blog rules
${profile.channelsMd ?? "(not set)"}

# Task
You are the editor, not the author. Apply the editing lens to the post you are given and return the edited body plus a change log. Keep the author's argument and voice; cut filler, reorder for the argument, sharpen the opening and the close. Hold the body between ${range.min} and ${range.max} words. Put the key data points in bold (**like this**) where the reader should catch them. Do not write an FAQ, an Idea in Brief, figures or any HTML; later steps add those. Do not add facts, numbers or quotes that are not in the post or its source material.`;

  const user = `# Post title
${blog.title}

# Post body
${blog.copyMd}

# Source material (the approved idea, for facts and quotes only)
${campaign.idea ?? "(none)"}`;

  const r = await callWriterModel({ step: "edit", system, user, schema: editOutput });
  if (!r.ok) return r;
  const body = r.data.body_md?.trim() ?? "";
  const log = (r.data.change_log ?? []).map((l) => l.trim()).filter(Boolean);

  const failures = [emDashError(body), bannedLanguageError(body), brandNameError(body), wordRangeError(body, range)].filter(
    (e): e is string => Boolean(e),
  );
  if (!body) failures.push("The edit pass returned an empty body.");
  if (!log.length) failures.push("The edit pass returned no change log.");
  if (failures.length) return { ok: false, error: `Edit: ${failures.join(" ")}` };

  const saved = await updateBlogAsset(blog.id, { copy_md: body });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Edit pass", log);
  if (!noted.ok) return noted;
  return { ok: true, summary: `Edited to ${wordCount(body)} words; ${log.length} change(s) logged.` };
};
