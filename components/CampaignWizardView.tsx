import React, { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { EmailCampaign, EmailToCampaign, Prospect } from '../types';
import { emailCampaignService, prospectService } from '../services/supabaseService';
import {
  Send, Loader2, Check, ArrowRight, ArrowLeft, GripVertical,
  Search, Sparkles, Plus, FolderOpen, ChevronDown, ChevronUp,
  Mail, Factory, Save, UserPlus, X, Filter
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PageMode = 'list' | 'wizard';
type WizardStep = 'fetch' | 'select' | 'destination' | 'order' | 'confirm';
type CampaignMode = 'new' | 'existing' | null;

interface MailchimpEmail {
  id: string;
  name: string;
  subject: string;
  isExisting?: boolean;
}

const WIZARD_STEPS: WizardStep[] = ['fetch', 'select', 'destination', 'order', 'confirm'];
const N8N_FETCH_URL = import.meta.env.VITE_N8N_FETCH_CAMPAIGNS_WEBHOOK_URL || '';

// ─── Main Component ───────────────────────────────────────────────────────────

const CampaignWizardView: React.FC = () => {
  const [pageMode, setPageMode] = useState<PageMode>('list');

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-black mb-2">Email Campaigns</h2>
          <p className="text-gray-500">Manage your outreach campaigns and add new ones.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setPageMode('list')}
          className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
            pageMode === 'list'
              ? 'bg-[#522B47] text-white shadow-lg shadow-black/20'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          My Campaigns
        </button>
        <button
          onClick={() => setPageMode('wizard')}
          className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
            pageMode === 'wizard'
              ? 'bg-[#522B47] text-white shadow-lg shadow-black/20'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          + New Campaign
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {pageMode === 'list' && (
          <CampaignListView onCreateNew={() => setPageMode('wizard')} />
        )}
        {pageMode === 'wizard' && (
          <CampaignWizard onSuccess={() => setPageMode('list')} />
        )}
      </div>
    </div>
  );
};

// ─── Add Prospects Modal ──────────────────────────────────────────────────────

