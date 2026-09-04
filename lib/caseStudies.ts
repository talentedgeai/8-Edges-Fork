export interface CaseStudyMeta {
  slug: string
  title: string
  subtitle: string
  category: 'ai-programs'
  image: string
  highlights: string[]
  description: string
  summary: string
  challenge: string[]
  approach: string[]
  result: string[]
  detailImages: string[]
  beforeAfter?: boolean
  website?: string
  websiteLabel?: string
  blogLink?: string
}

export const allCaseStudies: CaseStudyMeta[] = [
  // ─── AI PROGRAMS ────────────────────────────────────────────────────
  {
    slug: 'kyungbang-ai-program',
    title: 'Kyungbang',
    subtitle: 'AI-Powered Quality Platform for Global Textile Manufacturing',
    category: 'ai-programs',
    image: '/case studies/images/case studies-ai programs-Kyungbang.jpeg',
    highlights: ['AI Program', 'Manufacturing', 'Data Systems'],
    description: 'Enterprise AI program for global manufacturing.',
    summary: "Kyungbang, a global textile manufacturer, manages one of the most complex challenges in its industry: high-volume fiber testing across suppliers and factories worldwide. Data arrived in scattered formats—PDFs, Excel sheets, raw text—forcing engineers to spend hours reconciling numbers before making decisions. Edge8 partnered with Kyungbang to build an AI-powered quality platform designed to unify that data, flag anomalies in real time, and allow engineers to query results in natural language.",
    challenge: [
      'Supplier and factory data scattered across inconsistent formats (PDF, Excel, text)',
      'Manual entry of results into spreadsheets, then printed for review',
      'No direct connectivity from testing machines to decision-makers',
      'Engineers lacked intuitive tools to quickly query or compare test outcomes',
    ],
    approach: [
      'Built an AI-driven document parsing engine to ingest QC reports from any format',
      'Developed a system for real-time anomaly detection and automated flagging',
      'Enabled natural language querying for batch, machine, and location histories',
      'Integrated the system directly into existing QC workflows across facilities',
    ],
    result: [
      'Reduced manual reconciliation time by over 50%',
      'Engineers retrieve insights instantly using everyday language instead of spreadsheets',
      'Faster, more confident production decisions across multiple facilities',
      'Established a scalable foundation for predictive blending and future AI-driven enhancements',
    ],
    detailImages: ['/case studies/ai-programs/kyungbang/kyungbang.jpeg'],
  },
  {
    slug: 'veracity-ai-program',
    title: 'Veracity',
    subtitle: 'Co-CEO AI Agent for EOS-Aligned Leadership',
    category: 'ai-programs',
    image: '/case studies/images/case studies-ai programs-Veracity.jpeg',
    highlights: ['AI Agents', 'Market Intelligence', 'Automation'],
    description: 'AI intelligence program for market research firm.',
    summary: "Veracity Consulting, an IT services firm operating on the Entrepreneurial Operating System (EOS), set out to build an intelligent Co-CEO assistant for its founder, Angela Hurt. The vision: an AI partner that could answer internal questions, route requests to the right leader, and surface structured decision support in real time. The goal is not just efficiency, but to provide data-driven clarity that balances the founder's natural people-first, intuition-driven style with structured, evidence-based insight.",
    challenge: [
      'Often when key decisions arise, the right data isn\'t available or connected',
      'Input from the team tends toward consensus, not clear recommendations',
      'Leading indicators aren\'t consistently tied to long-term revenue outcomes',
      'Important context (values, culture, performance patterns) lives in people\'s heads, not systems',
    ],
    approach: [
      'Designed a data pipeline to unify leadership profiles, EOS tools, and business metrics',
      'Trained AI agents to "think" like Veracity\'s key influencers and domain leaders',
      'Embedded cultural values and decision-making principles into the system logic',
      'Structured outputs to surface insights, route requests, and recommend next steps with clarity',
    ],
    result: [
      'Weekly leadership meetings are recorded and saved into the database, giving Angela on-demand access to review notes',
      'Prototype agents provide structured summaries that highlight key themes and action items',
      'EOS tools, leadership profiles, and financial goals are being connected into a unified data foundation',
      'Early outputs show clearer visibility into leading indicators and how they tie to long-term revenue targets',
    ],
    detailImages: ['/case studies/ai-programs/veracity/veracity.jpeg'],
    website: 'https://veracityit.com/',
    websiteLabel: 'View Website',
  },
  {
    slug: 'wink-hotels-travel-buddy',
    title: 'Wink Hotels (Travel Buddy)',
    subtitle: 'Redefining Guest Experience Through AI Travel Assistant',
    category: 'ai-programs',
    image: '/case studies/images/case studies-ai programs-Wink Hotels (Travel Buddy).jpeg',
    highlights: ['AI Concierge', 'Hospitality', 'Guest Experience'],
    description: 'Travel Buddy AI concierge for hotel group.',
    summary: 'Wink Hotels wanted to create a modern, connected guest experience beyond traditional hotel apps. Travel Buddy was born—a conversational travel assistant designed to guide, entertain, and support guests throughout their stay in Vietnam.',
    challenge: [
      'International guests struggled with language and cultural navigation',
      'Staff had limited bandwidth for personalized recommendations',
      'No digital experience to extend brand storytelling beyond the hotel walls',
    ],
    approach: [
      'Built a multilingual AI chatbot trained on local experiences and FAQs',
      'Designed a Discover Feed to surface nearby attractions, events, and deals',
      'Integrated an audio tour system that auto-detects location for hands-free city guides',
      'Enabled user-generated stories with photos, captions, and sharing tools',
    ],
    result: [
      'A mobile-first guest experience that turns hospitality into exploration',
      'Reduced pressure on front desk and concierge staff',
      'Guests report feeling more connected to Vietnam\'s culture',
      'Unique digital storytelling layer that builds brand loyalty and buzz',
    ],
    detailImages: [
      '/case studies/ai-programs/wink-hotels-travel-buddy/wink-hotels-1.jpeg',
      '/case studies/ai-programs/wink-hotels-travel-buddy/wink-hotels-2.jpeg',
      '/case studies/ai-programs/wink-hotels-travel-buddy/wink-hotels-3.jpeg',
      '/case studies/ai-programs/wink-hotels-travel-buddy/wink-hotels-4.jpeg',
      '/case studies/ai-programs/wink-hotels-travel-buddy/wink-hotels-5.jpeg',
      '/case studies/ai-programs/wink-hotels-travel-buddy/wink-hotels-6.jpeg',
    ],
    website: 'https://wink-hotels.com/en/',
    websiteLabel: 'View Website',
  },
  {
    slug: 'ontarget-abound-health',
    title: 'OnTarget (Abound Health)',
    subtitle: 'Engineering Excellence Across Platforms',
    category: 'ai-programs',
    image: '/case studies/images/case studies-ai programs-OnTarget (Abound Health).jpeg',
    highlights: ['Healthcare AI', 'Patient Engagement', 'Data'],
    description: 'AI program for health-focused enterprise.',
    summary: "OnTarget is Edge8's Vietnam-based engineering team supporting high-velocity tech companies. In this engagement, the team partnered with Abound Health to re-architect mobile pipelines, modernize infrastructure, and implement AI-assisted development practices.",
    challenge: [
      'Unstructured CI/CD pipeline for mobile releases',
      'Outdated Java infrastructure and desktop frontend',
      'Lack of security layers including MFA and API protection',
      'Low test coverage and fragmented technical documentation',
      'No tooling in place for AI-assisted development',
    ],
    approach: [
      'Owned and executed CI/CD pipelines for mobile and desktop',
      'Upgraded from JDK 8 to JDK 17, validating performance and stability',
      'Patched XSS vulnerabilities, secured forgotten password flow, and implemented MFA',
      'Scaled test coverage from 20% to 50% across integration and unit tests',
      'Redesigned user interface with a modern, intuitive layout',
      'Evaluated and implemented GitHub Copilot for AI code assistance',
      'Strengthened peer code review, onboarding docs, and domain-specific knowledge base',
    ],
    result: [
      'Faster, more secure mobile release cycles',
      'Strengthened platform security and maintainability',
      'Significant UI/UX improvements across OnTarget products',
      '30% increase in developer productivity with AI code assist',
      'Enhanced onboarding and technical documentation infrastructure',
      'A resilient engineering culture aligned with innovation and speed',
    ],
    detailImages: [
      '/case studies/ai-programs/ontarget-abound-health/ontarget-abound-health-1.jpeg',
      '/case studies/ai-programs/ontarget-abound-health/ontarget-abound-health-2.jpeg',
    ],
    website: 'https://www.aboundhealth.com',
    websiteLabel: 'View Website',
  },
  {
    slug: 'eo-apac-hubspot',
    title: 'EO APAC Region (HubSpot)',
    subtitle: 'Scaling Membership Systems Across Asia-Pacific',
    category: 'ai-programs',
    image: '/case studies/images/case studies-ai programs-EO APAC Region (HubSpot).jpeg',
    highlights: ['CRM AI', 'APAC Growth', 'HubSpot Integration'],
    description: 'AI-enhanced CRM program for EO APAC region.',
    summary: "Entrepreneurs' Organization (EO) is a global peer-to-peer network for founders and leaders. In the APAC region, membership operations were fragmented—with each chapter using its own set of disconnected tools. Edge8 partnered with EO APAC to centralize operations, streamline onboarding, and bring AI-powered visibility through HubSpot CRM and n8n automations. Starting with a pilot in EO Vietnam, this initiative laid the groundwork for scalable, data-informed growth across the region.",
    challenge: [
      'No unified CRM across EO APAC chapters',
      'Manual processes relied on Excel, Notion, and Google Sheets',
      'Delayed follow-ups for new member applications and event leads',
      'No visibility into performance or progress across chapters',
      'Onboarding and nurturing sequences were inconsistent and labor-intensive',
    ],
    approach: [
      'Deployed HubSpot Sales Hub for EO Vietnam to manage the full membership funnel',
      'Created standardized CRM pipelines for prospects, members, and alumni',
      'Integrated Wix landing pages and Notion forms with HubSpot using n8n workflows',
      'Automated outreach: welcome emails, interest-based nurturing, and internal alerts',
      'Built dashboards for tracking member journey progress and chapter KPIs',
      'Documented a replicable CRM + automation framework for other chapters',
    ],
    result: [
      'Live CRM adoption in EO Vietnam with 100% pipeline visibility',
      'Member leads now receive timely, consistent communications',
      'Admin workload significantly reduced through automation',
      'Improved transparency and data consistency across chapter leadership',
      'Foundation in place to expand to other APAC chapters with minimal friction',
    ],
    detailImages: ['/case studies/ai-programs/eo-apac-region-hubspot/eo-apac-region-hubspot.jpeg'],
    website: 'https://www.eoapac.com',
    websiteLabel: 'View Website',
  },
]

export function getCaseStudyBySlug(slug: string): CaseStudyMeta | undefined {
  return allCaseStudies.find((cs) => cs.slug === slug)
}

export function getCaseStudiesByCategory(
  category: CaseStudyMeta['category']
): CaseStudyMeta[] {
  return allCaseStudies.filter((cs) => cs.category === category)
}

export function getAllCaseStudySlugs(): string[] {
  return allCaseStudies.map((cs) => cs.slug)
}
