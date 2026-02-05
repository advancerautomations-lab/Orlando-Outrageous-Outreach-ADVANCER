export enum LeadStatus {
  NEW = 'New',
  CONTACTED = 'Contacted',
  QUALIFIED = 'Qualified',
  PROPOSAL = 'Proposal',
  WON = 'Won',
  LOST = 'Lost'
}

export interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  phone?: string;
  value: number;
  status: LeadStatus;
  source: string;
  created_at: string;
  avatar_url?: string;
  notes?: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  content: string;
  created_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  lead_id?: string;
  start_time: string;
  end_time: string;
  description?: string;
}

export interface Message {
  id: string;
  lead_id: string;
  direction: 'inbound' | 'outbound';
  subject?: string;
  content: string;
  timestamp: string;
  is_read: boolean;
}

export interface DashboardStats {
  totalLeads: number;
  totalValue: number;
  conversionRate: number;
  activeDeals: number;
}