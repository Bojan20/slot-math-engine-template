// CORTI W206-ONBOARDING — support portal shared types.

export type View = 'kb' | 'ticket' | 'status';

export interface KbArticle {
  id: string;
  category: string;
  question: string;
  body: string;
  tags: string[];
  lastUpdated: string;
}

export type ComponentStatus = 'operational' | 'degraded' | 'outage';

export interface ApiComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  url: string;
}

export interface Incident {
  id: string;
  title: string;
  status: 'open' | 'monitoring' | 'resolved';
  openedAt: string;
  resolvedAt?: string;
  summary: string;
}

export interface KbData {
  categories: string[];
  articles: KbArticle[];
  components: ApiComponent[];
  incidents: Incident[];
}

export interface TicketDraft {
  email: string;
  subject: string;
  category: string;
  severity: 'low' | 'normal' | 'high' | 'urgent';
  body: string;
}

export interface SupportState {
  view: View;
  kb: KbData;
  search: string;
  filterCategory: string;
  expandedId: string | null;
  ticket: TicketDraft;
  submittedTickets: { id: string; subject: string; submittedAt: string }[];
}
