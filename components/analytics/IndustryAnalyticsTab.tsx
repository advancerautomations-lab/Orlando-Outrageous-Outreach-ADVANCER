import React, { useState, useEffect, useMemo } from 'react';
import { Prospect, EmailCampaignRecipient, EmailCampaign, EmailToCampaign } from '../../types';
import { prospectService, emailCampaignService } from '../../services/supabaseService';
import { Factory, Eye, MousePointerClick, MessageSquare, Users, TrendingUp, ChevronDown, ChevronUp, Award, UserMinus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { SkeletonCards } from './SkeletonLoader';

interface IndustryData {
  industry: string;
  totalProspects: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  totalBounced: number;
  totalUnsubscribed: number;
  convertedLeads: number;
}

const DONUT_COLORS = ['#522B47', '#FBEA74', '#22C55E', '#3B82F6', '#F97316', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6', '#6366F1'];

const IndustryAnalyticsTab: React.FC = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [allRecipients, setAllRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [allEmails, setAllEmails] = useState<EmailToCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIndustry, setExpandedIndustry] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      prospectService.getAll(),
      emailCampaignService.getAllRecipients(),
      emailCampaignService.getAll(),
    ])
      .then(async ([pros, recipients, camps]) => {
        setProspects(pros);
        setAllRecipients(recipients);
        setCampaigns(camps);
        // Fetch emails for all campaigns to get email names
        const emailArrays = await Promise.all(camps.map(c => emailCampaignService.getEmails(c.id)));
        setAllEmails(emailArrays.flat());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // --- Lookups ---
  const prospectById = useMemo(() => {
    const map = new Map<string, Prospect>();
    for (const p of prospects) map.set(p.id, p);
    return map;
  }, [prospects]);

  const campaignById = useMemo(() => {
    const map = new Map<string, EmailCampaign>();
    for (const c of campaigns) map.set(c.id, c);
    return map;
  }, [campaigns]);

  const emailById = useMemo(() => {
    const map = new Map<string, EmailToCampaign>();
    for (const e of allEmails) map.set(e.id, e);
    return map;
  }, [allEmails]);

  // --- Core computation: group everything by industry ---
  const industryMap = useMemo<Map<string, IndustryData>>(() => {
    const map = new Map<string, IndustryData>();

    const getOrCreate = (ind: string): IndustryData => {
      let d = map.get(ind);
      if (!d) {
        d = { industry: ind, totalProspects: 0, totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0, totalReplied: 0, totalBounced: 0, totalUnsubscribed: 0, convertedLeads: 0 };
        map.set(ind, d);
      }
      return d;
    };

    for (const p of prospects) {
      const ind = p.industry || 'Unknown';
      const d = getOrCreate(ind);
      d.totalProspects++;
      if (p.converted_to_lead_id) d.convertedLeads++;
    }

    for (const r of allRecipients) {
      const prospect = r.prospect_id ? prospectById.get(r.prospect_id) : null;
      const ind = prospect?.industry || 'Unknown';
      const d = getOrCreate(ind);
      if (r.sent_at) d.totalSent++;
      if (r.delivered_at) d.totalDelivered++;
      if (r.first_opened_at || r.opened_at) d.totalOpened++;
      if (r.clicked_at) d.totalClicked++;
      if (r.replied_at) d.totalReplied++;
      if (r.bounced_at) d.totalBounced++;
      if (r.unsubscribed_at) d.totalUnsubscribed++;
    }

    return map;
  }, [prospects, allRecipients, prospectById]);

  // --- Sorted industry list (Unknown always last) ---
  const industryList = useMemo((): IndustryData[] => {
    const values: IndustryData[] = Array.from(industryMap.values());
    return values.sort((a, b) => {
      if (a.industry === 'Unknown') return 1;
      if (b.industry === 'Unknown') return -1;
      return b.totalSent - a.totalSent;
    });
  }, [industryMap]);

  // --- All unsubscribed recipients across all campaigns ---
  const unsubscribedList = useMemo(() => {
    return allRecipients
      .filter(r => r.unsubscribed_at)
      .map(r => ({
        recipient: r,
        prospect: r.prospect_id ? prospectById.get(r.prospect_id) : undefined,
        campaign: campaignById.get(r.campaign_id),
        email: r.email_to_campaign_id ? emailById.get(r.email_to_campaign_id) : undefined,
      }))
      .sort((a, b) => new Date(b.recipient.unsubscribed_at!).getTime() - new Date(a.recipient.unsubscribed_at!).getTime());
  }, [allRecipients, prospectById, campaignById, emailById]);

  // --- Helpers ---
  const getRateValue = (numerator: number, denominator: number): number => {
    if (denominator === 0) return 0;
    return (numerator / denominator) * 100;
  };

  const formatRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
  };

  // --- Stat card data ---
  const summaryStats = useMemo(() => {
    const knownIndustries = industryList.filter(d => d.industry !== 'Unknown');
    const totalIndustries = knownIndustries.length;
    const totalProspectsWithIndustry = knownIndustries.reduce((sum, d) => sum + d.totalProspects, 0);
    const totalConversions = industryList.reduce((sum, d) => sum + d.convertedLeads, 0);
    const totalProspects = industryList.reduce((sum, d) => sum + d.totalProspects, 0);
    const totalUnsubscribed = unsubscribedList.length;

    const withVolume = knownIndustries.filter(d => d.totalSent >= 5);
    const bestOpenRate = withVolume.length > 0
      ? withVolume.reduce((best, d) => getRateValue(d.totalOpened, d.totalSent) > getRateValue(best.totalOpened, best.totalSent) ? d : best)
      : null;

    const bestReplyRate = withVolume.length > 0
      ? withVolume.reduce((best, d) => getRateValue(d.totalReplied, d.totalSent) > getRateValue(best.totalReplied, best.totalSent) ? d : best)
      : null;

    return { totalIndustries, totalProspectsWithIndustry, totalConversions, totalProspects, totalUnsubscribed, bestOpenRate, bestReplyRate };
  }, [industryList, unsubscribedList]);

  // --- Bar chart data (top 10 by volume) ---
  const barChartData = useMemo(() => {
    return industryList
      .filter(d => d.totalSent > 0 && d.industry !== 'Unknown')
      .slice(0, 10)
      .map(d => ({
        name: d.industry.length > 18 ? d.industry.substring(0, 18) + '...' : d.industry,
        'Open Rate': Number(getRateValue(d.totalOpened, d.totalSent).toFixed(1)),
        'Click Rate': Number(getRateValue(d.totalClicked, d.totalSent).toFixed(1)),
        'Reply Rate': Number(getRateValue(d.totalReplied, d.totalSent).toFixed(1)),
      }));
  }, [industryList]);

  // --- Donut data (conversion share by industry) ---
  const conversionDonutData = useMemo(() => {
    return industryList
      .filter(d => d.convertedLeads > 0)
      .sort((a, b) => b.convertedLeads - a.convertedLeads)
      .map((d, i) => ({
        name: d.industry,
        value: d.convertedLeads,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      }));
  }, [industryList]);

  const totalConversions = conversionDonutData.reduce((sum, d) => sum + d.value, 0);

  // --- Drill-down: prospects for selected industry ---
  const expandedProspects = useMemo(() => {
    if (!expandedIndustry) return [];
    const recipientsByProspect = new Map<string, { sent: number; opened: number; clicked: number; replied: boolean; bounced: boolean; unsubscribed: boolean }>();
    for (const r of allRecipients) {
      if (!r.prospect_id) continue;
      const prospect = prospectById.get(r.prospect_id);
      if ((prospect?.industry || 'Unknown') !== expandedIndustry) continue;
      const existing = recipientsByProspect.get(r.prospect_id) || { sent: 0, opened: 0, clicked: 0, replied: false, bounced: false, unsubscribed: false };
      if (r.sent_at) existing.sent++;
      if (r.first_opened_at || r.opened_at) existing.opened++;
      if (r.clicked_at) existing.clicked++;
      if (r.replied_at) existing.replied = true;
      if (r.bounced_at) existing.bounced = true;
      if (r.unsubscribed_at) existing.unsubscribed = true;
      recipientsByProspect.set(r.prospect_id, existing);
    }

    return prospects
      .filter(p => (p.industry || 'Unknown') === expandedIndustry)
      .map(p => ({
        prospect: p,
        engagement: recipientsByProspect.get(p.id) || { sent: 0, opened: 0, clicked: 0, replied: false, bounced: false, unsubscribed: false },
      }))
      .sort((a, b) => b.engagement.sent - a.engagement.sent);
  }, [expandedIndustry, prospects, allRecipients, prospectById]);

  // --- Sub-components ---
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
        <div className="h-full bg-[#522B47] rounded-full" style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
      </div>
    </div>
  );

  if (loading) return <SkeletonCards />;

  if (prospects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <Factory size={48} className="mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">No prospect data available</p>
        <p className="text-xs text-gray-400 mt-1">Industry analytics will appear once prospects are loaded</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto animate-fade-in">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          label="Industries"
          value={summaryStats.totalIndustries.toString()}
          subtext={`${summaryStats.totalProspectsWithIndustry.toLocaleString()} prospects tracked`}
          icon={Factory}
          borderColor="border-gray-200"
        />
        <StatCard
          label="Total Prospects"
          value={summaryStats.totalProspects.toLocaleString()}
          subtext={`across ${summaryStats.totalIndustries} industries`}
          icon={Users}
          borderColor="border-gray-200"
        />
        <StatCard
          label="Best Open Rate"
          value={summaryStats.bestOpenRate ? formatRate(summaryStats.bestOpenRate.totalOpened, summaryStats.bestOpenRate.totalSent) : 'N/A'}
          subtext={summaryStats.bestOpenRate?.industry || 'Not enough data'}
          icon={Eye}
          borderColor={summaryStats.bestOpenRate ? 'border-green-400' : 'border-gray-200'}
        />
        <StatCard
          label="Best Reply Rate"
          value={summaryStats.bestReplyRate ? formatRate(summaryStats.bestReplyRate.totalReplied, summaryStats.bestReplyRate.totalSent) : 'N/A'}
          subtext={summaryStats.bestReplyRate?.industry || 'Not enough data'}
          icon={MessageSquare}
          borderColor={summaryStats.bestReplyRate ? 'border-green-400' : 'border-gray-200'}
        />
        <StatCard
          label="Conversions"
          value={summaryStats.totalConversions.toLocaleString()}
          subtext={`${formatRate(summaryStats.totalConversions, summaryStats.totalProspects)} conversion rate`}
          icon={TrendingUp}
          borderColor={summaryStats.totalConversions > 0 ? 'border-green-400' : 'border-gray-200'}
        />
        <StatCard
          label="Unsubscribed"
          value={summaryStats.totalUnsubscribed.toLocaleString()}
          subtext={`${formatRate(summaryStats.totalUnsubscribed, allRecipients.filter(r => r.sent_at).length)} unsub rate`}
          icon={UserMinus}
          borderColor={summaryStats.totalUnsubscribed > 0 ? 'border-orange-400' : 'border-gray-200'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Bar Chart — Industry Engagement Comparison */}
        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
          <h3 className="font-serif font-bold text-lg mb-4">Industry Engagement Comparison</h3>
          {barChartData.length > 0 ? (
            <div className="h-[280px] w-full" role="img" aria-label="Bar chart comparing engagement rates across industries">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} barGap={2}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
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
                  <Bar dataKey="Open Rate" fill="#522B47" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="Click Rate" fill="#FBEA74" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="Reply Rate" fill="#22C55E" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              No email data to display yet
            </div>
          )}
          <div className="flex items-center justify-center gap-6 mt-3">
            {[
              { label: 'Open Rate', color: '#522B47' },
              { label: 'Click Rate', color: '#FBEA74' },
              { label: 'Reply Rate', color: '#22C55E' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut Chart — Conversions by Industry */}
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="font-serif font-bold text-lg mb-4">Conversions by Industry</h3>
          {conversionDonutData.length > 0 ? (
            <>
              <div className="h-[280px] relative" role="img" aria-label={`Conversion breakdown: ${conversionDonutData.map(d => `${d.name}: ${d.value}`).join(', ')}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={conversionDonutData}
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      animationDuration={300}
                    >
                      {conversionDonutData.map((entry, index) => (
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
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold font-serif">{totalConversions}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Conversions</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {conversionDonutData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] text-gray-500">{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              No conversions yet
            </div>
          )}
        </div>
      </div>

      {/* Industry Breakdown Table */}
      <div className="glass-card rounded-2xl flex-1 overflow-hidden flex flex-col mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-serif font-bold text-lg">Industry Breakdown</h3>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <caption className="sr-only">Industry performance breakdown</caption>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
                <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Industry</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Prospects</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Sent</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Open Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Click Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Reply Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Bounce Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Unsub Rate</th>
                <th scope="col" className="text-right py-3 px-4 font-semibold text-gray-600">Conversions</th>
                <th scope="col" className="w-10 py-3 px-2"><span className="sr-only">Expand</span></th>
              </tr>
            </thead>
            <tbody>
              {industryList.map(row => {
                const isExpanded = expandedIndustry === row.industry;
                const openRate = getRateValue(row.totalOpened, row.totalSent);
                const clickRate = getRateValue(row.totalClicked, row.totalSent);
                const replyRate = getRateValue(row.totalReplied, row.totalSent);
                const bounceRate = getRateValue(row.totalBounced, row.totalSent);
                const unsubRate = getRateValue(row.totalUnsubscribed, row.totalSent);

                return (
                  <React.Fragment key={row.industry}>
                    <tr
                      className={`border-b border-gray-50 hover:bg-white/60 transition-colors cursor-pointer ${isExpanded ? 'bg-white/80' : ''}`}
                      onClick={() => setExpandedIndustry(isExpanded ? null : row.industry)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedIndustry(isExpanded ? null : row.industry); } }}
                    >
                      <td className="py-3 px-4 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          {row.industry !== 'Unknown' && <Factory size={14} className="text-gray-400" />}
                          {row.industry}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{row.totalProspects.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{row.totalSent.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <InlineBar value={openRate} />
                          <span className="font-medium text-gray-900 w-12 text-right">{openRate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <InlineBar value={clickRate} max={50} />
                          <span className="font-medium text-gray-900 w-12 text-right">{clickRate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <InlineBar value={replyRate} max={20} />
                          <span className="font-medium text-gray-900 w-12 text-right">{replyRate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <InlineBar value={bounceRate} max={10} />
                          <span className="font-medium text-gray-900 w-12 text-right">{bounceRate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min((unsubRate / 10) * 100, 100)}%` }} />
                          </div>
                          <span className={`font-medium w-12 text-right ${row.totalUnsubscribed > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                            {unsubRate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          row.convertedLeads > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {row.convertedLeads}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {isExpanded
                          ? <ChevronUp size={14} className="text-gray-400 mx-auto" />
                          : <ChevronDown size={14} className="text-gray-400 mx-auto" />
                        }
                      </td>
                    </tr>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-100">
                            {/* Industry detail stat pills */}
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                              {[
                                { label: 'Prospects', value: row.totalProspects },
                                { label: 'Emails Sent', value: row.totalSent },
                                { label: 'Opened', value: row.totalOpened },
                                { label: 'Clicked', value: row.totalClicked },
                                { label: 'Replied', value: row.totalReplied },
                                { label: 'Converted', value: row.convertedLeads },
                              ].map(pill => (
                                <div key={pill.label} className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-xs border border-gray-100">
                                  <span className="text-gray-500">{pill.label}:</span>
                                  <span className="font-semibold text-gray-900">{pill.value}</span>
                                </div>
                              ))}
                              {row.totalUnsubscribed > 0 && (
                                <div className="flex items-center gap-1.5 bg-orange-50 rounded-full px-3 py-1.5 text-xs border border-orange-100">
                                  <UserMinus size={11} className="text-orange-500" />
                                  <span className="text-orange-500">Unsubscribed:</span>
                                  <span className="font-semibold text-orange-700">{row.totalUnsubscribed}</span>
                                </div>
                              )}
                            </div>

                            {/* Prospect list */}
                            {expandedProspects.length > 0 ? (
                              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                      <th className="text-left py-2 px-3 font-semibold text-gray-500">Name</th>
                                      <th className="text-left py-2 px-3 font-semibold text-gray-500">Company</th>
                                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Sent</th>
                                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Opened</th>
                                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Clicked</th>
                                      <th className="text-center py-2 px-3 font-semibold text-gray-500">Replied</th>
                                      <th className="text-center py-2 px-3 font-semibold text-gray-500">Unsub</th>
                                      <th className="text-center py-2 px-3 font-semibold text-gray-500">Converted</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedProspects.slice(0, 20).map(({ prospect: p, engagement: eng }) => (
                                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                        <td className="py-2 px-3 text-gray-900">{p.first_name} {p.last_name}</td>
                                        <td className="py-2 px-3 text-gray-500">{p.company_name || '—'}</td>
                                        <td className="py-2 px-3 text-right text-gray-600">{eng.sent}</td>
                                        <td className="py-2 px-3 text-right text-gray-600">{eng.opened}</td>
                                        <td className="py-2 px-3 text-right text-gray-600">{eng.clicked}</td>
                                        <td className="py-2 px-3 text-center">
                                          {eng.replied
                                            ? <span className="text-green-600 font-semibold">Yes</span>
                                            : <span className="text-gray-300">—</span>
                                          }
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          {eng.unsubscribed
                                            ? <UserMinus size={12} className="text-orange-500 mx-auto" />
                                            : <span className="text-gray-300">—</span>
                                          }
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          {p.converted_to_lead_id
                                            ? <span className="inline-flex items-center gap-1 text-green-600 font-semibold"><Award size={12} /> Yes</span>
                                            : <span className="text-gray-300">—</span>
                                          }
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {expandedProspects.length > 20 && (
                                  <div className="px-3 py-2 text-xs text-gray-400 text-center border-t border-gray-100">
                                    Showing 20 of {expandedProspects.length} prospects
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">No prospect details available for this industry.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unsubscribed Recipients List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <UserMinus size={18} className="text-orange-500" aria-hidden="true" />
          <h3 className="font-serif font-bold text-lg">Unsubscribed Recipients</h3>
          {unsubscribedList.length > 0 && (
            <span className="ml-auto px-2.5 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
              {unsubscribedList.length} total
            </span>
          )}
        </div>

        {unsubscribedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <UserMinus size={36} className="mb-3 opacity-30" aria-hidden="true" />
            <p className="text-sm">No unsubscribes recorded yet</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">List of recipients who unsubscribed</caption>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Prospect</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Email</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Campaign</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Email in Sequence</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Reason</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-600">Unsubscribed</th>
                </tr>
              </thead>
              <tbody>
                {unsubscribedList.map(({ recipient, prospect, campaign, email }) => (
                  <tr key={recipient.id} className="border-b border-gray-50 hover:bg-white/60 transition-colors">
                    <td className="py-3 px-4">
                      {prospect ? (
                        <>
                          <p className="font-medium text-gray-900">{prospect.first_name} {prospect.last_name}</p>
                          {prospect.company_name && (
                            <p className="text-xs text-gray-400">{prospect.company_name}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Unknown prospect</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{prospect?.email || '—'}</td>
                    <td className="py-3 px-4">
                      {campaign ? (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-800 font-medium">{campaign.name}</span>
                          {campaign.status && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              campaign.status === 'active' || campaign.status === 'sending' ? 'bg-green-100 text-green-700' :
                              campaign.status === 'paused' ? 'bg-orange-100 text-orange-600' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {campaign.status}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Unknown campaign</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {email ? (
                        <div>
                          <p className="text-gray-800 font-medium">{email.name || `Email ${email.order ?? '?'}`}</p>
                          {email.subject && (
                            <p className="text-xs text-gray-400 truncate max-w-[200px]">{email.subject}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-[240px]">
                      {recipient.unsubscribe_reason ? (
                        <p className="text-xs text-gray-600 leading-relaxed">{recipient.unsubscribe_reason}</p>
                      ) : (
                        <span className="text-gray-300 text-xs italic">No reason provided</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-orange-600 whitespace-nowrap">
                      {new Date(recipient.unsubscribed_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IndustryAnalyticsTab;
