export type Workflow = {
  slug: string
  title: string
  category: 'Talent' | 'Operations' | 'Revenue' | 'Innovation'
  excerpt: string
  date: string
  steps: number
}

export const allWorkflows: Workflow[] = [
  {
    slug: 'one-on-one-coaching',
    title: 'The Biweekly 1-1 Coaching Cycle',
    category: 'Talent',
    excerpt:
      'AI preps every 1-1, a human holds it, and AI drafts a two-tier recap that publishes only after the coach reviews it. Check-ins loop into the next prep, and monthly trends feed the coaching focus back in.',
    date: '2026-08-10',
    steps: 5,
  },
  {
    slug: 'leadership-coach-program',
    title: 'The Leadership Coach: AI Program Plan',
    category: 'Talent',
    excerpt:
      'The 5D program plan behind our coaching system: the problem, the data, the workflow design, the ROI, and the deployment, with two-tier privacy enforced in code instead of discipline.',
    date: '2026-08-10',
    steps: 5,
  },
  {
    slug: 'blog-publishing',
    title: 'How We Publish',
    category: 'Operations',
    excerpt:
      'The four-stage pipeline behind every post on this site. A human creates and approves, Claude builds and logs.',
    date: '2026-04-12',
    steps: 4,
  },
  {
    slug: 'monthly-invoicing',
    title: 'Monthly Invoicing',
    category: 'Operations',
    excerpt:
      'One billing cycle, four dates, zero chasing. Created on the 31st, dated to the 1st, due on the 20th, escalated after.',
    date: '2026-03-20',
    steps: 5,
  },
  {
    slug: 'contractor-payments',
    title: 'Contractor Hours + Payment',
    category: 'Operations',
    excerpt:
      'Every piece of contractor work moves through one loop: request, estimate, approval, delivery, and a monthly payment run.',
    date: '2026-07-16',
    steps: 7,
  },
  {
    slug: 'recruitment',
    title: 'Recruitment: Three Loops, One Pool',
    category: 'Talent',
    excerpt:
      'Not a pipeline: demand, sourcing, and selection run as continuous loops around one candidate pool that never forgets. Backward moves are normal, and every exit is a pool entry.',
    date: '2026-08-10',
    steps: 14,
  },
  {
    slug: 'new-member-onboarding',
    title: 'New Member Onboarding',
    category: 'Talent',
    excerpt:
      'A recruiter marks an applicant hired, and the new member walks themselves in: one form turns an applicant into an employee on probation with a portal account waiting.',
    date: '2026-07-20',
    steps: 7,
  },
  {
    slug: 'edge8-onboarding-cycle',
    title: 'Edge8 Onboarding Cycle',
    category: 'Talent',
    excerpt:
      'Every new hire moves through six stages on a kanban board that runs itself: the system chases the plan, sends the surveys, and flips the status. Managers make one decision, at Day 45.',
    date: '2026-07-22',
    steps: 6,
  },
  {
    slug: 'time-off',
    title: 'Time Off',
    category: 'Operations',
    excerpt:
      'Leave requests move from the team portal to an admin decision to an updated balance without a single chat message.',
    date: '2026-07-16',
    steps: 5,
  },
  {
    slug: 'event-registration',
    title: 'Event Registration',
    category: 'Revenue',
    excerpt:
      'Admin creates an event, the public signs up, Stripe takes payment, a webhook confirms the seat. No human in the middle.',
    date: '2026-07-16',
    steps: 5,
  },
  {
    slug: 'invoice-sync',
    title: 'QuickBooks Invoice Sync',
    category: 'Operations',
    excerpt:
      'A weekly sync pulls every invoice out of QuickBooks and maps it to the CRM, so revenue truth lives in one place.',
    date: '2026-07-16',
    steps: 4,
  },
  {
    slug: 'monthly-expenses',
    title: 'Monthly Expense Entry',
    category: 'Operations',
    excerpt:
      'Bank transactions become a categorized finance sheet, the sheet becomes QuickBooks entries, and the P&L confirms the month. Every expense entered, every pass-through billed.',
    date: '2026-07-18',
    steps: 8,
  },
  {
    slug: 'monthly-pnl',
    title: 'Monthly P&L',
    category: 'Operations',
    excerpt:
      'Invoices and expenses sync from QuickBooks all month, then close into a published P&L days after month end.',
    date: '2026-07-16',
    steps: 4,
  },
  {
    slug: 'surveys',
    title: 'Survey Collection',
    category: 'Operations',
    excerpt:
      'Create a survey, share one link, and watch responses land in the admin in real time. Feedback without the spreadsheet.',
    date: '2026-07-16',
    steps: 4,
  },
  {
    slug: 'ideas-backlog',
    title: 'Ideas Backlog',
    category: 'Innovation',
    excerpt:
      'Anyone on the team submits an idea through the 5D framework, AI turns it into a full product plan, and admins triage a ready backlog.',
    date: '2026-07-16',
    steps: 5,
  },
  {
    slug: 'lark-scheduler-to-crm-updates',
    title: 'Lark Scheduler to CRM Updates',
    category: 'Revenue',
    excerpt:
      'Two scheduled agents bracket every sales call: bookings become CRM leads before the call, and recorded calls become complete CRM records, drafted follow-ups, and coaching notes after it.',
    date: '2026-08-14',
    steps: 7,
  },
  {
    slug: 'certification',
    title: 'Challenge-Based Certification',
    category: 'Innovation',
    excerpt:
      'Certification earned through submitted proof of real work, challenge by challenge. Attendance proves nothing; artifacts do.',
    date: '2026-07-16',
    steps: 5,
  },
  {
    slug: 'client-work-requests',
    title: 'Client Work Requests',
    category: 'Revenue',
    excerpt:
      'Clients brief a contractor in the portal, approve the estimate, and accept the finished work. The invoice sends itself the moment they do.',
    date: '2026-07-18',
    steps: 6,
  },
  {
    slug: 'lead-capture',
    title: 'Lead Capture to CRM',
    category: 'Revenue',
    excerpt:
      'From a form submission to a customer record: a spam gate filters the noise, and every real inquiry becomes a tracked lead.',
    date: '2026-07-16',
    steps: 6,
  },
  {
    slug: 'infinite-leverage-retreats',
    title: 'Infinite Leverage Retreats',
    category: 'Operations',
    excerpt:
      'A founder ships real AI programs alongside the team in a few days. People run the room; the admin runs the money, capturing every cost live so profit is known the day the retreat ends.',
    date: '2026-07-24',
    steps: 5,
  },
  {
    slug: 'performance',
    title: 'How We Think About Speed',
    category: 'Innovation',
    excerpt:
      'When the product feels slow, we measure before we optimize and prove the win after. A human sets the target and owns the risk; AI finds the real bottleneck and adversarially verifies every fix before it ships.',
    date: '2026-07-20',
    steps: 7,
  },
]
