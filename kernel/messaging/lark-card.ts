// Interactive Lark cards: the builder for a commitment card, and the registry
// the inbound callback route dispatches a button tap through.
//
// Why a builder rather than card JSON written at each call site: the card is a
// contract with Lark's renderer AND with our own callback route — a button's
// `value` is the only thing that comes back when someone taps it, so the shape
// of that value has to be decided in one place or a tap arrives that nothing
// can route. The builder writes it; `parseCardValue` reads it back.
//
// Why a registry rather than a switch in the route: the kernel may not import
// an entity (boundary rule 4), so the kernel cannot name the coaching handler.
// The entity that owns a card kind registers it, the route dispatches by kind,
// and the kernel stays ignorant of what a commitment is.

/** The classic `elements` card schema, which is what `msg_type: "interactive"` carries. */
export type LarkCard = Record<string, unknown>;

/** One tappable button. `value` rides back to us on the callback verbatim. */
export type CardAction = { label: string; value: CardActionValue };

/**
 * What a button carries. `kind` selects the handler; everything else is the
 * handler's business. Lark returns the value as a string map, so every field
 * is a string.
 */
export type CardActionValue = { kind: string } & Record<string, string>;

/** One row of the card: a line of text with its buttons underneath. */
export type CardRow = { id: string; text: string; actions: CardAction[] };

export type CommitmentCardInput = {
  title: string;
  /** Context lines above the rows. At most five — more is a page, not a card. */
  lines: string[];
  rows: CardRow[];
};

export const MAX_CARD_LINES = 5;

/**
 * Build the commitment card: a header, up to five context lines, then one row
 * per commitment with its buttons. Extra lines are dropped rather than
 * throwing: a card that carries four of five lines still gets the taps, and a
 * throw here would kill the publish that sends it.
 */
export function buildCommitmentCard({ title, lines, rows }: CommitmentCardInput): LarkCard {
  const elements: Record<string, unknown>[] = [];

  for (const line of lines.slice(0, MAX_CARD_LINES)) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: line } });
  }

  for (const row of rows) {
    if (elements.length > 0) elements.push({ tag: "hr" });
    elements.push({ tag: "div", text: { tag: "lark_md", content: row.text } });
    if (row.actions.length > 0) {
      elements.push({
        tag: "action",
        actions: row.actions.map((action) => ({
          tag: "button",
          text: { tag: "plain_text", content: action.label },
          type: "default",
          value: action.value,
        })),
      });
    }
  }

  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: "plain_text", content: title } },
    elements,
  };
}

/** Who tapped, and what they tapped. The handler gets nothing else. */
export type CardActionContext = {
  teamMemberId: string;
  personId: string;
  email: string;
  value: CardActionValue;
};

/**
 * What a handler answers with. Lark shows `toast` to the tapping user; an
 * omitted toast is a silent success. `card` replaces the message in place.
 */
export type CardActionResponse = {
  toast?: { type: "info" | "success" | "error"; content: string };
  card?: LarkCard;
};

export type CardHandler = (context: CardActionContext) => Promise<CardActionResponse>;

const handlers = new Map<string, CardHandler>();

/**
 * Register the handler for one card kind. Called from an entity's module scope
 * when that entity is installed; a second registration for the same kind
 * replaces the first, so a module evaluated twice in dev is not an error.
 */
export function registerCardHandler(kind: string, handler: CardHandler): void {
  handlers.set(kind, handler);
}

export function cardHandlerFor(kind: string): CardHandler | null {
  return handlers.get(kind) ?? null;
}

/**
 * Read a button value off a callback payload. Lark hands it back as an
 * arbitrary JSON value, so nothing about it is trusted: a value without a
 * string `kind` is not ours and resolves to null.
 */
export function parseCardValue(raw: unknown): CardActionValue | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.kind !== "string" || !record.kind) return null;
  const value: CardActionValue = { kind: record.kind };
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") value[key] = entry;
  }
  return value;
}
