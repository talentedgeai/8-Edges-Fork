import { Resend } from "resend";
import { companyOs } from "@/kernel/data/supabase";

// Resend wrapper. Silently no-ops if RESEND_API_KEY is absent. Preview
// environments and local dev should never hard-fail on email send.

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || "Edge8 <notifications@edge8.ai>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Every accepted send is logged to company_os.interactions — one row per
// recipient, matched to the person by email when the address is in the CRM.
// Best-effort: a logging failure never fails (or retroactively "unfails") a
// send that already happened.
async function logSentEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const occurredAt = new Date().toISOString();
  for (const recipient of opts.to) {
    const email = recipient.trim().toLowerCase();
    try {
      const { data: person } = await companyOs
        .from("people")
        .select("id")
        .eq("email", email)
        .is("archived_at", null)
        .maybeSingle();
      const { error } = await companyOs.from("interactions").insert({
        kind: "email",
        subject: opts.subject,
        body: opts.html,
        person_id: person?.id ?? null,
        occurred_at: occurredAt,
        metadata: { source: "system", format: "html", to: email, ...(opts.meta ?? {}) },
      });
      if (error) console.error("[email] interaction log failed:", error.message);
    } catch (err) {
      console.error("[email] interaction log failed:", err);
    }
  }
}

// Returns true only when Resend accepted the send — callers that stamp
// "sent" markers (e.g. event_registrations.confirmation_sent_at) must not
// stamp on a no-op or failure, or the real send never happens.
// `logMeta` is merged into the interactions metadata (e.g. a source label).
// `from` overrides the default sender — only for verified edge8.ai addresses
// (e.g. the acting admin), so DKIM still aligns. `logBody` is stored in the
// CRM interactions log instead of `html`: used when the email carries a secret
// (e.g. a temp password) that must not be persisted.
export async function sendTransactionalEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  logMeta?: Record<string, unknown>;
  logBody?: string;
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping send to", opts.to);
    return false;
  }

  const { error } = await resend.emails.send({
    from: opts.from || emailFrom,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });

  if (error) {
    console.error("[email] send failed:", error);
    return false;
  }

  await logSentEmail({
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.logBody ?? opts.html,
    meta: opts.logMeta,
  });
  return true;
}

// Registration confirmation for any event: the attendee's ticket link is the
// payload. Returns whether the send was accepted (see sendTransactionalEmail).
export async function sendEventTicketEmail(opts: {
  to: string;
  name: string | null;
  eventTitle: string;
  dateLabel: string;
  location: string | null;
  ticketUrl: string;
}): Promise<boolean> {
  const greetingName =
    opts.name && opts.name.trim().length > 0 ? opts.name.split(" ")[0] : "there";
  const where = opts.location ? ` in ${opts.location}` : "";
  const html = `
    <p>Hi ${greetingName},</p>
    <p>You're registered for <strong>${opts.eventTitle}</strong>${where}, ${opts.dateLabel}.</p>
    <p>Your ticket is here — save the link or the QR on that page for the day:</p>
    <p style="margin:20px 0;"><a href="${opts.ticketUrl}" style="display:inline-block;background:#04102D;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">View my ticket</a></p>
    <p style="font-size:13px;color:#64748b;">Or copy this link: ${opts.ticketUrl}</p>
    <p style="margin-top:24px;">Reply to this email any time if plans change.</p>
    <p>Dave and the Edge8 team</p>
  `.trim();

  return sendTransactionalEmail({
    to: opts.to,
    subject: `You're in: ${opts.eventTitle}`,
    html,
    replyTo: "quan@edge8.ai",
  });
}

// Fraud tripwire: whenever bank details on someone's own record change, both
// the employee and HR get told, so a payroll-diversion attempt can't happen
// quietly. Values are never included — only that a change happened.
export async function sendBankChangeAlert(opts: {
  employeeName: string;
  employeeEmail: string;
}): Promise<void> {
  const hrEmail = process.env.HR_ALERT_EMAIL || "dave@edge8.ai";
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const html = `
    <p>Heads up — the bank details on ${opts.employeeName}'s Edge8 profile were just changed.</p>
    <p style="color:#64748b;font-size:13px;">${when} (Saigon time)</p>
    <p>If this wasn't expected, review it in the admin People area and confirm with ${opts.employeeName} directly before the next payroll run.</p>
    <p>8 Edges</p>
  `.trim();

  // De-duped recipient list: employee always, plus HR (unless they're the same).
  const to = Array.from(new Set([opts.employeeEmail, hrEmail].filter(Boolean)));
  await sendTransactionalEmail({
    to,
    subject: `Bank details changed — ${opts.employeeName}`,
    html,
  });
}
