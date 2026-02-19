import React, { useState, useEffect, useMemo } from 'react';
import { EmailCampaign, EmailCampaignStatistics, EmailCampaignRecipient } from '../../types';
import { emailCampaignService } from '../../services/supabaseService';
import { Send, Eye, MousePointerClick, MessageSquare, AlertTriangle, BarChart3, ChevronRight, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { SkeletonCards } from './SkeletonLoader';

interface Props {
  onNavigateToCampaign?: (campaignId: string) => void;
}

type DonutView = 'emails-sent' | 'recipients';

const InteractionActivityTab: React.FC<Props> = ({ onNavigateToCampaign }) => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [allStats, setAllStats] = useState<EmailCampaignStatistics[]>([]);
  const [allRecipients, setAllRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeReengagements, setIncludeReengagements] = useState(false);
  const [donutView, setDonutView] = useState<DonutView>('emails-sent');
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      emailCampaignService.getAll(),
      emailCampaignService.getAllStatistics(),
      emailCampaignService.getAllRecipients()
    ])
      .then(([camps, stats, recipients]) => {
        setCampaigns(camps);
        setAllStats(stats);
        setAllRecipients(recipients);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // --- Aggregate stats computed from individual recipients ---

  // Unique stats: count each recipient once using date fields
  const uniqueAggregateStats = useMemo(() => {
    if (allRecipients.length === 0) return null;
    const total_sent = allRecipients.filter(r => r.sent_at).length;
    const total_delivered = allRecipients.filter(r => r.delivered_at).length;
    const total_opened = allRecipients.filter(r => r.first_opened_at || r.opened_at).length;
    const total_clicked = allRecipients.filter(r => r.clicked_at).length;
    const total_replied = allRecipients.filter(r => r.replied_at).length;
    const total_bounced = allRecipients.filter(r => r.bounced_at).length;
    const total_unsubscribed = allRecipients.filter(r => r.unsubscribed_at).length;
    return { total_sent, total_delivered, total_opened, total_clicked, total_replied, total_bounced, total_unsubscribed };
  }, [allRecipients]);

  // Re-engagement stats: sum open_count and click_count for repeat interactions
  const reengagementAggregateStats = useMemo(() => {
    if (allRecipients.length === 0) return null;
    const total_sent = allRecipients.filter(r => r.sent_at).length;
    const total_delivered = allRecipients.filter(r => r.delivered_at).length;
    const total_opened = allRecipients.reduce((sum, r) => sum + (r.open_count || 0), 0);
    const total_clicked = allRecipients.reduce((sum, r) => sum + (r.click_count || 0), 0);
    const total_replied = allRecipients.filter(r => r.replied_at).length;
    const total_bounced = allRecipients.filter(r => r.bounced_at).length;
    const total_unsubscribed = allRecipients.filter(r => r.unsubscribed_at).length;
    return { total_sent, total_delivered, total_opened, total_clicked, total_replied, total_bounced, total_unsubscribed };
  }, [allRecipients]);

  // Fallback to email_campaign_statistics table if no recipients loaded
  const statsTableAggregate = useMemo(() => {
    if (allStats.length === 0) return null;
    return {
      total_sent: allStats.reduce((sum, s) => sum + (s.total_sent || 0), 0),
      total_delivered: allStats.reduce((sum, s) => sum + (s.total_delivered || 0), 0),
      total_opened: allStats.reduce((sum, s) => sum + (s.total_opened || 0), 0),
      total_clicked: allStats.reduce((sum, s) => sum + (s.total_clicked || 0), 0),
      total_replied: allStats.reduce((sum, s) => sum + (s.total_replied || 0), 0),
      total_bounced: allStats.reduce((sum, s) => sum + (s.total_bounced || 0), 0),
      total_unsubscribed: allStats.reduce((sum, s) => sum + (s.total_unsubscribed || 0), 0),
    };
  }, [allStats]);

  const aggregateStats = includeReengagements
    ? (reengagementAggregateStats || statsTableAggregate)
    : (uniqueAggregateStats || statsTableAggregate);

  const formatRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
  };

  const getRateValue = (numerator: number, denominator: number): number => {
    if (denominator === 0) return 0;
    return (numerator / denominator) * 100;
  };

  // --- Bar chart data (toggle-aware) ---
  const barChartData = useMemo(() => {
    if (allRecipients.length === 0) {
      // Fallback to stats table
      return allStats.map(stat => {
        const campaign = campaigns.find(c => c.id === stat.campaign_id);
        const sent = stat.total_sent || 1;
        return {
          name: campaign?.name?.substring(0, 20) || 'Unknown',
          'Open Rate': Number((stat.open_rate ?? getRateValue(stat.total_opened || 0, sent)).toFixed(1)),
          'Click Rate': Number((stat.click_rate ?? getRateValue(stat.total_clicked || 0, sent)).toFixed(1)),
          'Reply Rate': Number((stat.reply_rate ?? getRateValue(stat.total_replied || 0, sent)).toFixed(1)),
        };
      });
    }

    // Group recipients by campaign_id
    const byCampaign = new Map<string, EmailCampaignRecipient[]>();
    for (const r of allRecipients) {
      const list = byCampaign.get(r.campaign_id) || [];
      list.push(r);
      byCampaign.set(r.campaign_id, list);
    }

    return Array.from(byCampaign.entries()).map(([campaignId, recipients]) => {
      const campaign = campaigns.find(c => c.id === campaignId);
      const sent = recipients.filter(r => r.sent_at).length || 1;

      let opened: number, clicked: number;
      if (includeReengagements) {
        opened = recipients.reduce((sum, r) => sum + (r.open_count || 0), 0);
        clicked = recipients.reduce((sum, r) => sum + (r.click_count || 0), 0);
      } else {
        opened = recipients.filter(r => r.first_opened_at || r.opened_at).length;
        clicked = recipients.filter(r => r.clicked_at).length;
      }
      const replied = recipients.filter(r => r.replied_at).length;

      return {
        name: campaign?.name?.substring(0, 20) || 'Unknown',
        'Open Rate': Number(getRateValue(opened, sent).toFixed(1)),
        'Click Rate': Number(getRateValue(clicked, sent).toFixed(1)),
        'Reply Rate': Number(getRateValue(replied, sent).toFixed(1)),
      };
    });
  }, [allRecipients, allStats, campaigns, includeReengagements]);

  // --- Donut A: Emails Sent (each row = one email) ---
  const { emailsSentDonutData, emailsSentTotal } = useMemo(() => {
    if (allRecipients.length === 0) return { emailsSentDonutData: [], emailsSentTotal: 0 };

    let replied = 0, clicked = 0, opened = 0, bounced = 0, noEngagement = 0;

    for (const r of allRecipients) {
      if (r.replied_at) {
        replied++;
      } else if (r.clicked_at) {
        clicked++;
      } else if (r.first_opened_at || r.opened_at) {
        opened++;
      } else if (r.bounced_at) {
        bounced++;
      } else {
        noEngagement++;
      }
    }

    const data = [
      { name: 'Replied', value: replied, color: '#22C55E' },
      { name: 'Clicked', value: clicked, color: '#EBD3C1' },
      { name: 'Opened', value: opened, color: '#000000' },
      { name: 'Bounced', value: bounced, color: '#EF4444' },
      { name: 'No engagement', value: noEngagement, color: '#E5E7EB' },
    ].filter(d => d.value > 0);

    return { emailsSentDonutData: data, emailsSentTotal: allRecipients.length };
  }, [allRecipients]);

  // --- Donut B: Recipients (deduplicated by prospect_id) ---
  const { recipientsDonutData, recipientsTotal } = useMemo(() => {
    if (allRecipients.length === 0) return { recipientsDonutData: [], recipientsTotal: 0 };

    // Group all rows by prospect, accumulate counts
    const prospectData = new Map<string, { maxOpenCount: number; maxClickCount: number; replied: boolean; unsubscribed: boolean; anyEngagement: boolean }>();
    for (const r of allRecipients) {
      const key = r.prospect_id || r.id;
      const existing = prospectData.get(key);
      if (!existing) {
        prospectData.set(key, {
          maxOpenCount: r.open_count || 0,
          maxClickCount: r.click_count || 0,
          replied: !!r.replied_at,
          unsubscribed: !!r.unsubscribed_at,
          anyEngagement: !!(r.first_opened_at || r.opened_at || r.clicked_at),
        });
      } else {
        existing.maxOpenCount += (r.open_count || 0);
        existing.maxClickCount += (r.click_count || 0);
        if (r.replied_at) existing.replied = true;
        if (r.unsubscribed_at) existing.unsubscribed = true;
        if (r.first_opened_at || r.opened_at || r.clicked_at) existing.anyEngagement = true;
      }
    }

    let replied = 0, engaged = 0, unsubscribed = 0, noEngagement = 0, lowEngagement = 0;

    for (const p of prospectData.values()) {
      if (p.replied) {
        replied++;
      } else if (p.unsubscribed) {
        unsubscribed++;
      } else if (p.maxOpenCount >= 3 || p.maxClickCount >= 3) {
        engaged++;
      } else if (p.anyEngagement) {
        lowEngagement++;
      } else {
        noEngagement++;
      }
    }

    const data = [
      { name: 'Replied', value: replied, color: '#22C55E' },
      { name: 'Engaged (3+)', value: engaged, color: '#000000' },
      { name: 'Low engagement', value: lowEngagement, color: '#9CA3AF' },
      { name: 'Unsubscribed', value: unsubscribed, color: '#F97316' },
      { name: 'No engagement', value: noEngagement, color: '#E5E7EB' },
    ].filter(d => d.value > 0);

    return { recipientsDonutData: data, recipientsTotal: prospectData.size };
  }, [allRecipients]);

  // Select active donut data
  const activeDonutData = donutView === 'emails-sent' ? emailsSentDonutData : recipientsDonutData;
  const activeDonutTotal = donutView === 'emails-sent' ? emailsSentTotal : recipientsTotal;
  const activeDonutLabel = donutView === 'emails-sent' ? 'Emails Sent' : 'Recipients';

  // --- Campaign table data (toggle-aware) ---
  const campaignTableData = useMemo(() => {
    if (allRecipients.length === 0) {
      // Fallback to stats table
      return allStats.map(stat => {
        const campaign = campaigns.find(c => c.id === stat.campaign_id);
        const sent = stat.total_sent || 0;
        return {
          id: stat.id,
          campaignId: stat.campaign_id,
          campaignName: campaign?.name || 'Unknown Campaign',
          campaignStatus: campaign?.status,
          sent,
          openRate: stat.open_rate != null ? Number(stat.open_rate) : getRateValue(stat.total_opened || 0, sent),
          clickRate: stat.click_rate != null ? Number(stat.click_rate) : getRateValue(stat.total_clicked || 0, sent),
          replyRate: stat.reply_rate != null ? Number(stat.reply_rate) : getRateValue(stat.total_replied || 0, sent),
          bounceRate: stat.bounce_rate != null ? Number(stat.bounce_rate) : getRateValue(stat.total_bounced || 0, sent),
        };
      });
    }

    // Group recipients by campaign
    const byCampaign = new Map<string, EmailCampaignRecipient[]>();
    for (const r of allRecipients) {
      const list = byCampaign.get(r.campaign_id) || [];
      list.push(r);
      byCampaign.set(r.campaign_id, list);
    }

    return Array.from(byCampaign.entries()).map(([campaignId, recipients]) => {
      const campaign = campaigns.find(c => c.id === campaignId);
      const sent = recipients.filter(r => r.sent_at).length;

      let openedCount: number, clickedCount: number;
      if (includeReengagements) {
        openedCount = recipients.reduce((sum, r) => sum + (r.open_count || 0), 0);
        clickedCount = recipients.reduce((sum, r) => sum + (r.click_count || 0), 0);
      } else {
        openedCount = recipients.filter(r => r.first_opened_at || r.opened_at).length;
        clickedCount = recipients.filter(r => r.clicked_at).length;
      }
      const repliedCount = recipients.filter(r => r.replied_at).length;
      const bouncedCount = recipients.filter(r => r.bounced_at).length;

      return {
        id: campaignId,
        campaignId,
        campaignName: campaign?.name || 'Unknown Campaign',
        campaignStatus: campaign?.status,
        sent,
        openRate: getRateValue(openedCount, sent),
        clickRate: getRateValue(clickedCount, sent),
        replyRate: getRateValue(repliedCount, sent),
        bounceRate: getRateValue(bouncedCount, sent),
      };
    });
  }, [allRecipients, allStats, campaigns, includeReengagements]);

  const StatCard = ({ label, value, subtext, icon: Icon, borderColor }: {
    label: string; value: string; subtext: string; icon: React.ElementType; borderColor: string;
  }) => (
    <div className={`glass-card p-5 rounded-2xl border-l-4 ${borderColor}`} role="article" aria-label={`${label}: ${value}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 bg-white rounded-xl shadow-sm" aria-hidden="true">
          <Icon size={18} className="text-black" />
        </div>
        <span className="text-sm text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-serif font-bold text-black">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtext}</p>
    </div>
  );

  const InlineBar = ({ value, max = 100 }: { value: number; max?: number }) => (
    <div className="inline-flex items-center gap-2">
      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-black rounded-full" style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
      </div>
    </div>
  );

  if (loading) {
    return <SkeletonCards />;
  }

  if (allStats.length === 0 && allRecipients.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <BarChart3 size={48} className="mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">No campaign statistics yet</p>
        <p className="text-xs text-gray-400 mt-1">Run the n8n sync workflow to populate data</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto animate-fade-in">
      {/* Header with Re-engagements Toggle */}
      <div className="flex items-center justify-end mb-4">
        <div className="relative">
          <label
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span className="text-xs font-medium text-gray-500">Include Re-engagements</span>
            <Info size={13} className="text-gray-400" />
            {/* Switch */}
            <button
              role="switch"
              aria-checked={includeReengagements}
              aria-label="Include re-engagements"
              onClick={() => setIncludeReengagements(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                includeReengagements ? 'bg-black' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                  includeReengagements ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
          {/* Tooltip */}
          {showTooltip && (
            <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-lg z-20 leading-relaxed">
              When enabled, this includes if the prospect re-opened the email or re-clicked the email. Counts every open and click, not just the first.
              <div className="absolute -top-1 right-6 w-2 h-2 bg-gray-900 rotate-45" />
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      {aggregateStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <StatCard
            label="Total Sent"
            value={aggregateStats.total_sent.toLocaleString()}
            subtext={`${aggregateStats.total_delivered.toLocaleString()} delivered`}
            icon={Send}
            borderColor="border-gray-200"
          />
          <StatCard
            label="Open Rate"
            value={formatRate(aggregateStats.total_opened, aggregateStats.total_sent)}
            subtext={`${aggregateStats.total_opened.toLocaleString()} ${includeReengagements ? 'total opens' : 'unique opens'}`}
            icon={Eye}
            borderColor={getRateValue(aggregateStats.total_opened, aggregateStats.total_sent) > 20 ? 'border-green-400' : 'border-gray-200'}
          />
          <StatCard
            label="Click Rate"
            value={formatRate(aggregateStats.total_clicked, aggregateStats.total_sent)}
            subtext={`${aggregateStats.total_clicked.toLocaleString()} ${includeReengagements ? 'total clicks' : 'unique clicks'}`}
            icon={MousePointerClick}
            borderColor={getRateValue(aggregateStats.total_clicked, aggregateStats.total_sent) > 2.5 ? 'border-green-400' : 'border-gray-200'}
          />
          <StatCard
            label="Reply Rate"
            value={formatRate(aggregateStats.total_replied, aggregateStats.total_sent)}
            subtext={`${aggregateStats.total_replied.toLocaleString()} replied`}
            icon={MessageSquare}
            borderColor={getRateValue(aggregateStats.total_replied, aggregateStats.total_sent) > 1 ? 'border-green-400' : 'border-gray-200'}
          />
          <StatCard
            label="Bounce Rate"
            value={formatRate(aggregateStats.total_bounced, aggregateStats.total_sent)}
            subtext={`${aggregateStats.total_bounced.toLocaleString()} bounced`}
            icon={AlertTriangle}
            borderColor={getRateValue(aggregateStats.total_bounced, aggregateStats.total_sent) > 2 ? 'border-red-400' : 'border-gray-200'}
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Bar Chart — Campaign Comparison */}
        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
          <h3 className="font-serif font-bold text-lg mb-4">Campaign Comparison</h3>
          <div className="h-[280px] w-full" role="img" aria-label="Bar chart comparing open, click, and reply rates across campaigns">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} barGap={2}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                />
                <Bar dataKey="Open Rate" fill="#000000" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="Click Rate" fill="#EBD3C1" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="Reply Rate" fill="#22C55E" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart — Switchable Views */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif font-bold text-lg">Engagement Breakdown</h3>
            {/* Donut View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5">
              <button
                onClick={() => setDonutView('emails-sent')}
                className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all duration-200 ${
                  donutView === 'emails-sent'
                    ? 'bg-black text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Emails Sent
              </button>
              <button
                onClick={() => setDonutView('recipients')}
                className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all duration-200 ${
                  donutView === 'recipients'
                    ? 'bg-black text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Recipients
              </button>
            </div>
          </div>
          <div className="h-[280px] relative" role="img" aria-label={`${activeDonutLabel} breakdown: ${activeDonutData.map(d => `${d.name}: ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeDonutData}
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  animationDuration={300}
                >
                  {activeDonutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-serif">{activeDonutTotal.toLocaleString()}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">{activeDonutLabel}</span>
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {activeDonutData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-gray-500">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Campaign Breakdown Table */}
      <div className="glass-card rounded-2xl flex-1 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-serif font-bold text-lg">Campaign Breakdown</h3>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <caption className="sr-only">Campaign performance breakdown</caption>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
                <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Campaign</th>
                <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Sent</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Open Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Click Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Reply Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Bounce Rate</th>
                {onNavigateToCampaign && (
                  <th scope="col" className="w-10 py-3 px-2"><span className="sr-only">Navigate</span></th>
                )}
              </tr>
            </thead>
            <tbody>
              {campaignTableData.map(row => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-50 hover:bg-white/60 transition-colors ${onNavigateToCampaign ? 'cursor-pointer' : ''}`}
                  onClick={() => onNavigateToCampaign?.(row.campaignId)}
                  role={onNavigateToCampaign ? 'button' : undefined}
                  tabIndex={onNavigateToCampaign ? 0 : undefined}
                  onKeyDown={(e) => { if (onNavigateToCampaign && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onNavigateToCampaign(row.campaignId); } }}
                >
                  <td className="py-3 px-4 font-medium text-gray-900">{row.campaignName}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      row.campaignStatus === 'active' || row.campaignStatus === 'sending' ? 'bg-green-100 text-green-700' :
                      row.campaignStatus === 'completed' ? 'bg-gray-100 text-gray-600' :
                      row.campaignStatus === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                      row.campaignStatus === 'paused' ? 'bg-orange-100 text-orange-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {row.campaignStatus || 'unknown'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">{row.sent.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <InlineBar value={row.openRate} />
                      <span className="font-medium text-gray-900 w-12 text-right">{row.openRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <InlineBar value={row.clickRate} max={50} />
                      <span className="font-medium text-gray-900 w-12 text-right">{row.clickRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <InlineBar value={row.replyRate} max={20} />
                      <span className="font-medium text-gray-900 w-12 text-right">{row.replyRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <InlineBar value={row.bounceRate} max={10} />
                      <span className="font-medium text-gray-900 w-12 text-right">{row.bounceRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  {onNavigateToCampaign && (
                    <td className="py-3 px-2 text-center">
                      <ChevronRight size={14} className="text-gray-400 mx-auto" aria-hidden="true" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InteractionActivityTab;
