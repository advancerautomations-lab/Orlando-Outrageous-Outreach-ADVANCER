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
  research_report?: string;
  pain_points?: string;
  assigned_to?: string;
  prospect_id?: string;
  linkedin_url?: string;
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
  gmail_thread_id?: string;
  user_id?: string;
  sender_name?: string;
  sender_email?: string;
}

export interface Prospect {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country?: string;
  location?: string;
  industry?: string;
  company_name?: string;
  job_title?: string;
  seniority?: string;
  website_url?: string;
  linkedin_url?: string;
  analysed: boolean;
  research_report?: string;
  pain_points?: string;
  email_sent: boolean;
  opened: boolean;
  added_to_mailchimp: boolean;
  received_customer_research_report: boolean;
  date_opened?: string;
  date_received_report?: string;
  date_sent?: string;
  created_at: string;
  mailchimp_subscriber_hash?: string;
  current_campaign_step?: number;
  last_email_opened_at?: string;
  last_email_clicked_at?: string;
  mailchimp_status?: string;
  converted_to_lead_id?: string;
  current_email_stage?: string;
}

export interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  status?: string;
  email_subject?: string;
  email_body?: string;
  from_name?: string;
  from_email?: string;
  total_recipients?: number;
  send_schedule?: any;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  mailchimp_automation_id?: string;
}

export interface EmailToCampaign {
  id: string;
  email_campaign: string;
  name?: string;
  order?: number;
  mailchimp_id?: string;
  subject?: string;
  link_to_editor?: string;
  picture?: string;
  created_at: string;
}

export interface EmailCampaignRecipient {
  id: string;
  campaign_id: string;
  lead_id?: string;
  prospect_id?: string;
  email_to_campaign_id?: string;
  mailchimp_email_id?: string;
  current_email_step?: number;
  status?: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  first_opened_at?: string;
  clicked_at?: string;
  replied_at?: string;
  bounced_at?: string;
  unsubscribed_at?: string;
  open_count?: number;
  click_count?: number;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignStatistics {
  id: string;
  campaign_id: string;
  total_sent?: number;
  total_delivered?: number;
  total_opened?: number;
  total_clicked?: number;
  total_replied?: number;
  total_bounced?: number;
  total_unsubscribed?: number;
  unique_opens?: number;
  unique_clicks?: number;
  open_rate?: number;
  click_rate?: number;
  reply_rate?: number;
  bounce_rate?: number;
  created_at: string;
  updated_at: string;
}

export interface PendingEmail {
  id: string;
  user_id: string;
  from_email: string;
  from_name?: string;
  subject: string;
  content: string;
  gmail_message_id?: string;
  received_at: string;
  status: 'pending' | 'likely_lead' | 'needs_review' | 'auto_dismissed';
  ai_classification?: string;
  ai_confidence?: number;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: 'new_message' | 'pending_email' | 'lead_stage_change';
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  navigateTo?: string; // view to navigate to on click
  leadId?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'sales_rep';
  can_view_analytics: boolean;
  can_view_prospects: boolean;
  can_delete_leads: boolean;
  setup_complete: boolean;
  linkedin_url?: string;
}

export interface DashboardStats {
  totalLeads: number;
  totalValue: number;
  conversionRate: number;
  activeDeals: number;
}