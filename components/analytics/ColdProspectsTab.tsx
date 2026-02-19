import React, { useState, useEffect, useMemo } from 'react';
import { Prospect, EmailCampaignRecipient, EmailToCampaign } from '../../types';
import { prospectService, emailCampaignService } from '../../services/supabaseService';
import { Search, Users, ChevronRight, ChevronDown, Eye, MousePointerClick, Send } from 'lucide-react';
import { SkeletonTable } from './SkeletonLoader';
import ProspectJourneyTimeline from './ProspectJourneyTimeline';

type StatusFilter = 'all' | 'pending' | 'contacted' | 'engaged' | 'converted' | 'unsubscribed';

const ColdProspectsTab: React.FC = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedProspectId, setExpandedProspectId] = useState<string | null>(null);
  const [allRecipients, setAllRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [allCampaignEmails, setAllCampaignEmails] = useState<EmailToCampaign[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      prospectService.getAll(),
      emailCampaignService.getAllRecipients(),
      emailCampaignService.getAll().then(async (camps) => {
        const allEmails: EmailToCampaign[] = [];
        for (const c of camps) {
          const emails = await emailCampaignService.getEmails(c.id);
          allEmails.push(...emails);
        }
        return allEmails;
      })
    ])
      .then(([p, r, emails]) => {
        setProspects(p);
        setAllRecipients(r);
        setAllCampaignEmails(emails);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const prospectJourneyMap = useMemo(() => {
    const map = new Map<string, EmailCampaignRecipient[]>();
    for (const r of allRecipients) {
      if (!r.prospect_id) continue;
      const existing = map.get(r.prospect_id) || [];
      existing.push(r);
      map.set(r.prospect_id, existing);
    }
    for (const [key, rows] of map) {
      map.set(key, rows.sort((a, b) => (a.current_email_step || 0) - (b.current_email_step || 0)));
    }
    return map;
  }, [allRecipients]);

  const emailInfoMap = useMemo(() => {
    const map = new Map<string, EmailToCampaign>();
    for (const e of allCampaignEmails) {
      map.set(e.id, e);
    }
    return map;
  }, [allCampaignEmails]);

  const totalCampaignEmailCount = allCampaignEmails.length;

  const getProspectStatus = (p: Prospect): StatusFilter => {
    if (p.converted_to_lead_id) return 'converted';
    if (p.mailchimp_status === 'unsubscribed') return 'unsubscribed';
    if (p.opened) return 'engaged';
    if (p.email_sent) return 'contacted';
    return 'pending';
  };

  const filteredProspects = useMemo(() => {
    let result = prospects;

    if (statusFilter !== 'all') {
      result = result.filter(p => getProspectStatus(p) === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.company_name?.toLowerCase().includes(q) ||
        p.industry?.toLowerCase().includes(q) ||
        p.country?.toLowerCase().includes(q)
      );
    }

    // Sort: highest campaign step first (closest to end of sequence),
    // then by engagement level, then by most recent activity
    result = [...result].sort((a, b) => {
      const stepA = (a.current_email_stage ? emailInfoMap.get(a.current_email_stage)?.order : null) ?? a.current_campaign_step ?? 0;
      const stepB = (b.current_email_stage ? emailInfoMap.get(b.current_email_stage)?.order : null) ?? b.current_campaign_step ?? 0;

      // Primary: campaign step descending (furthest along first)
      if (stepB !== stepA) return stepB - stepA;

      // Secondary: engagement level (clicked > opened > sent > pending)
      const engagementScore = (p: Prospect): number => {
        if (p.converted_to_lead_id) return 5;
        if (p.last_email_clicked_at) return 4;
        if (p.last_email_opened_at) return 3;
        if (p.email_sent) return 2;
        return 0;
      };
      const engA = engagementScore(a);
      const engB = engagementScore(b);
      if (engB !== engA) return engB - engA;

      // Tertiary: most recent activity first
      const dateA = a.last_email_clicked_at || a.last_email_opened_at || a.date_sent || '';
      const dateB = b.last_email_clicked_at || b.last_email_opened_at || b.date_sent || '';
      return dateB.localeCompare(dateA);
    });

    return result;
  }, [prospects, searchQuery, statusFilter, emailInfoMap]);

  // Summary counts
  const summary = useMemo(() => {
    const total = prospects.length;
    const engaged = prospects.filter(p => p.opened).length;
    const converted = prospects.filter(p => p.converted_to_lead_id).length;
    const unsubscribed = prospects.filter(p => p.mailchimp_status === 'unsubscribed').length;
    return { total, engaged, converted, unsubscribed };
  }, [prospects]);

  const getLastActivity = (p: Prospect): { icon: React.ElementType; text: string } | null => {
    if (p.last_email_clicked_at) {
      return { icon: MousePointerClick, text: 'Clicked' };
    }
    if (p.last_email_opened_at) {
      return { icon: Eye, text: 'Opened' };
    }
    if (p.date_sent) {
      return { icon: Send, text: 'Sent' };
    }
    return null;
  };

  const StatusBadge = ({ status }: { status: StatusFilter }) => {
    const styles: Record<StatusFilter, string> = {
      converted: 'bg-green-100 text-green-700',
      unsubscribed: 'bg-red-100 text-red-600',
      engaged: 'bg-blue-100 text-blue-600',
      contacted: 'bg-gray-100 text-gray-600',
      pending: 'bg-gray-50 text-gray-400',
      all: '',
    };
    const labels: Record<StatusFilter, string> = {
      converted: 'Converted',
      unsubscribed: 'Unsubscribed',
      engaged: 'Engaged',
      contacted: 'Contacted',
      pending: 'Pending',
      all: '',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  if (loading) {
    return <SkeletonTable rows={8} cols={6} />;
  }

  return (
    <div className="h-full flex flex-col min-h-0 animate-fade-in">
      {/* Summary pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          Total: {summary.total}
        </span>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          Engaged: {summary.engaged} ({summary.total > 0 ? ((summary.engaged / summary.total) * 100).toFixed(0) : 0}%)
        </span>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
          Converted: {summary.converted}
        </span>
        {summary.unsubscribed > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
            Unsubscribed: {summary.unsubscribed}
          </span>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, company..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none text-sm"
            aria-label="Search prospects"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none text-sm font-medium"
          aria-label="Filter by status"
        >
          <option value="all">All Statuses</option>
          <option value="engaged">Engaged</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="pending">Pending</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
      </div>

      {filteredProspects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <Users size={48} className="mb-3 opacity-40" aria-hidden="true" />
          <p className="text-sm">{searchQuery || statusFilter !== 'all' ? 'No prospects match your filters' : 'No prospects found'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <caption className="sr-only">Cold prospects in outreach pipeline</caption>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
                  <th scope="col" className="w-8 py-3 px-2">
                    <span className="sr-only">Expand</span>
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Name</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Company</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Stage</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Last Activity</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProspects.map(prospect => {
                  const isExpanded = expandedProspectId === prospect.id;
                  const journey = prospectJourneyMap.get(prospect.id) || [];
                  const stageEmail = prospect.current_email_stage ? emailInfoMap.get(prospect.current_email_stage) : null;
                  const step = stageEmail?.order ?? prospect.current_campaign_step ?? 0;
                  const total = totalCampaignEmailCount || 5;
                  const lastActivity = getLastActivity(prospect);
                  const status = getProspectStatus(prospect);

                  return (
                    <React.Fragment key={prospect.id}>
                      <tr
                        className={`border-b border-gray-50 hover:bg-white/60 transition-colors cursor-pointer ${isExpanded ? 'bg-white/80' : ''}`}
                        onClick={() => setExpandedProspectId(isExpanded ? null : prospect.id)}
                        role="button"
                        aria-expanded={isExpanded}
                        aria-label={`${prospect.first_name} ${prospect.last_name} — ${status}. Click to ${isExpanded ? 'collapse' : 'expand'} journey.`}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedProspectId(isExpanded ? null : prospect.id); } }}
                      >
                        <td className="py-3 px-2 text-center">
                          {journey.length > 0 ? (
                            isExpanded
                              ? <ChevronDown size={14} className="text-gray-400 mx-auto" aria-hidden="true" />
                              : <ChevronRight size={14} className="text-gray-400 mx-auto" aria-hidden="true" />
                          ) : (
                            <span className="w-3.5 h-3.5 block mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{prospect.first_name} {prospect.last_name}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{prospect.email}</p>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{prospect.company_name || '—'}</td>
                        <td className="py-3 px-4">
                          {step > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5">
                                {Array.from({ length: total }, (_, i) => (
                                  <div
                                    key={i}
                                    className={`w-3 h-1.5 rounded-full ${i < step ? 'bg-black' : 'bg-gray-200'}`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-gray-500">Email {step} of {total}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Not started</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {lastActivity ? (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <lastActivity.icon size={12} className="flex-shrink-0" aria-hidden="true" />
                              <span>{lastActivity.text}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={status} />
                        </td>
                      </tr>
                      {/* Expanded Journey Timeline */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <ProspectJourneyTimeline
                              journey={journey}
                              emailInfoMap={emailInfoMap}
                              prospectName={`${prospect.first_name} ${prospect.last_name}`}
                              prospect={prospect}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/30 text-xs text-gray-500">
            Showing {filteredProspects.length} of {prospects.length} prospects
          </div>
        </div>
      )}
    </div>
  );
};

export default ColdProspectsTab;
