// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row with a `when`
// key appears only for a viewer who holds that capability. The Revenue rows
// mirror the admin CRM rows, less Contacts, which is not part of Revenue.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "My Work", order: 15, items: [
    { label: "Clients", href: "/team/clients", ico: "◔", enabled: true, when: "clients" },
  ] },
  { section: null, group: "Revenue", subheading: "CRM", order: 10, items: [
    { label: "Cockpit", href: "/team/revenue", ico: "◎", enabled: true, when: "revenue" },
    { label: "Deals", href: "/team/revenue/deals", ico: "$", enabled: true, when: "revenue" },
    { label: "Leads", href: "/team/revenue/leads", ico: "◉", enabled: true, when: "revenue" },
    { label: "Inquiries", href: "/team/revenue/inquiries", ico: "☰", enabled: true, when: "revenue" },
    { label: "Companies", href: "/team/revenue/companies", ico: "▣", enabled: true, when: "revenue" },
    { label: "Clients", href: "/team/revenue/clients", ico: "★", enabled: true, when: "revenue" },
    { label: "Meeting Notes", href: "/team/revenue/meetings", ico: "☰", enabled: true, when: "revenue" },
    { label: "Sales Intelligence", href: "/team/revenue/sales-intelligence", ico: "◭", enabled: true, when: "revenue" },
  ] },
  { section: null, group: "Revenue", subheading: "Commerce", order: 40, items: [
    { label: "Affiliates", href: "/team/revenue/affiliates", ico: "%", enabled: true, when: "revenue" },
  ] },
];
