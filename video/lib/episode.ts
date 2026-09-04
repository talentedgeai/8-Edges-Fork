import type { Page } from "@playwright/test";
import type { Stage } from "./stage";

export type Beat = {
  /** Stable id. Names the VO file, the beat timing row, and the caption block. */
  id: string;
  /** What ElevenLabs reads. Empty means a silent beat held for `hold` seconds. */
  vo: string;
  /**
   * Hand-tuned caption lines, one array per cue, max 2 lines of ~42 chars.
   * Omit and the caption builder chunks `vo` on clause boundaries.
   */
  captions?: string[][];
  /** Seconds of held screen after the voiceover for this beat ends. */
  hold?: number;
  /** Floor for the beat, used when there is no voiceover. */
  minSeconds?: number;
  /** What the screen does while the voiceover plays. */
  action?: (page: Page, stage: Stage) => Promise<void>;
};

export type Episode = {
  /** Directory name under out/ and the value of E8_EPISODE. */
  slug: string;
  /** Episode number as the brand kit writes it ("01"), or null for one-offs. */
  number: string | null;
  arc: string;
  title: string;
  /**
   * Beat id after which the 3 second title card is cut in. The series doc is
   * explicit that episodes open on the UI mid-action, so the card sits at the
   * first beat boundary, never at 0:00. Null means no title card.
   */
  titleCardAfter: string | null;
  /**
   * standard    · "Full series in the playlist"
   * talk-to-e8  · E16 variant, the only episode that asks for the meeting
   * intro-film  · the 8 EDGES card for the standalone intro film
   */
  endCard: "standard" | "talk-to-e8" | "intro-film";
  endCardSeconds?: number;
  /** CSS selectors blurred for the whole recording. Names, faces, client data. */
  privacy?: string[];
  beats: Beat[];
};

export const TITLE_CARD_SECONDS = 3;
export const DEFAULT_END_CARD_SECONDS = 6;
