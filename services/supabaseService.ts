import { Lead, Meeting, Activity, Message, Prospect, EmailCampaign, EmailToCampaign, EmailCampaignRecipient, EmailCampaignStatistics, PendingEmail, UserProfile } from '../types';
import { supabase, supabaseUrl } from '../lib/supabaseClient';

export const leadService = {
  getLeads: async (): Promise<Lead[]> => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      throw error;
    }

    return (data || []).map(mapDbToLead);
  },

  updateLead: async (lead: Lead): Promise<Lead> => {
    const dbLead = mapLeadToDb(lead);
    const { id, ...updates } = dbLead;

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapDbToLead(data);
  },

  createLead: async (lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead> => {
    // @ts-ignore - ID and created_at are missing but handled by DB or map
    const dbLead = mapLeadToDb({ ...lead, id: undefined, created_at: undefined });
    // Strip undefined
    const payload = Object.fromEntries(Object.entries(dbLead).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
      .from('leads')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return mapDbToLead(data);
  }
};

// Helper Mappers
export const mapDbToLead = (db: any): Lead => ({
  id: db.id,
  first_name: db.first_name,
  last_name: db.last_name,
  company: db.company || '',
  email: db.email,
  phone: db.phone,
  value: Number(db.estimated_value) || 0,
  status: (db.lead_status ? db.lead_status.charAt(0).toUpperCase() + db.lead_status.slice(1) : 'New') as any,
  source: db.lead_source || '',
  created_at: db.created_at,
  avatar_url: db.avatar_url,
  notes: db.notes || '',
  research_report: db.research_report || '',
  pain_points: db.pain_points || '',
  assigned_to: db.assigned_to || undefined,
  prospect_id: db.prospect_id || undefined,
  linkedin_url: db.linkedin_url || undefined,
});

const mapLeadToDb = (lead: any): any => ({
  id: lead.id,
  first_name: lead.first_name,
  last_name: lead.last_name,
  email: lead.email,
  phone: lead.phone,
  company: lead.company,
  estimated_value: lead.value,
  lead_status: lead.status?.toLowerCase(),
  lead_source: lead.source,
  avatar_url: lead.avatar_url,
  notes: lead.notes,
  research_report: lead.research_report,
  pain_points: lead.pain_points,
  assigned_to: lead.assigned_to || null,
  prospect_id: lead.prospect_id || null,
  linkedin_url: lead.linkedin_url || null,
});

export const meetingService = {
  getMeetings: async (): Promise<Meeting[]> => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching meetings:', error);
      return [];
    }
    return data || [];
  }
};

export const activityService = {
  getActivities: async (): Promise<Activity[]> => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  },

  addActivity: async (activity: Omit<Activity, 'id' | 'created_at'>): Promise<Activity> => {
    const { data, error } = await supabase
      .from('activities')
      .insert(activity)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

// Map database message fields to Message type
export const mapDbToMessage = (db: any): Message => ({
  id: db.id,
  lead_id: db.lead_id,
  direction: db.direction || 'outbound',
  subject: db.subject,
  content: db.content || db.body || '',  // Handle both field names
  timestamp: db.timestamp || db.sent_at || db.created_at,  // Handle all timestamp fields
  is_read: db.is_read ?? true,
  gmail_thread_id: db.gmail_thread_id || undefined,
  user_id: db.user_id || undefined,
  sender_name: db.sender_name || undefined,
  sender_email: db.sender_email || undefined,
});

export const messageService = {
  getMessages: async (): Promise<Message[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
    return (data || []).map(mapDbToMessage);
  },

  markAsRead: async (messageIds: string[]): Promise<void> => {
    if (messageIds.length === 0) return;
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .in('id', messageIds);

    if (error) console.error('Error marking messages as read:', error);
  },

  sendMessage: async (message: Omit<Message, 'id' | 'timestamp' | 'is_read'>): Promise<Message> => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        lead_id: message.lead_id,
        direction: message.direction,
        subject: message.subject,
        body: message.content,
        sent_at: new Date().toISOString(),
        is_read: true,
        gmail_thread_id: message.gmail_thread_id || null,
        user_id: message.user_id || null,
        sender_name: message.sender_name || null,
        sender_email: message.sender_email || null,
      })
      .select()
      .single();

    if (error) throw error;
    return mapDbToMessage(data);
  }
};

