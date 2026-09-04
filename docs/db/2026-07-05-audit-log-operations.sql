-- Applied 2026-07-05 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migration `widen_audit_log_operation_check`.
-- Canonical schema lives in the company-os repo; this file is a local record.
--
-- Widens the audit_log operation check to cover every AuditOp value recorded
-- by the admin CRM (lib/admin/audit.ts). The original constraint only allowed
-- insert/update/delete, so archive/restore/bulk audit inserts were rejected —
-- and silently dropped, because recordAudit is best-effort by design.

alter table company_os.audit_log drop constraint if exists audit_log_operation_check;
alter table company_os.audit_log add constraint audit_log_operation_check
  check (operation = any (array[
    'insert', 'update', 'delete',
    'archive', 'restore',
    'bulk_update', 'bulk_archive', 'bulk_delete'
  ]));
