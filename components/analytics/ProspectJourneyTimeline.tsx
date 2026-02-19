import React, { useMemo } from 'react';
import { EmailCampaignRecipient, EmailToCampaign, Prospect } from '../../types';
import { Eye, MousePointerClick, Send, Mail, AlertTriangle, ArrowRight, FileText, Mailbox, MessageSquareReply, UserX } from 'lucide-react';

interface Props {
  journey: EmailCampaignRecipient[];
  emailInfoMap: Map<string, EmailToCampaign>;
  prospectName: string;
  prospect?: Prospect;
}

const ProspectJourneyTimeline: React.FC<Props> = ({ journey, emailInfoMap, prospectName, prospect }) => {
  // Sort journey ascending by step number, guaranteeing left-to-right order
  const sortedJourney = useMemo(() => {
    return [...journey].sort((a, b) => {
      const stepA = a.current_email_step || emailInfoMap.get(a.email_to_campaign_id || '')?.order || 999;
      const stepB = b.current_email_step || emailInfoMap.get(b.email_to_campaign_id || '')?.order || 999;
      return stepA - stepB;
    });
  }, [journey, emailInfoMap]);

  // Find the index of the first email (lowest step) — milestones go after this
  const firstEmailIdx = 0; // After sorting, index 0 is always the first email

  if (sortedJourney.length === 0) {
    return (
      <p className="text-xs text-gray-500 py-2">No email journey data synced yet for this prospect.</p>
    );
  }

  const getStepStatus = (step: EmailCampaignRecipient) => {
    if (step.bounced_at) return { level: 'bounced', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100 text-red-600', label: 'Bounced' } as const;
    if (step.unsubscribed_at) return { level: 'unsubscribed', icon: UserX, color: 'text-orange-500', bg: 'bg-orange-100 text-orange-600', label: 'Unsubscribed' } as const;
    if (step.replied_at) return { level: 'replied', icon: MessageSquareReply, color: 'text-green-600', bg: 'bg-green-600 text-white', label: 'Replied' } as const;
    if (step.clicked_at) return { level: 'clicked', icon: MousePointerClick, color: 'text-green-600', bg: 'bg-black text-white', label: 'Clicked' } as const;
    if (step.opened_at) return { level: 'opened', icon: Eye, color: 'text-blue-600', bg: 'bg-black text-white', label: `Opened${step.open_count && step.open_count > 1 ? ` ${step.open_count}x` : ''}` } as const;
    if (step.delivered_at) return { level: 'delivered', icon: Mail, color: 'text-gray-600', bg: 'bg-gray-300 text-gray-700', label: 'Delivered' } as const;
    if (step.sent_at) return { level: 'sent', icon: Send, color: 'text-gray-500', bg: 'bg-gray-200 text-gray-600', label: 'Sent' } as const;
    return { level: 'pending', icon: ArrowRight, color: 'text-gray-400', bg: 'bg-gray-100 text-gray-400 border border-dashed border-gray-300', label: 'Pending' } as const;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getDateForStep = (step: EmailCampaignRecipient): string | null => {
    if (step.replied_at) return formatDate(step.replied_at);
    if (step.clicked_at) return formatDate(step.clicked_at);
    if (step.opened_at) return formatDate(step.opened_at);
    if (step.delivered_at) return formatDate(step.delivered_at);
    if (step.sent_at) return formatDate(step.sent_at);
    if (step.bounced_at) return formatDate(step.bounced_at);
    if (step.unsubscribed_at) return formatDate(step.unsubscribed_at);
    return null;
  };

  // Build milestone nodes to inject after Email 1
  const milestones: { icon: React.ElementType; label: string; date?: string; color: string; bg: string }[] = [];
  if (prospect) {
    if (prospect.received_customer_research_report) {
      milestones.push({
        icon: FileText,
        label: 'Report Received',
        date: prospect.date_received_report ? formatDate(prospect.date_received_report) : undefined,
        color: 'text-emerald-600',
        bg: 'bg-emerald-100 text-emerald-700',
      });
    }
    if (prospect.added_to_mailchimp) {
      milestones.push({
        icon: Mailbox,
        label: 'MailChimp Added',
        color: 'text-violet-600',
        bg: 'bg-violet-100 text-violet-700',
      });
    }
  }

  const getLineColor = (status: ReturnType<typeof getStepStatus>) => {
    if (status.level === 'replied' || status.level === 'opened' || status.level === 'clicked') return 'bg-black';
    if (status.level === 'sent' || status.level === 'delivered') return 'bg-gray-300';
    return 'bg-gray-200';
  };

  return (
    <div
      className="bg-gray-50/80 px-6 py-5 border-b border-gray-100 animate-slide-up"
      role="region"
      aria-label={`Email journey for ${prospectName}`}
    >
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Email Journey</h4>

      <div className="flex items-start gap-0 overflow-x-auto pb-2" role="list">
        {sortedJourney.map((step, idx) => {
          const emailInfo = step.email_to_campaign_id ? emailInfoMap.get(step.email_to_campaign_id) : null;
          const stepNumber = step.current_email_step || emailInfo?.order || idx + 1;
          const emailName = emailInfo?.name || emailInfo?.subject || `Email ${stepNumber}`;
          const status = getStepStatus(step);
          const StatusIcon = status.icon;
          const date = getDateForStep(step);
          const hasMoreAfter = idx < sortedJourney.length - 1;
          const hasMilestonesAfter = idx === firstEmailIdx && milestones.length > 0;

          return (
            <React.Fragment key={step.id}>
              {/* Email step node */}
              <div className="flex items-start flex-shrink-0" role="listitem">
                <div className="flex flex-col items-center" style={{ width: '80px' }}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${status.bg}`}>
                    {stepNumber}
                  </div>
                  <p className="text-[10px] font-medium text-gray-700 mt-2 text-center leading-tight line-clamp-2 max-w-[76px]">
                    {emailName}
                  </p>
                  <div className={`flex items-center gap-1 mt-1 ${status.color}`}>
                    <StatusIcon size={10} aria-hidden="true" />
                    <span className="text-[9px] font-medium">{status.label}</span>
                  </div>
                  {date && (
                    <span className="text-[9px] text-gray-400 mt-0.5">{date}</span>
                  )}
                </div>

                {/* Connecting line to milestones or next email (only if there's something after) */}
                {(hasMoreAfter || hasMilestonesAfter) && !hasMilestonesAfter && (
                  <div className="flex items-center pt-3.5 px-0">
                    <div className={`h-0.5 w-6 ${getLineColor(status)}`} />
                  </div>
                )}
              </div>

              {/* Inject milestones after the first email step */}
              {hasMilestonesAfter && (
                <>
                  {milestones.map((m, mIdx) => (
                    <div key={`milestone-${mIdx}`} className="flex items-start flex-shrink-0" role="listitem">
                      <div className="flex items-center pt-3 px-0">
                        <div className={`h-0.5 w-6 ${getLineColor(status)}`} />
                      </div>
                      <div className="flex flex-col items-center" style={{ width: '72px' }}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${m.bg}`}>
                          <m.icon size={12} aria-hidden="true" />
                        </div>
                        <p className="text-[9px] font-medium text-gray-700 mt-1.5 text-center leading-tight line-clamp-2 max-w-[68px]">
                          {m.label}
                        </p>
                        {m.date && (
                          <span className="text-[9px] text-gray-400 mt-0.5">{m.date}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Connecting line from last milestone to next email step */}
                  {hasMoreAfter && (
                    <div className="flex items-center pt-3 px-0">
                      <div className="h-0.5 w-6 bg-black" />
                    </div>
                  )}
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default ProspectJourneyTimeline;
