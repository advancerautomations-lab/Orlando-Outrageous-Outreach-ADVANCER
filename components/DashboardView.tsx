import React, { useState, useEffect, useMemo } from 'react';
import { Lead, Meeting, Prospect, EmailCampaignRecipient, EmailCampaignStatistics, EmailToCampaign } from '../types';
import { prospectService, emailCampaignService } from '../services/supabaseService';
import {
  Users, MessageSquareReply, ArrowUpRight, TrendingUp, TrendingDown, Target,
  Send, Eye, MousePointerClick, CalendarCheck, UserPlus, Flame, DollarSign,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Legend,
} from 'recharts';

interface DashboardViewProps {
  leads: Lead[];
  meetings: Meeting[];
}

const DashboardView: React.FC<DashboardViewProps> = ({ leads, meetings }) => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [allRecipients, setAllRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [allStats, setAllStats] = useState<EmailCampaignStatistics[]>([]);
  const [emailInfoMap, setEmailInfoMap] = useState<Map<string, EmailToCampaign>>(new Map());
  const [loading, setLoading] = useState(true);
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({
    sent: true, opened: true, clicked: true, replied: true,
  });
  const [outreachPeriod, setOutreachPeriod] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    Promise.all([
      prospectService.getAll(),
      emailCampaignService.getAllRecipients(),
      emailCampaignService.getAllStatistics(),
      emailCampaignService.getAll().then(async (camps) => {
        const allEmails: EmailToCampaign[] = [];
        for (const c of camps) {
          const emails = await emailCampaignService.getEmails(c.id);
          allEmails.push(...emails);
        }
        return allEmails;
      }),
    ])
      .then(([p, r, stats, emails]) => {
        setProspects(p);
        setAllRecipients(r);
        setAllStats(stats);
        const map = new Map<string, EmailToCampaign>();
        for (const e of emails) map.set(e.id, e);
        setEmailInfoMap(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Helpers ──

  const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = toLocalDateStr(new Date());

  const isToday = (dateStr: string | undefined | null): boolean => {
    if (!dateStr) return false;
    return toLocalDateStr(new Date(dateStr)) === todayStr;
  };

  // ── Trend Calculations ──

  const now = useMemo(() => new Date(), []);

  const leadTrends = useMemo(() => {
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);

    const thisWeekLeads = leads.filter(l => new Date(l.created_at) >= thisWeekStart).length;
    const lastWeekLeads = leads.filter(l => {
      const d = new Date(l.created_at);
      return d >= lastWeekStart && d < thisWeekStart;
    }).length;

    const thisWeekActive = leads.filter(l => l.status !== 'Lost' && l.status !== 'Won' && new Date(l.created_at) >= thisWeekStart).length;
    const lastWeekActive = leads.filter(l => {
      const d = new Date(l.created_at);
      return l.status !== 'Lost' && l.status !== 'Won' && d >= lastWeekStart && d < thisWeekStart;
    }).length;

    const calcTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      totalTrend: calcTrend(thisWeekLeads, lastWeekLeads),
      activeTrend: calcTrend(thisWeekActive, lastWeekActive),
    };
  }, [leads, now]);

  const responseRateTrend = useMemo(() => {
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);

    const thisWeekSent = allRecipients.filter(r => r.sent_at && new Date(r.sent_at) >= thisWeekStart).length;
    const thisWeekReplied = allRecipients.filter(r => r.replied_at && new Date(r.replied_at) >= thisWeekStart).length;
    const lastWeekSent = allRecipients.filter(r => r.sent_at && new Date(r.sent_at) >= lastWeekStart && new Date(r.sent_at) < thisWeekStart).length;
    const lastWeekReplied = allRecipients.filter(r => r.replied_at && new Date(r.replied_at) >= lastWeekStart && new Date(r.replied_at) < thisWeekStart).length;

    const thisRate = thisWeekSent > 0 ? (thisWeekReplied / thisWeekSent) * 100 : 0;
    const lastRate = lastWeekSent > 0 ? (lastWeekReplied / lastWeekSent) * 100 : 0;

    return lastRate === 0 ? (thisRate > 0 ? 100 : 0) : ((thisRate - lastRate) / lastRate) * 100;
  }, [allRecipients, now]);

  // ── Stat Card Calculations ──

  const activeLeads = useMemo(() =>
    leads.filter(l => l.status !== 'Lost' && l.status !== 'Won').length,
    [leads]
  );

  const responseRate = useMemo(() => {
    const totalSent = allStats.reduce((s, st) => s + (st.total_sent || 0), 0);
    const totalReplied = allStats.reduce((s, st) => s + (st.total_replied || 0), 0);
    return totalSent > 0 ? ((totalReplied / totalSent) * 100) : 0;
  }, [allStats]);

  const pipelineValue = useMemo(() => {
    return leads
      .filter(l => l.status !== 'Lost' && l.status !== 'Won')
      .reduce((sum, l) => sum + l.value, 0);
  }, [leads]);

  const pipelineValueTrend = useMemo(() => {
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);

    const thisWeekValue = leads
      .filter(l => l.status !== 'Lost' && l.status !== 'Won' && new Date(l.created_at) >= thisWeekStart)
      .reduce((s, l) => s + l.value, 0);
    const lastWeekValue = leads
      .filter(l => {
        const d = new Date(l.created_at);
        return l.status !== 'Lost' && l.status !== 'Won' && d >= lastWeekStart && d < thisWeekStart;
      })
      .reduce((s, l) => s + l.value, 0);

    if (lastWeekValue === 0) return thisWeekValue > 0 ? 100 : 0;
    return ((thisWeekValue - lastWeekValue) / lastWeekValue) * 100;
  }, [leads, now]);

  // ── Today's Activity Feed ──

  type ActivityItem = {
    type: 'sent' | 'opened' | 'clicked' | 'replied' | 'new_lead' | 'meeting';
    name: string;
    detail: string;
    time: string;
    icon: React.ElementType;
    color: string;
  };

  const todayActivity = useMemo((): ActivityItem[] => {
    const items: ActivityItem[] = [];

    const prospectMap = new Map<string, Prospect>();
    for (const p of prospects) prospectMap.set(p.id, p);

    for (const r of allRecipients) {
      const prospect = r.prospect_id ? prospectMap.get(r.prospect_id) : null;
      const pName = prospect ? `${prospect.first_name} ${prospect.last_name}` : 'Unknown';
      const emailInfo = r.email_to_campaign_id ? emailInfoMap.get(r.email_to_campaign_id) : null;
      const emailLabel = emailInfo?.name || `Email ${r.current_email_step || '?'}`;

      if (isToday(r.replied_at)) {
        items.push({ type: 'replied', name: pName, detail: `replied to ${emailLabel}`, time: r.replied_at!, icon: MessageSquareReply, color: 'text-green-600' });
      }
      if (isToday(r.clicked_at)) {
        items.push({ type: 'clicked', name: pName, detail: `clicked ${emailLabel}`, time: r.clicked_at!, icon: MousePointerClick, color: 'text-green-600' });
      }
      if (isToday(r.opened_at)) {
        items.push({ type: 'opened', name: pName, detail: `opened ${emailLabel}`, time: r.opened_at!, icon: Eye, color: 'text-blue-600' });
      }
      if (isToday(r.sent_at)) {
        items.push({ type: 'sent', name: pName, detail: `was sent ${emailLabel}`, time: r.sent_at!, icon: Send, color: 'text-gray-500' });
      }
    }

    for (const l of leads) {
      if (isToday(l.created_at)) {
        items.push({ type: 'new_lead', name: `${l.first_name} ${l.last_name}`, detail: 'became a lead', time: l.created_at!, icon: UserPlus, color: 'text-black' });
      }
    }

    for (const m of meetings) {
      if (isToday(m.start_time)) {
        items.push({ type: 'meeting', name: m.title, detail: 'meeting scheduled', time: m.start_time, icon: CalendarCheck, color: 'text-violet-600' });
      }
    }

    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return items;
  }, [allRecipients, prospects, leads, meetings, emailInfoMap, todayStr]);

  const todaySummary = useMemo(() => {
    const counts = { sent: 0, opened: 0, clicked: 0, replied: 0, new_lead: 0, meeting: 0 };
    for (const item of todayActivity) counts[item.type]++;
    return counts;
  }, [todayActivity]);

  // ── Pipeline Funnel ──

  const pipelineStages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won'] as const;

  const pipelineFunnel = useMemo(() => {
    return pipelineStages.map(stage => {
      const stageLeads = leads.filter(l => l.status === stage);
      return {
        name: stage,
        count: stageLeads.length,
        value: stageLeads.reduce((s, l) => s + l.value, 0),
      };
    });
  }, [leads]);

  // ── Outreach Chart (dynamic period) ──

  const outreachData = useMemo(() => {
    const days: Record<string, { date: string; sent: number; opened: number; clicked: number; replied: number }> = {};

    for (let i = outreachPeriod - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = toLocalDateStr(d);
      days[key] = { date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), sent: 0, opened: 0, clicked: 0, replied: 0 };
    }

    const localDay = (ts: string | undefined | null): string | null =>
      ts ? toLocalDateStr(new Date(ts)) : null;

    for (const r of allRecipients) {
      const sentDay = localDay(r.sent_at);
      if (sentDay && days[sentDay]) days[sentDay].sent++;
      const openDay = localDay(r.opened_at);
      if (openDay && days[openDay]) days[openDay].opened++;
      const clickDay = localDay(r.clicked_at);
      if (clickDay && days[clickDay]) days[clickDay].clicked++;
      const replyDay = localDay(r.replied_at);
      if (replyDay && days[replyDay]) days[replyDay].replied++;
    }

    return Object.values(days);
  }, [allRecipients, outreachPeriod, now]);

  // ── Lead Growth Bar Chart ──

  const leadGrowthData = useMemo(() => {
    const months: { month: string; New: number; Contacted: number; Qualified: number; Proposal: number; Won: number }[] = [];

    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });

      const monthLeads = leads.filter(l => {
        const created = new Date(l.created_at);
        return created >= d && created <= monthEnd;
      });

      months.push({
        month: monthLabel,
        New: monthLeads.filter(l => l.status === 'New').length,
        Contacted: monthLeads.filter(l => l.status === 'Contacted').length,
        Qualified: monthLeads.filter(l => l.status === 'Qualified').length,
        Proposal: monthLeads.filter(l => l.status === 'Proposal').length,
        Won: monthLeads.filter(l => l.status === 'Won').length,
      });
    }

    return months;
  }, [leads, now]);

  const leadGrowthTrend = useMemo(() => {
    if (leadGrowthData.length < 2) return 0;
    const current = leadGrowthData[leadGrowthData.length - 1];
    const previous = leadGrowthData[leadGrowthData.length - 2];
    const currentTotal = current.New + current.Contacted + current.Qualified + current.Proposal + current.Won;
    const previousTotal = previous.New + previous.Contacted + previous.Qualified + previous.Proposal + previous.Won;
    if (previousTotal === 0) return currentTotal > 0 ? 100 : 0;
    return ((currentTotal - previousTotal) / previousTotal) * 100;
  }, [leadGrowthData]);

  // ── Hot Prospects ──

  const hotProspects = useMemo(() => {
    return [...prospects]
      .filter(p => !p.converted_to_lead_id && p.email_sent)
      .sort((a, b) => {
        const score = (p: Prospect) => {
          if (p.last_email_clicked_at) return 4;
          if (p.last_email_opened_at) return 3;
          if (p.opened) return 2;
          if (p.email_sent) return 1;
          return 0;
        };
        const diff = score(b) - score(a);
        if (diff !== 0) return diff;
        const stepA = (a.current_email_stage ? emailInfoMap.get(a.current_email_stage)?.order : null) ?? a.current_campaign_step ?? 0;
        const stepB = (b.current_email_stage ? emailInfoMap.get(b.current_email_stage)?.order : null) ?? b.current_campaign_step ?? 0;
        return stepB - stepA;
      })
      .slice(0, 10);
  }, [prospects, emailInfoMap]);

  const totalCampaignEmails = emailInfoMap.size || 5;

  // ── Helpers ──

  const formatRelativeTime = (dateStr: string): string => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getEngagementLabel = (p: Prospect): { label: string; color: string } => {
    if (p.last_email_clicked_at) return { label: 'Clicked', color: 'bg-green-100 text-green-700' };
    if (p.last_email_opened_at) return { label: 'Opened', color: 'bg-blue-100 text-blue-700' };
    if (p.opened) return { label: 'Opened', color: 'bg-blue-100 text-blue-700' };
    return { label: 'Sent', color: 'bg-gray-100 text-gray-600' };
  };

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toLocaleString()}`;
  };

  // ── Stat Card Component ──

  const StatCard = ({ label, value, icon: Icon, trend, trendLabel }: {
    label: string;
    value: string;
    icon: React.ElementType;
    trend?: number;
    trendLabel?: string;
  }) => {
    const isPositive = (trend ?? 0) >= 0;
    const TrendIcon = isPositive ? TrendingUp : TrendingDown;
    const hasTrend = trend !== undefined && trend !== 0;

    return (
      <div className="glass-card p-6 rounded-2xl relative overflow-hidden group" role="article" aria-label={`${label}: ${value}`}>
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-accent-beige/20 rounded-full blur-2xl" aria-hidden="true" />
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 bg-white rounded-xl shadow-sm" aria-hidden="true">
            <Icon size={20} className="text-black" />
          </div>
        </div>
        <h3 className="text-gray-500 font-medium text-sm mb-1">{label}</h3>
        <p className="text-3xl font-serif font-bold text-black">{value}</p>
        {hasTrend && (
          <div className={`flex items-center gap-1 mt-2 ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
            <TrendIcon size={14} />
            <span className="text-xs font-medium">
              {isPositive ? '+' : ''}{trend!.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400 ml-0.5">{trendLabel || 'from last week'}</span>
          </div>
        )}
        {!hasTrend && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs text-gray-400">No change from last week</span>
          </div>
        )}
      </div>
    );
  };

  // ── Lead Growth Bar Chart Colors ──

  const stageColors: Record<string, string> = {
    New: '#522B47',
    Contacted: '#FBEA74',
    Qualified: '#3B82F6',
    Proposal: '#9CA3AF',
    Won: '#22C55E',
  };

  // ── Loading Skeleton ──

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="h-10 w-64 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card p-6 rounded-2xl h-36 animate-pulse bg-gray-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="glass-card p-6 rounded-2xl lg:col-span-2 h-80 animate-pulse bg-gray-100" />
          <div className="glass-card p-6 rounded-2xl h-80 animate-pulse bg-gray-100" />
        </div>
      </div>
    );
  }

  const maxPipelineCount = Math.max(...pipelineFunnel.map(s => s.count), 1);

  const xAxisInterval = outreachPeriod <= 7 ? 0 : outreachPeriod <= 30 ? 6 : 14;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-serif font-bold text-black mb-2">Dashboard Overview</h2>
        <p className="text-gray-500">Here's what's happening across your pipeline today.</p>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Leads" value={String(leads.length)} icon={Target} trend={leadTrends.totalTrend} />
        <StatCard label="Active Leads" value={String(activeLeads)} icon={Users} trend={leadTrends.activeTrend} />
        <StatCard label="Response Rate" value={`${responseRate.toFixed(1)}%`} icon={MessageSquareReply} trend={responseRateTrend} />
        <StatCard label="Revenue Pipeline" value={formatCurrency(pipelineValue)} icon={DollarSign} trend={pipelineValueTrend} />
      </div>

      {/* Row 2: Today's Activity + Pipeline Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Today's Activity Feed */}
        <div className="glass-card p-6 rounded-2xl lg:col-span-2 flex flex-col">
          <h3 className="font-serif font-bold text-xl mb-4">Today's Activity</h3>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {todaySummary.sent > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {todaySummary.sent} sent
              </span>
            )}
            {todaySummary.opened > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                {todaySummary.opened} opened
              </span>
            )}
            {todaySummary.clicked > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600">
                {todaySummary.clicked} clicked
              </span>
            )}
            {todaySummary.replied > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                {todaySummary.replied} replied
              </span>
            )}
            {todaySummary.new_lead > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#522B47] text-white">
                {todaySummary.new_lead} new lead{todaySummary.new_lead > 1 ? 's' : ''}
              </span>
            )}
            {todaySummary.meeting > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-600">
                {todaySummary.meeting} meeting{todaySummary.meeting > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Activity list */}
          <div className="flex-1 overflow-y-auto max-h-72 space-y-1">
            {todayActivity.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No activity yet today</p>
            ) : (
              todayActivity.slice(0, 30).map((item, idx) => {
                const ItemIcon = item.icon;
                return (
                  <div key={idx} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/60 transition-colors">
                    <div className={`p-1.5 rounded-lg bg-gray-50 ${item.color}`}>
                      <ItemIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        <span className="font-medium">{item.name}</span>{' '}
                        <span className="text-gray-500">{item.detail}</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelativeTime(item.time)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Lead Pipeline Funnel */}
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="font-serif font-bold text-xl mb-6">Lead Pipeline</h3>
          <div className="space-y-4">
            {pipelineFunnel.map((stage) => (
              <div key={stage.name}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-medium text-gray-700">{stage.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-black">{stage.count}</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#522B47] rounded-full transition-all duration-500"
                    style={{ width: `${(stage.count / maxPipelineCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total in pipeline</span>
              <span className="font-bold">{leads.filter(l => l.status !== 'Lost').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Outreach Performance + Lead Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Outreach Performance Area Chart */}
        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-serif font-bold text-xl">Outreach Performance</h3>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {([7, 30, 90] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setOutreachPeriod(period)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    outreachPeriod === period
                      ? 'bg-white shadow-sm text-black'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {period}d
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4">Last {outreachPeriod} days</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={outreachData}>
                <defs>
                  <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9CA3AF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#9CA3AF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="openedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="clickedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#522B47" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#522B47" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="repliedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  interval={xAxisInterval}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} width={30} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)', fontSize: '12px' }}
                  cursor={{ stroke: '#E5E7EB' }}
                />
                {visibleSeries.sent && <Area type="monotone" dataKey="sent" stroke="#9CA3AF" fill="url(#sentGrad)" strokeWidth={1.5} />}
                {visibleSeries.opened && <Area type="monotone" dataKey="opened" stroke="#3B82F6" fill="url(#openedGrad)" strokeWidth={1.5} />}
                {visibleSeries.clicked && <Area type="monotone" dataKey="clicked" stroke="#522B47" fill="url(#clickedGrad)" strokeWidth={1.5} />}
                {visibleSeries.replied && <Area type="monotone" dataKey="replied" stroke="#22C55E" fill="url(#repliedGrad)" strokeWidth={2} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-3">
            {[
              { key: 'sent', label: 'Sent', color: '#9CA3AF' },
              { key: 'opened', label: 'Opened', color: '#3B82F6' },
              { key: 'clicked', label: 'Clicked', color: '#522B47' },
              { key: 'replied', label: 'Replied', color: '#22C55E' },
            ].map(item => {
              const active = visibleSeries[item.key];
              return (
                <button
                  key={item.key}
                  onClick={() => setVisibleSeries(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all text-xs ${
                    active ? 'bg-gray-100 font-medium' : 'opacity-40 hover:opacity-70'
                  }`}
                  aria-pressed={active}
                  aria-label={`${active ? 'Hide' : 'Show'} ${item.label}`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full transition-opacity"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-gray-600">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lead Growth Stacked Bar Chart */}
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="font-serif font-bold text-xl mb-1">Lead Growth</h3>
          <div className="flex items-center gap-1 mb-5">
            {leadGrowthTrend !== 0 ? (
              <span className={`text-xs font-medium ${leadGrowthTrend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {leadGrowthTrend >= 0 ? '+' : ''}{leadGrowthTrend.toFixed(0)}% from last month
              </span>
            ) : (
              <span className="text-xs text-gray-400">Last 3 months</span>
            )}
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadGrowthData} barCategoryGap="25%">
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} width={25} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)', fontSize: '12px' }}
                />
                {pipelineStages.map(stage => (
                  <Bar
                    key={stage}
                    dataKey={stage}
                    stackId="a"
                    fill={stageColors[stage]}
                    radius={stage === 'Won' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4">
            {pipelineStages.map(stage => (
              <div key={stage} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stageColors[stage] }} />
                <span className="text-[11px] text-gray-500">{stage}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Hot Prospects */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <Flame size={20} className="text-orange-500" />
          <h3 className="font-serif font-bold text-xl">Hot Prospects</h3>
          <span className="text-xs text-gray-400 ml-1">Most engaged, not yet converted</span>
        </div>

        {hotProspects.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No engaged prospects yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th scope="col" className="text-left py-2.5 px-3 font-semibold text-gray-500 text-xs">Name</th>
                  <th scope="col" className="text-left py-2.5 px-3 font-semibold text-gray-500 text-xs">Company</th>
                  <th scope="col" className="text-left py-2.5 px-3 font-semibold text-gray-500 text-xs">Email Stage</th>
                  <th scope="col" className="text-left py-2.5 px-3 font-semibold text-gray-500 text-xs">Last Activity</th>
                  <th scope="col" className="text-left py-2.5 px-3 font-semibold text-gray-500 text-xs">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {hotProspects.map(p => {
                  const stageEmail = p.current_email_stage ? emailInfoMap.get(p.current_email_stage) : null;
                  const step = stageEmail?.order ?? p.current_campaign_step ?? 0;
                  const engagement = getEngagementLabel(p);
                  const lastDate = p.last_email_clicked_at || p.last_email_opened_at || p.date_sent;

                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-white/60 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-medium text-gray-900">{p.first_name} {p.last_name}</p>
                        <p className="text-[11px] text-gray-400">{p.email}</p>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{p.company_name || '—'}</td>
                      <td className="py-3 px-3">
                        {step > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              {Array.from({ length: totalCampaignEmails }, (_, i) => (
                                <div
                                  key={i}
                                  className={`w-3 h-1.5 rounded-full ${i < step ? 'bg-[#522B47]' : 'bg-gray-200'}`}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-gray-500">{step}/{totalCampaignEmails}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">
                        {lastDate ? formatRelativeTime(lastDate) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${engagement.color}`}>
                          {engagement.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardView;