export const prospectService = {
  getAll: async (): Promise<Prospect[]> => {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching prospects:', error);
      throw error;
    }
    return data || [];
  },

  getById: async (id: string): Promise<Prospect> => {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  create: async (prospect: Omit<Prospect, 'id' | 'created_at'>): Promise<Prospect> => {
    const { data, error } = await supabase
      .from('prospects')
      .insert(prospect)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  update: async (id: string, updates: Partial<Prospect>): Promise<Prospect> => {
    const { data, error } = await supabase
      .from('prospects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('prospects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Map email_to_campaign columns — handles potential casing differences (e.g. "Name" vs "name")
const mapEmailToCampaign = (d: any): EmailToCampaign => ({
  id: d.id,
  email_campaign: d.email_campaign,
  name: d.name || d.Name || undefined,
  order: d.order ?? d.Order ?? undefined,
  mailchimp_id: d.mailchimp_id,
  subject: d.subject || d.Subject || undefined,
  link_to_editor: d.link_to_editor,
  picture: d.picture,
  created_at: d.created_at,
});

export const emailCampaignService = {
  getAll: async (): Promise<EmailCampaign[]> => {
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
    return data || [];
  },

  getById: async (id: string): Promise<EmailCampaign> => {
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  getEmails: async (campaignId: string): Promise<EmailToCampaign[]> => {
    const { data, error } = await supabase
      .from('email_to_campaign')
      .select('*')
      .eq('email_campaign', campaignId)
      .order('order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      // Fallback if 'order' column doesn't exist — sort by created_at only
      console.warn('Error fetching campaign emails (trying fallback):', error.message);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('email_to_campaign')
        .select('*')
        .eq('email_campaign', campaignId)
        .order('created_at', { ascending: true });
      if (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        throw fallbackError;
      }
      return (fallbackData || []).map(mapEmailToCampaign);
    }
    return (data || []).map(mapEmailToCampaign);
  },

  getRecipients: async (campaignId: string): Promise<EmailCampaignRecipient[]> => {
    const { data, error } = await supabase
      .from('email_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recipients:', error);
      throw error;
    }
    return data || [];
  },

  getStatistics: async (campaignId: string): Promise<EmailCampaignStatistics | null> => {
    const { data, error } = await supabase
      .from('email_campaign_statistics')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (error) {
      console.error('Error fetching campaign statistics:', error);
      return null;
    }
    return data;
  },

  getAllStatistics: async (): Promise<EmailCampaignStatistics[]> => {
    const { data, error } = await supabase
      .from('email_campaign_statistics')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all statistics:', error);
      return [];
    }
    return data || [];
  },

  getProspectJourney: async (prospectId: string): Promise<EmailCampaignRecipient[]> => {
    const { data, error } = await supabase
      .from('email_campaign_recipients')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('current_email_step', { ascending: true });

    if (error) {
      console.error('Error fetching prospect journey:', error);
      return [];
    }
    return data || [];
  },

  getRecipientsForEmail: async (emailToCampaignId: string): Promise<EmailCampaignRecipient[]> => {
    const { data, error } = await supabase
      .from('email_campaign_recipients')
      .select('*')
      .eq('email_to_campaign_id', emailToCampaignId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recipients for email:', error);
      return [];
    }
    return data || [];
  },

  getAllRecipients: async (): Promise<EmailCampaignRecipient[]> => {
    const { data, error } = await supabase
      .from('email_campaign_recipients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all recipients:', error);
      return [];
    }
    return data || [];
  }
};

export const pendingEmailService = {
  getAll: async (): Promise<PendingEmail[]> => {
    const { data, error } = await supabase
      .from('pending_emails')
      .select('*')
      .in('status', ['pending', 'likely_lead', 'needs_review'])
      .order('received_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending emails:', error);
      return [];
    }

    // Sort: likely_lead first, then needs_review, then pending
    const statusOrder: Record<string, number> = { likely_lead: 0, needs_review: 1, pending: 2 };
    return (data || []).sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
  },

  getAutoDismissed: async (): Promise<PendingEmail[]> => {
    const { data, error } = await supabase
      .from('pending_emails')
      .select('*')
      .eq('status', 'auto_dismissed')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching auto-dismissed emails:', error);
      return [];
    }
    return data || [];
  },

  /** Delete auto-dismissed emails older than 14 days */
  cleanupExpiredDismissed: async (): Promise<number> => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('pending_emails')
      .delete()
      .eq('status', 'auto_dismissed')
      .lt('received_at', cutoff)
      .select('id');

    if (error) {
      console.error('Error cleaning up expired dismissed emails:', error);
      return 0;
    }
    return data?.length || 0;
  },

  restore: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('pending_emails')
      .update({ status: 'needs_review' })
      .eq('id', id);

    if (error) throw error;
  },

  dismiss: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('pending_emails')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  approveAsNewLead: async (
    pendingId: string,
    pendingEmail: PendingEmail,
    leadData: { first_name: string; last_name: string; company: string },
    leadSource?: string
  ): Promise<{ lead: Lead; message: Message }> => {
    // Get current user for message user_id
    const { data: { user } } = await supabase.auth.getUser();

    // Create the lead
    const { data: newLead, error: leadError } = await supabase
      .from('leads')
      .insert({
        first_name: leadData.first_name,
        last_name: leadData.last_name,
        email: pendingEmail.from_email,
        company: leadData.company,
        estimated_value: 0,
        lead_status: 'new',
        lead_source: leadSource || 'inbound_email',
      })
      .select()
      .single();

    if (leadError) throw leadError;

    // Move the email to messages (DB columns: body, sent_at)
    const { data: newMsg, error: msgError } = await supabase.from('messages').insert({
      lead_id: newLead.id,
      user_id: user?.id,
      direction: 'inbound',
      subject: pendingEmail.subject,
      body: pendingEmail.content,
      sent_at: pendingEmail.received_at,
      is_read: false,
    }).select().single();

    if (msgError) console.error('Error inserting message:', msgError);

    // Delete from pending
    await supabase.from('pending_emails').delete().eq('id', pendingId);

    return { lead: mapDbToLead(newLead), message: newMsg ? mapDbToMessage(newMsg) : null as any };
  },

  linkToExistingLead: async (pendingId: string, leadId: string, pendingEmail: PendingEmail): Promise<Message | null> => {
    // Get current user for message user_id
    const { data: { user } } = await supabase.auth.getUser();

    // Insert as a message for the existing lead (DB columns: body, sent_at)
    const { data: newMsg, error: msgError } = await supabase.from('messages').insert({
      lead_id: leadId,
      user_id: user?.id,
      direction: 'inbound',
      subject: pendingEmail.subject,
      body: pendingEmail.content,
      sent_at: pendingEmail.received_at,
      is_read: false,
    }).select().single();

    if (msgError) throw msgError;

    // Delete from pending
    await supabase.from('pending_emails').delete().eq('id', pendingId);

    return newMsg ? mapDbToMessage(newMsg) : null;
  }
};

