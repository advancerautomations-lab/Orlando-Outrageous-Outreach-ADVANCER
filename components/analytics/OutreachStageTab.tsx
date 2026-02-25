import React, { useState, useEffect, useMemo } from 'react';
import { EmailCampaign, EmailToCampaign, EmailCampaignRecipient, Prospect } from '../../types';
import { emailCampaignService, prospectService } from '../../services/supabaseService';
import { Mail, Send, Eye, MousePointerClick, MessageSquare, AlertTriangle, Users, ChevronRight, ChevronDown, ExternalLink, Check, Minus } from 'lucide-react';
import { SkeletonPipeline } from './SkeletonLoader';
import FunnelChart from './FunnelChart';

interface Props {
  initialCampaignId?: string;
}

const OutreachStageTab: React.FC<Props> = ({ initialCampaignId }) => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  const [campaignEmails, setCampaignEmails] = useState<EmailToCampaign[]>([]);
  const [campaignRecipients, setCampaignRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  // Load campaigns + prospects
  useEffect(() => {
    setLoading(true);
    Promise.all([
      emailCampaignService.getAll(),
      prospectService.getAll()
    ])
      .then(([camps, p]) => {
        setCampaigns(camps);
        setProspects(p);
        if (camps.length > 0 && !selectedCampaignId) {
          setSelectedCampaignId(camps[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Update selected campaign from prop
  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

  // Load emails + recipients for selected campaign
  useEffect(() => {
    if (!selectedCampaignId) return;
    Promise.all([
      emailCampaignService.getEmails(selectedCampaignId),
      emailCampaignService.getRecipients(selectedCampaignId)
    ]).then(([emails, recipients]) => {
      setCampaignEmails(emails);
      setCampaignRecipients(recipients);
    }).catch(console.error);
  }, [selectedCampaignId]);

  // Sort emails by order so Email 1 appears first
  const sortedCampaignEmails = useMemo(() => {
    return [...campaignEmails].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [campaignEmails]);

  const getRecipientStatusForEmail = (emailId: string) => {
    const matching = campaignRecipients.filter(r => r.email_to_campaign_id === emailId);
    return {
      sent: matching.filter(r => r.sent_at).length,
      delivered: matching.filter(r => r.delivered_at).length,
      opened: matching.filter(r => r.opened_at).length,
      clicked: matching.filter(r => r.clicked_at).length,
      bounced: matching.filter(r => r.bounced_at).length,
      replied: matching.filter(r => r.replied_at).length,
      total: matching.length,
      recipients: matching,
    };
  };

  // Build a map of prospect_id -> recipient row for quick lookup in expanded view
  const recipientByProspectAndEmail = useMemo(() => {
    const map = new Map<string, EmailCampaignRecipient>();
    for (const r of campaignRecipients) {
      if (r.prospect_id && r.email_to_campaign_id) {
        map.set(`${r.prospect_id}:${r.email_to_campaign_id}`, r);
      }
    }
    return map;
  }, [campaignRecipients]);

  // Get prospects whose current_email_stage matches this email
  const getProspectsCurrentlyAtEmail = (emailId: string) => {
    return prospects.filter(p => p.current_email_stage === emailId);
  };

  // Funnel data
  const funnelSteps = useMemo(() => {
    return sortedCampaignEmails.map(email => {
      const stats = getRecipientStatusForEmail(email.id);
      return {
        label: email.name || `Email ${email.order || '?'}`,
        count: stats.sent,
      };
    });
  }, [sortedCampaignEmails, campaignRecipients]);

  const MicroBar = ({ value, max, color = 'bg-[#522B47]' }: { value: number; max: number; color?: string }) => {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${color} rounded-full transition-all duration-300`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
      </div>
    );
  };

  if (loading) {
    return <SkeletonPipeline />;
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <Mail size={48} className="mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">No campaigns found</p>
      </div>
    );
  }

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Campaign Selector + Summary */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={selectedCampaignId}
          onChange={(e) => { setSelectedCampaignId(e.target.value); setExpandedEmailId(null); }}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none text-sm font-medium min-w-[300px]"
          aria-label="Select campaign"
        >
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} {c.status ? `(${c.status})` : ''}
            </option>
          ))}
        </select>
        {selectedCampaign && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`px-2.5 py-1 rounded-full font-medium ${
              selectedCampaign.status === 'active' || selectedCampaign.status === 'sending' ? 'bg-green-100 text-green-700' :
              selectedCampaign.status === 'paused' ? 'bg-orange-100 text-orange-600' :
              'bg-gray-100 text-gray-600'
            }`}>
              {selectedCampaign.status || 'unknown'}
            </span>
            {selectedCampaign.total_recipients && (
              <span>{selectedCampaign.total_recipients} recipients</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Funnel */}
        {funnelSteps.length > 0 && funnelSteps[0].count > 0 && (
          <FunnelChart steps={funnelSteps} />
        )}

        {/* Email Sequence Pipeline */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-serif font-bold text-lg mb-6">Email Sequence</h3>

          {sortedCampaignEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Mail size={40} className="mb-3 opacity-40" aria-hidden="true" />
              <p className="text-sm">No emails configured for this campaign</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedCampaignEmails.map((email, index) => {
                const stats = getRecipientStatusForEmail(email.id);
                const isEmailExpanded = expandedEmailId === email.id;

                return (
                  <div key={email.id}>
                    <div className="flex items-stretch gap-4">
                      {/* Step number with connecting line */}
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-[#522B47] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {email.order ?? index + 1}
                        </div>
                        {index < sortedCampaignEmails.length - 1 && (
                          <div className="w-0.5 flex-1 bg-gray-200 mt-2" />
                        )}
                      </div>

                      {/* Email card */}
                      <div className="flex-1 mb-2">
                        <div
                          className={`p-4 bg-white rounded-xl border border-gray-100 shadow-sm cursor-pointer transition-all duration-200 ${isEmailExpanded ? 'ring-2 ring-black/10' : 'hover:bg-gray-50/50'}`}
                          onClick={() => setExpandedEmailId(isEmailExpanded ? null : email.id)}
                          role="button"
                          aria-expanded={isEmailExpanded}
                          aria-label={`${email.name || `Email ${email.order ?? index + 1}`} — ${stats.sent} sent, ${stats.opened} opened`}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedEmailId(isEmailExpanded ? null : email.id); } }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-900 truncate">
                                  {email.name || `Email ${email.order ?? index + 1}`}
                                </h4>
                                {stats.total > 0 && (
                                  isEmailExpanded
                                    ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                                    : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                                )}
                              </div>
                              {email.subject && (
                                <p className="text-xs text-gray-500 mt-0.5">Subject: {email.subject}</p>
                              )}
                            </div>
                            {email.link_to_editor && (
                              <a
                                href={email.link_to_editor}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Open in Mailchimp editor"
                              >
                                <ExternalLink size={16} className="text-gray-400" aria-hidden="true" />
                              </a>
                            )}
                          </div>

                          {/* Micro-bars */}
                          {stats.total > 0 && (
                            <div className="mt-4 space-y-2">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                                  <Send size={11} className="text-gray-400" aria-hidden="true" />
                                  <span className="text-xs text-gray-600 font-medium">{stats.sent}</span>
                                  <span className="text-[10px] text-gray-400">sent</span>
                                </div>
                                <MicroBar value={stats.sent} max={stats.sent} />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                                  <Eye size={11} className="text-gray-400" aria-hidden="true" />
                                  <span className="text-xs text-gray-600 font-medium">{stats.opened}</span>
                                  <span className="text-[10px] text-gray-400">opened</span>
                                </div>
                                <MicroBar value={stats.opened} max={stats.sent} />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                                  <MousePointerClick size={11} className="text-gray-400" aria-hidden="true" />
                                  <span className="text-xs text-gray-600 font-medium">{stats.clicked}</span>
                                  <span className="text-[10px] text-gray-400">clicked</span>
                                </div>
                                <MicroBar value={stats.clicked} max={stats.sent} color="bg-accent-beige" />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                                  <MessageSquare size={11} className="text-gray-400" aria-hidden="true" />
                                  <span className="text-xs text-gray-600 font-medium">{stats.replied}</span>
                                  <span className="text-[10px] text-gray-400">replied</span>
                                </div>
                                <MicroBar value={stats.replied} max={stats.sent} color="bg-green-500" />
                              </div>
                              {stats.bounced > 0 && (
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                                    <AlertTriangle size={11} className="text-red-400" aria-hidden="true" />
                                    <span className="text-xs text-red-600 font-medium">{stats.bounced}</span>
                                    <span className="text-[10px] text-red-400">bounced</span>
                                  </div>
                                  <MicroBar value={stats.bounced} max={stats.sent} color="bg-red-400" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expanded: Prospects currently at this email step */}
                        {isEmailExpanded && (() => {
                          const currentProspects = getProspectsCurrentlyAtEmail(email.id);
                          return currentProspects.length > 0 ? (
                            <div className="mt-2 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden animate-slide-up">
                              <div className="px-4 py-2 border-b border-gray-100 bg-gray-100/50">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                  Currently at this step ({currentProspects.length})
                                </span>
                              </div>
                              <div className="max-h-64 overflow-auto">
                                <table className="w-full text-xs">
                                  <caption className="sr-only">Prospects currently at {email.name || email.subject}</caption>
                                  <thead>
                                    <tr className="border-b border-gray-100">
                                      <th scope="col" className="text-left py-2 px-3 font-semibold text-gray-500">Prospect</th>
                                      <th scope="col" className="text-center py-2 px-2 font-semibold text-gray-500">Delivered</th>
                                      <th scope="col" className="text-center py-2 px-2 font-semibold text-gray-500">Opened</th>
                                      <th scope="col" className="text-center py-2 px-2 font-semibold text-gray-500">Clicked</th>
                                      <th scope="col" className="text-center py-2 px-2 font-semibold text-gray-500">Replied</th>
                                      <th scope="col" className="text-center py-2 px-2 font-semibold text-gray-500">Bounced</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {currentProspects.map(prospect => {
                                      const r = recipientByProspectAndEmail.get(`${prospect.id}:${email.id}`);
                                      return (
                                        <tr key={prospect.id} className="border-b border-gray-50 hover:bg-white/60">
                                          <td className="py-2 px-3">
                                            <p className="font-medium text-gray-700">
                                              {prospect.first_name} {prospect.last_name}
                                            </p>
                                            {prospect.company_name && (
                                              <p className="text-[10px] text-gray-400">{prospect.company_name}</p>
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            {r?.delivered_at ? <Check size={12} className="text-green-500 mx-auto" /> : <Minus size={12} className="text-gray-300 mx-auto" />}
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            {r?.opened_at ? (
                                              <span className="text-blue-600 font-medium">{r.open_count || 1}x</span>
                                            ) : (
                                              <Minus size={12} className="text-gray-300 mx-auto" />
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            {r?.clicked_at ? (
                                              <span className="text-green-600 font-medium">{r.click_count || 1}x</span>
                                            ) : (
                                              <Minus size={12} className="text-gray-300 mx-auto" />
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            {r?.replied_at ? <Check size={12} className="text-green-500 mx-auto" /> : <Minus size={12} className="text-gray-300 mx-auto" />}
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            {r?.bounced_at ? <AlertTriangle size={12} className="text-red-500 mx-auto" /> : <Minus size={12} className="text-gray-300 mx-auto" />}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 bg-gray-50 rounded-xl border border-gray-100 p-4 animate-slide-up">
                              <p className="text-xs text-gray-400 text-center">No prospects currently at this step</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutreachStageTab;
