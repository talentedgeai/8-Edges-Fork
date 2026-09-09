"use client";

// Admin database assistant: the shared assistant ChatWidget plus the two things
// that are company-os domain, not chat mechanics — the write-approval card
// (its copy names SQL, emails and portal invites) and the tool-chip labels for
// the write tools. Mounted from entities/company-os/routes/(dashboard)/layout.tsx,
// a route file, which is why this layer-2 entity may reach the layer-3
// assistant door at all.

import { ChatWidget, type ChatApprovalItem } from "@/entities/assistant/client";

const CHIP_LABELS: Record<string, string> = {
  execute_write: "Changed the database",
  send_email: "Sent the email",
  invite_portal_member: "Portal access provisioned",
};

// Approval card for a pending execute_write / send_email tool call. Nothing
// runs server-side until Approve is clicked.
function ApprovalCard({
  item,
  disabled,
  onDecide,
}: {
  item: ChatApprovalItem;
  disabled: boolean;
  onDecide: (id: string, approved: boolean) => void;
}) {
  const isEmail = item.name === "send_email";
  const isPortal = item.name === "invite_portal_member";
  const statusLabel =
    item.status === "approved" ? "Approved" : item.status === "declined" ? "Cancelled" : null;
  return (
    <div className="admin-chat-approval">
      <div className="admin-chat-approval-title">
        {isEmail
          ? "Send this email?"
          : isPortal
            ? item.input.action === "resend_link"
              ? "Send a fresh portal sign-in link?"
              : "Send this portal invite?"
            : "Run this change?"}
      </div>
      {isEmail ? (
        <div className="admin-chat-approval-email">
          <div>
            <span className="admin-chat-approval-label">To</span> {String(item.input.to ?? "")}
          </div>
          <div>
            <span className="admin-chat-approval-label">Subject</span>{" "}
            {String(item.input.subject ?? "")}
          </div>
          <pre>{String(item.input.body ?? "")}</pre>
        </div>
      ) : isPortal ? (
        <div className="admin-chat-approval-email">
          <div>{String(item.input.summary ?? "")}</div>
        </div>
      ) : (
        <pre className="admin-chat-approval-sql">{String(item.input.sql ?? "")}</pre>
      )}
      {statusLabel ? (
        <div
          className={`admin-chat-approval-status chatw-approval-status--${item.status}`}
        >
          {statusLabel}
        </div>
      ) : (
        <div className="admin-chat-approval-actions">
          <button
            type="button"
            className="admin-chat-approve"
            disabled={disabled}
            onClick={() => onDecide(item.id, true)}
          >
            {isEmail || isPortal ? "Approve & send" : "Approve & run"}
          </button>
          <button
            type="button"
            className="admin-chat-decline"
            disabled={disabled}
            onClick={() => onDecide(item.id, false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminChatWidget({ canWrite = false }: { canWrite?: boolean }) {
  return (
    <ChatWidget
      endpoint="/api/admin/chat"
      storageKey="edge8-admin-chat"
      surface="admin"
      fabLabel="Open admin assistant"
      panelLabel="Admin assistant"
      eyebrow="8 Edges"
      inputLabel="Message the admin assistant"
      placeholder="Ask about the business…"
      historyEmptyHint="No saved conversations yet. Start chatting and they'll show up here."
      toolChipLabel={(name) => CHIP_LABELS[name ?? ""] ?? "Queried the database"}
      approvals={{
        pendingPlaceholder: "Approve or cancel the pending action first…",
        render: (args) => <ApprovalCard {...args} />,
      }}
      emptyState={
        <>
          <p>Ask anything about the Company OS data:</p>
          <ul>
            <li>How many open deals do we have, and what is their total USD value?</li>
            <li>Which job requisitions are open and how many applicants each?</li>
            <li>Who is on vacation next week?</li>
            <li>Top 5 unpaid invoices by balance.</li>
          </ul>
          <p className="admin-chat-empty-note">
            {canWrite
              ? "It can also update records and send emails — every change and every email needs your approval first."
              : "Read-only. The assistant never changes data."}
          </p>
        </>
      }
    />
  );
}