const AddProspectsModal: React.FC<{
  campaign: EmailCampaign;
  onClose: () => void;
}> = ({ campaign, onClose }) => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [existingProspectIds, setExistingProspectIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      prospectService.getAll(),
      emailCampaignService.getAllRecipients(),
    ]).then(([allProspects, allRecipients]) => {
      setProspects(allProspects);
      // Mark prospects already in THIS campaign
      const alreadyIn = new Set(
        allRecipients
          .filter(r => r.campaign_id === campaign.id && r.prospect_id)
          .map(r => r.prospect_id as string)
      );
      setExistingProspectIds(alreadyIn);
    }).catch(console.error).finally(() => setLoading(false));
  }, [campaign.id]);

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) {
      if (p.industry) set.add(p.industry);
    }
    return Array.from(set).sort();
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    return prospects.filter(p => {
      if (existingProspectIds.has(p.id)) return false;
      if (industryFilter && p.industry !== industryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        if (
          !fullName.includes(q) &&
          !p.email?.toLowerCase().includes(q) &&
          !p.company_name?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [prospects, existingProspectIds, industryFilter, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredProspects.map(p => p.id)));
  };

  const clearAll = () => setSelectedIds(new Set());

  const N8N_ENROLL_URL = 'https://n8n.advancer.com.au/webhook/c85ea298-3465-4d8b-ba52-0225d6b5643e';

  const handleEnroll = async () => {
    if (selectedIds.size === 0) return;
    setEnrolling(true);
    let successCount = 0;
    let skipCount = 0;
    const enrolledProspects: { first_name: string; last_name: string; email: string; industry: string }[] = [];
    try {
      for (const prospectId of Array.from(selectedIds) as string[]) {
        const p = prospects.find(pr => pr.id === prospectId);
        if (p) {
          enrolledProspects.push({
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email,
            industry: p.industry || '',
          });
        }
        successCount++;
      }

      // Fire n8n webhook with all enrolled prospects
      if (enrolledProspects.length > 0) {
        await fetch(N8N_ENROLL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospects: enrolledProspects, campaign_name: campaign.name }),
        }).catch(err => console.error('n8n webhook failed:', err));
      }

      if (successCount > 0) {
        toast.success(`${successCount} prospect${successCount !== 1 ? 's' : ''} added to "${campaign.name}"`);
      }
      if (skipCount > 0) {
        toast(`${skipCount} already in this campaign — skipped`, { icon: 'ℹ️' });
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to enroll prospects');
    }
    setEnrolling(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-serif font-bold text-lg text-gray-900">Add Prospects</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Adding to <span className="font-semibold text-[#522B47]">{campaign.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name, email, company..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10"
            />
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={industryFilter}
              onChange={e => setIndustryFilter(e.target.value)}
              className="pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10 cursor-pointer appearance-none"
            >
              <option value="">All Industries</option>
              {industries.map(ind => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Select all / count row */}
        <div className="px-6 py-2 flex items-center justify-between border-b border-gray-50">
          <span className="text-xs text-gray-500">
            {loading ? 'Loading...' : `${filteredProspects.length} prospect${filteredProspects.length !== 1 ? 's' : ''} available`}
          </span>
          {!loading && filteredProspects.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-[#522B47]">{selectedIds.size} selected</span>
              <button onClick={selectAll} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer underline-offset-2 hover:underline">
                Select all
              </button>
              {selectedIds.size > 0 && (
                <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Prospect list */}
        <div className="flex-1 overflow-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : filteredProspects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <UserPlus size={32} className="opacity-30" />
              <p className="text-sm">
                {prospects.length === existingProspectIds.size
                  ? 'All prospects are already in this campaign'
                  : 'No prospects match your filters'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredProspects.map(prospect => {
                const selected = selectedIds.has(prospect.id);
                return (
                  <button
                    key={prospect.id}
                    onClick={() => toggleSelect(prospect.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-[#522B47] bg-[#522B47]/5 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selected ? 'bg-[#522B47] border-[#522B47]' : 'border-gray-300'
                    }`}>
                      {selected && <Check size={11} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {prospect.first_name} {prospect.last_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {prospect.email}
                        {prospect.company_name && <span className="text-gray-400"> · {prospect.company_name}</span>}
                      </p>
                    </div>
                    {prospect.industry && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0 hidden sm:block">
                        {prospect.industry}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Already enrolled count hint */}
        {existingProspectIds.size > 0 && (
          <div className="px-6 py-2 border-t border-gray-50">
            <p className="text-[11px] text-gray-400">
              {existingProspectIds.size} prospect{existingProspectIds.size !== 1 ? 's are' : ' is'} already in this campaign and hidden from the list.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleEnroll}
            disabled={selectedIds.size === 0 || enrolling}
            className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {enrolling ? (
              <><Loader2 size={14} className="animate-spin" /> Adding...</>
            ) : (
              <><UserPlus size={14} /> Add {selectedIds.size > 0 ? selectedIds.size : ''} Prospect{selectedIds.size !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Campaign List View ───────────────────────────────────────────────────────

const CampaignListView: React.FC<{ onCreateNew: () => void }> = ({ onCreateNew }) => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [emailsCache, setEmailsCache] = useState<Map<string, EmailToCampaign[]>>(new Map());
  const [loadingEmailsId, setLoadingEmailsId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Map<string, { industry: string; description: string; status: string }>>(new Map());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addProspectsCampaign, setAddProspectsCampaign] = useState<EmailCampaign | null>(null);

  useEffect(() => {
    setIsLoading(true);
    emailCampaignService.getAll()
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggleExpand = async (campaign: EmailCampaign) => {
    if (expandedId === campaign.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(campaign.id);

    // Init edit fields from DB values
    if (!editFields.has(campaign.id)) {
      setEditFields(prev => new Map(prev).set(campaign.id, {
        industry: campaign.industry || '',
        description: campaign.description || '',
        status: campaign.status || 'draft',
      }));
    }

    // Lazy load emails
    if (!emailsCache.has(campaign.id)) {
      setLoadingEmailsId(campaign.id);
      try {
        const emails = await emailCampaignService.getEmails(campaign.id);
        setEmailsCache(prev => new Map(prev).set(campaign.id, emails));
      } catch (err) {
        console.error('Failed to load emails:', err);
      }
      setLoadingEmailsId(null);
    }
  };

  const updateField = (campaignId: string, key: 'industry' | 'description' | 'status', value: string) => {
    setEditFields(prev => {
      const next = new Map<string, { industry: string; description: string; status: string }>(prev);
      const existing: { industry: string; description: string; status: string } = next.get(campaignId) || { industry: '', description: '', status: 'draft' };
      next.set(campaignId, { ...existing, [key]: value });
      return next;
    });
  };

  const handleSave = async (campaignId: string) => {
    const fields = editFields.get(campaignId);
    if (!fields) return;
    setSavingId(campaignId);
    try {
      const updated = await emailCampaignService.update(campaignId, {
        industry: fields.industry || undefined,
        description: fields.description || undefined,
        status: fields.status || undefined,
      });
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
      toast.success('Campaign updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
    setSavingId(null);
  };

  const getStatusBadge = (status?: string) => {
    const s = status || 'draft';
    const label = s === 'live' ? 'Live' : s === 'draft' ? 'Draft' : s === 'paused' ? 'Paused' : s === 'cancelled' ? 'Cancelled' : s === 'active' || s === 'sending' ? 'Live' : s;
    const classes =
      s === 'live' || s === 'active' || s === 'sending' ? 'bg-green-100 text-green-700' :
      s === 'draft' ? 'bg-yellow-100 text-yellow-700' :
      s === 'paused' ? 'bg-orange-100 text-orange-600' :
      s === 'cancelled' ? 'bg-red-100 text-red-600' :
      'bg-gray-100 text-gray-500';
    return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>{label}</span>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-3">
        <Mail size={36} className="opacity-40" />
        <p className="text-sm">No campaigns yet.</p>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1.5 text-sm text-[#522B47] font-medium hover:underline cursor-pointer"
        >
          <Plus size={14} /> Create your first campaign
        </button>
      </div>
    );
  }

  return (
    <>
    {addProspectsCampaign && (
      <AddProspectsModal
        campaign={addProspectsCampaign}
        onClose={() => setAddProspectsCampaign(null)}
      />
    )}
    <div className="h-full overflow-auto space-y-3 pr-1">
      {campaigns.map(campaign => {
        const isExpanded = expandedId === campaign.id;
        const emails = emailsCache.get(campaign.id) || [];
        const fields = editFields.get(campaign.id) || { industry: campaign.industry || '', description: campaign.description || '', status: campaign.status || 'draft' };
        const isSaving = savingId === campaign.id;
        const isLoadingEmails = loadingEmailsId === campaign.id;

        return (
          <div key={campaign.id} className="glass-card rounded-2xl overflow-hidden">
            {/* Campaign row (always visible) */}
            <button
              onClick={() => handleToggleExpand(campaign)}
              className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-white/40 transition-colors cursor-pointer"
            >
              {/* Left: name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-serif font-bold text-gray-900">{campaign.name}</p>
                  {getStatusBadge(campaign.status)}
                  {campaign.industry && (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#522B47]/10 text-[#522B47]">
                      <Factory size={10} /> {campaign.industry}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Created {new Date(campaign.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {campaign.description && <span className="ml-2 text-gray-400">· {campaign.description.substring(0, 60)}{campaign.description.length > 60 ? '...' : ''}</span>}
                </p>
              </div>

              {/* Right: email count + chevron */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {emailsCache.has(campaign.id) && (
                  <span className="text-xs text-gray-400">{emails.length} email{emails.length !== 1 ? 's' : ''}</span>
                )}
                {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </button>

            {/* Expanded panel */}
            {isExpanded && (
              <div className="px-6 pb-6 pt-2 border-t border-gray-100 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  {/* Status */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
                    <select
                      value={fields.status}
                      onChange={(e) => updateField(campaign.id, 'status', e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/60 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10 transition-all cursor-pointer"
                    >
                      <option value="draft">Draft</option>
                      <option value="live">Live</option>
                      <option value="paused">Paused</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  {/* Industry */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Industry</label>
                    <input
                      type="text"
                      value={fields.industry}
                      onChange={(e) => updateField(campaign.id, 'industry', e.target.value)}
                      placeholder="e.g. Accounting, Real Estate"
                      className="w-full px-3.5 py-2.5 bg-white/60 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10 transition-all"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Description</label>
                    <textarea
                      rows={2}
                      value={fields.description}
                      onChange={(e) => updateField(campaign.id, 'description', e.target.value)}
                      placeholder="What is this campaign targeting?"
                      className="w-full px-3.5 py-2.5 bg-white/60 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10 transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Save + Add Prospects buttons */}
                <div className="flex items-center justify-between mb-5">
                  <button
                    onClick={() => setAddProspectsCampaign(campaign)}
                    className="flex items-center gap-1.5 bg-white dark:bg-[#522B47] border border-[#522B47] dark:border-[#7A4D6D] text-[#522B47] dark:text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#522B47]/5 dark:hover:bg-[#6B3D5E] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <UserPlus size={14} />
                    Add Prospects
                  </button>
                  <button
                    onClick={() => handleSave(campaign.id)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 bg-[#522B47] text-white px-4 py-2 rounded-xl text-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                </div>

                {/* Email Sequence */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Email Sequence</p>
                  {isLoadingEmails ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                      <Loader2 size={14} className="animate-spin" /> Loading emails...
                    </div>
                  ) : emails.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No emails added to this campaign yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {emails.map((email, idx) => (
                        <div key={email.id} className="flex items-center gap-3 p-3 bg-white/70 rounded-xl border border-gray-100">
                          <div className="w-6 h-6 bg-[#522B47] text-white rounded-md flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold">{email.order ?? idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{email.name || '—'}</p>
                            <p className="text-xs text-gray-500 truncate">{email.subject || '—'}</p>
                          </div>
                          {email.mailchimp_id && (
                            <span className="text-[10px] text-gray-400 font-mono flex-shrink-0 hidden sm:block">
                              {email.mailchimp_id.substring(0, 10)}...
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
};

// ─── Campaign Wizard ──────────────────────────────────────────────────────────

const CampaignWizard: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('fetch');
  const [fetchedEmails, setFetchedEmails] = useState<MailchimpEmail[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orderedEmails, setOrderedEmails] = useState<MailchimpEmail[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [sinceDate, setSinceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Destination step
  const [campaignMode, setCampaignMode] = useState<CampaignMode>(null);
  const [existingCampaigns, setExistingCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [existingEmails, setExistingEmails] = useState<EmailToCampaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);

  // Drag
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const stepIndex = WIZARD_STEPS.indexOf(currentStep);

  useEffect(() => {
    if (currentStep === 'destination' && existingCampaigns.length === 0) {
      setIsLoadingCampaigns(true);
      emailCampaignService.getAll().then(setExistingCampaigns).catch(console.error).finally(() => setIsLoadingCampaigns(false));
    }
  }, [currentStep]);

  useEffect(() => {
    if (selectedCampaignId) {
      emailCampaignService.getEmails(selectedCampaignId).then(setExistingEmails).catch(console.error);
    } else {
      setExistingEmails([]);
    }
  }, [selectedCampaignId]);

  // --- Fetch ---
  const handleFetch = async () => {
    if (!N8N_FETCH_URL) {
      toast.error('N8N webhook URL not configured. Set VITE_N8N_FETCH_CAMPAIGNS_WEBHOOK_URL in your .env file.');
      return;
    }
    setIsFetching(true);
    try {
      const res = await fetch(N8N_FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: sinceDate }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
      const data = await res.json();

      const extractEmails = (obj: any): MailchimpEmail[] => {
        if (!obj) return [];
        if (Array.isArray(obj)) return obj.flatMap(item => extractEmails(item));
        if (obj.json && typeof obj.json === 'object') return extractEmails(obj.json);
        for (const key of ['campaigns', 'data', 'emails', 'items']) {
          if (Array.isArray(obj[key])) return obj[key].flatMap((item: any) => extractEmails(item));
          if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) return extractEmails(obj[key]);
        }
        const id = obj.id || obj.campaign_id || obj.web_id;
        if (id) {
          return [{
            id: String(id),
            name: String(obj.name || obj.settings?.title || obj.title || ''),
            subject: String(obj.subject || obj.settings?.subject_line || obj.subject_line || ''),
          }];
        }
        return [];
      };

      const emails = extractEmails(data);
      if (emails.length === 0) {
        toast('No new emails found since that date.', { icon: '📭' });
      } else {
        setFetchedEmails(emails);
        setSelectedIds(new Set());
        setCurrentStep('select');
        toast.success(`Found ${emails.length} email${emails.length > 1 ? 's' : ''}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch emails from Mailchimp');
    }
    setIsFetching(false);
  };

  // --- Select ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  // --- Destination ---
  const handleChooseNew = () => {
    setCampaignMode('new');
    setOrderedEmails(fetchedEmails.filter(e => selectedIds.has(e.id)));
    setCurrentStep('order');
  };

  const handleChooseExisting = () => setCampaignMode('existing');

  const handleSelectExistingCampaign = () => {
    if (!selectedCampaignId) return;
    const campaign = existingCampaigns.find(c => c.id === selectedCampaignId);
    if (campaign) setCampaignName(campaign.name);
    const existingAsMailchimp: MailchimpEmail[] = existingEmails.map(e => ({
      id: e.mailchimp_id || e.id, name: e.name || '', subject: e.subject || '', isExisting: true,
    }));
    setOrderedEmails([...existingAsMailchimp, ...fetchedEmails.filter(e => selectedIds.has(e.id))]);
    setCurrentStep('order');
  };

  // --- Drag & Drop ---
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx: number) => {
    const from = dragIdx.current;
    if (from === null || from === idx) { setDragOverIdx(null); return; }
    setOrderedEmails(prev => { const next = [...prev]; const [m] = next.splice(from, 1); next.splice(idx, 0, m); return next; });
    dragIdx.current = null; setDragOverIdx(null);
  };
  const handleDragEnd = () => { dragIdx.current = null; setDragOverIdx(null); };

  // --- Save ---
  const handleSave = async () => {
    if (campaignMode === 'new' && !campaignName.trim()) { toast.error('Please enter a campaign name'); return; }
    setIsSaving(true);
    let createdCampaignId: string | null = null;
    try {
      if (campaignMode === 'new') {
        const campaign = await emailCampaignService.create({ name: campaignName.trim(), status: 'draft' });
        createdCampaignId = campaign.id;
        const rows = orderedEmails.map((email, idx) => {
          const row: Record<string, any> = { email_campaign: campaign.id, subject: email.subject, mailchimp_id: email.id, Order: idx + 1 };
          if (email.name) row['Name'] = email.name;
          return row;
        });
        await emailCampaignService.createEmails(rows);
      } else {
        const newEmails = orderedEmails.filter(e => !e.isExisting);
        if (newEmails.length > 0) {
          const rows = newEmails.map((email) => {
            const orderIdx = orderedEmails.findIndex(e => e.id === email.id);
            const row: Record<string, any> = { email_campaign: selectedCampaignId, subject: email.subject, mailchimp_id: email.id, Order: orderIdx + 1 };
            if (email.name) row['Name'] = email.name;
            return row;
          });
          await emailCampaignService.createEmails(rows);
        }
        for (const email of orderedEmails.filter(e => e.isExisting)) {
          const orderIdx = orderedEmails.findIndex(e => e.id === email.id);
          const rec = existingEmails.find(e => (e.mailchimp_id || e.id) === email.id);
          if (rec) await emailCampaignService.updateEmailOrder(rec.id, orderIdx + 1);
        }
      }

      createdCampaignId = null;
      toast.success(`${campaignMode === 'new' ? `Campaign "${campaignName}" created` : 'Campaign updated'} with ${orderedEmails.length} emails!`);
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });

      // Reset and go back to list
      setCurrentStep('fetch');
      setFetchedEmails([]); setSelectedIds(new Set()); setOrderedEmails([]);
      setCampaignName(''); setCampaignMode(null); setSelectedCampaignId('');
      setExistingEmails([]); setExistingCampaigns([]);
      onSuccess();
    } catch (err: any) {
      if (createdCampaignId) await emailCampaignService.delete(createdCampaignId).catch(() => {});
      toast.error(err.message || 'Failed to save campaign');
    }
    setIsSaving(false);
  };

  const goBack = () => {
    const idx = WIZARD_STEPS.indexOf(currentStep);
    if (idx > 0) {
      if (currentStep === 'order') { setCampaignMode(null); setSelectedCampaignId(''); }
      setCurrentStep(WIZARD_STEPS[idx - 1]);
    }
  };

  const stepLabels = [
    { step: 'fetch', label: 'Fetch' },
    { step: 'select', label: 'Select' },
    { step: 'destination', label: 'Destination' },
    { step: 'order', label: 'Order' },
    { step: 'confirm', label: 'Confirm' },
  ];

  return (
    <div className="h-full overflow-auto">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {WIZARD_STEPS.map((step, i) => (
          <div key={step} className={`h-2 rounded-full transition-all duration-500 ${i <= stepIndex ? 'bg-[#522B47] w-8' : 'bg-gray-200 w-2'}`} />
        ))}
      </div>
      <div className="flex items-center justify-center gap-6 mb-6">
        {stepLabels.map((s, i) => (
          <span key={s.step} className={`text-xs font-medium tracking-wide uppercase ${i <= stepIndex ? 'text-[#522B47]' : 'text-gray-300'}`}>{s.label}</span>
        ))}
      </div>

      {/* ── FETCH ── */}
      {currentStep === 'fetch' && (
        <div className="max-w-lg mx-auto animate-fade-in">
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#522B47]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search size={24} className="text-[#522B47]" />
              </div>
              <h3 className="font-serif font-bold text-xl mb-1">Fetch Recent Emails</h3>
              <p className="text-sm text-gray-500">Pull your recently created Mailchimp emails.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Fetch emails created since</label>
              <input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 transition-all" />
            </div>
            <button onClick={handleFetch} disabled={isFetching}
              className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white px-5 py-3 rounded-xl font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 cursor-pointer">
              {isFetching ? <><Loader2 size={16} className="animate-spin" /> Fetching...</> : <><Send size={16} /> Fetch Recent Emails</>}
            </button>
            {!N8N_FETCH_URL && <p className="text-xs text-amber-600 text-center">Warning: VITE_N8N_FETCH_CAMPAIGNS_WEBHOOK_URL not set.</p>}
          </div>
        </div>
      )}

      {/* ── SELECT ── */}
      {currentStep === 'select' && (
        <div className="max-w-2xl mx-auto animate-fade-in">
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-xl">Select Emails</h3>
                <p className="text-sm text-gray-500 mt-1">Choose which emails to add.</p>
              </div>
              <span className="text-sm font-medium text-[#522B47]">{selectedIds.size} selected</span>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {fetchedEmails.map(email => {
                const sel = selectedIds.has(email.id);
                return (
                  <button key={email.id} onClick={() => toggleSelect(email.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left cursor-pointer ${sel ? 'border-[#522B47] bg-[#522B47]/5 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${sel ? 'bg-[#522B47] border-[#522B47]' : 'border-gray-300'}`}>
                      {sel && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{email.name}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{email.subject}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{email.id.substring(0, 8)}...</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"><ArrowLeft size={14} /> Back</button>
              <button onClick={() => { setCampaignMode(null); setSelectedCampaignId(''); setCurrentStep('destination'); }} disabled={selectedIds.size === 0}
                className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 cursor-pointer">
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DESTINATION ── */}
      {currentStep === 'destination' && (
        <div className="max-w-2xl mx-auto animate-fade-in">
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <h3 className="font-serif font-bold text-xl mb-1">Where should these emails go?</h3>
              <p className="text-sm text-gray-500">Create a brand new campaign or add to an existing one.</p>
            </div>

            {!campaignMode && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={handleChooseNew}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-[#522B47] hover:bg-[#522B47]/5 transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-[#522B47]/10 rounded-xl flex items-center justify-center group-hover:bg-[#522B47]/20 transition-colors">
                      <Plus size={22} className="text-[#522B47]" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm text-gray-900">New Campaign</p>
                      <p className="text-xs text-gray-500 mt-1">Start a fresh outreach campaign</p>
                    </div>
                  </button>
                  <button onClick={handleChooseExisting}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-[#522B47] hover:bg-[#522B47]/5 transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-[#522B47]/10 rounded-xl flex items-center justify-center group-hover:bg-[#522B47]/20 transition-colors">
                      <FolderOpen size={22} className="text-[#522B47]" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm text-gray-900">Existing Campaign</p>
                      <p className="text-xs text-gray-500 mt-1">Add emails to an existing campaign</p>
                    </div>
                  </button>
                </div>
                <div className="flex items-center justify-start">
                  <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"><ArrowLeft size={14} /> Back</button>
                </div>
              </>
            )}

            {campaignMode === 'existing' && (
              <div className="space-y-4 animate-fade-in">
                <h4 className="text-sm font-medium text-gray-700">Select a campaign</h4>
                {isLoadingCampaigns ? (
                  <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-auto">
                    {existingCampaigns.map(campaign => {
                      const sel = selectedCampaignId === campaign.id;
                      return (
                        <button key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left cursor-pointer ${sel ? 'border-[#522B47] bg-[#522B47]/5 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${sel ? 'bg-[#522B47] border-[#522B47]' : 'border-gray-300'}`}>
                            {sel && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900">{campaign.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{campaign.industry && `${campaign.industry} · `}{campaign.status || 'draft'}</p>
                          </div>
                        </button>
                      );
                    })}
                    {existingCampaigns.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No existing campaigns found.</p>}
                  </div>
                )}
                {selectedCampaignId && existingEmails.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-500">
                      This campaign already has <span className="font-semibold text-gray-700">{existingEmails.length} email{existingEmails.length > 1 ? 's' : ''}</span>. Your {selectedIds.size} new email{selectedIds.size > 1 ? 's' : ''} will be merged in and you can reorder them on the next step.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <button onClick={() => setCampaignMode(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"><ArrowLeft size={14} /> Back</button>
                  <button onClick={handleSelectExistingCampaign} disabled={!selectedCampaignId}
                    className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 cursor-pointer">
                    Continue <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ORDER ── */}
      {currentStep === 'order' && (
        <div className="max-w-2xl mx-auto animate-fade-in">
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div>
              <h3 className="font-serif font-bold text-xl">Set Email Order</h3>
              <p className="text-sm text-gray-500 mt-1">{campaignMode === 'existing' ? 'Drag to reorder. New emails are highlighted.' : 'Drag to reorder. First email is sent first.'}</p>
            </div>
            <div className="space-y-1">
              {orderedEmails.map((email, idx) => (
                <div key={email.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={e => handleDragOver(e, idx)} onDrop={() => handleDrop(idx)} onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${dragOverIdx === idx ? 'border-[#522B47] shadow-md' : 'border-gray-200 hover:border-gray-300'} ${dragIdx.current === idx ? 'opacity-50' : ''} ${email.isExisting ? 'bg-white' : 'bg-green-50/50'}`}
                  style={{ cursor: 'grab' }}>
                  <GripVertical size={16} className="text-gray-400 flex-shrink-0" />
                  <div className="w-7 h-7 bg-[#522B47] text-white rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{email.name}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{email.subject}</p>
                  </div>
                  {email.isExisting && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">existing</span>}
                  {!email.isExisting && campaignMode === 'existing' && <span className="text-[10px] text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">new</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"><ArrowLeft size={14} /> Back</button>
              <button onClick={() => setCurrentStep('confirm')}
                className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg cursor-pointer">
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM ── */}
      {currentStep === 'confirm' && (
        <div className="max-w-2xl mx-auto animate-fade-in">
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#522B47]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-[#522B47]" />
              </div>
              <h3 className="font-serif font-bold text-xl mb-1">{campaignMode === 'new' ? 'Name Your Campaign' : 'Confirm Changes'}</h3>
              <p className="text-sm text-gray-500">
                {campaignMode === 'new' ? 'Give your new outreach campaign a name, then confirm to save.' : `Adding ${orderedEmails.filter(e => !e.isExisting).length} new email${orderedEmails.filter(e => !e.isExisting).length !== 1 ? 's' : ''} to "${campaignName}".`}
              </p>
            </div>
            {campaignMode === 'new' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Campaign Name</label>
                <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. Accounting Outreach" autoFocus
                  className="w-full px-4 py-2.5 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 transition-all" />
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Email Sequence ({orderedEmails.length} emails)</h4>
              <div className="space-y-1.5">
                {orderedEmails.map((email, idx) => (
                  <div key={email.id} className={`flex items-center gap-3 p-3 rounded-lg border border-gray-100 ${email.isExisting ? 'bg-gray-50/80' : 'bg-green-50/50'}`}>
                    <div className="w-6 h-6 bg-[#522B47]/10 text-[#522B47] rounded-md flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{email.name}</p>
                      <p className="text-xs text-gray-500 truncate">{email.subject}</p>
                    </div>
                    {email.isExisting && <span className="text-[10px] text-gray-400">existing</span>}
                    {!email.isExisting && campaignMode === 'existing' && <span className="text-[10px] text-green-600 font-medium">new</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"><ArrowLeft size={14} /> Back</button>
              <button onClick={handleSave} disabled={(campaignMode === 'new' && !campaignName.trim()) || isSaving}
                className="flex items-center gap-2 bg-[#522B47] text-white px-6 py-3 rounded-xl font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 cursor-pointer">
                {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> {campaignMode === 'new' ? 'Create Campaign' : 'Update Campaign'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignWizardView;