export const userService = {
  getCurrentUser: async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role || 'sales_rep',
      can_view_analytics: data.can_view_analytics ?? false,
      can_view_prospects: data.can_view_prospects ?? false,
      can_delete_leads: data.can_delete_leads ?? false,
      setup_complete: data.setup_complete ?? true,
      linkedin_url: data.linkedin_url || undefined,
    };
  },

  getTeamMembers: async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('Error fetching team members:', error);
      return [];
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      email: d.email,
      full_name: d.full_name,
      role: d.role || 'sales_rep',
      can_view_analytics: d.can_view_analytics ?? false,
      can_view_prospects: d.can_view_prospects ?? false,
      can_delete_leads: d.can_delete_leads ?? false,
      setup_complete: d.setup_complete ?? true,
      linkedin_url: d.linkedin_url || undefined,
    }));
  },

  updateProfile: async (
    userId: string,
    fields: { full_name?: string; linkedin_url?: string }
  ): Promise<void> => {
    const { error } = await supabase
      .from('users')
      .update(fields)
      .eq('id', userId);

    if (error) throw error;
  },

  updateUserPermissions: async (
    userId: string,
    perms: Partial<Pick<UserProfile, 'can_view_analytics' | 'can_view_prospects' | 'can_delete_leads' | 'role'>>
  ): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${supabaseUrl}/functions/v1/update-permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, permissions: perms }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update permissions');
    }
  },
};