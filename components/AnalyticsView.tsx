import React, { useState, useMemo, useCallback } from 'react';
import { useUser } from '../contexts/UserContext';
import ColdProspectsTab from './analytics/ColdProspectsTab';
import OutreachStageTab from './analytics/OutreachStageTab';
import InteractionActivityTab from './analytics/InteractionActivityTab';

type TabId = 'cold-prospects' | 'outreach-stage' | 'interaction-activity';

const AnalyticsView: React.FC = () => {
  const { hasPermission } = useUser();
  const canViewProspects = hasPermission('prospects');
  const [activeTab, setActiveTab] = useState<TabId>(canViewProspects ? 'cold-prospects' : 'outreach-stage');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  const tabs: { id: TabId; label: string }[] = useMemo(() => {
    const t: { id: TabId; label: string }[] = [];
    if (canViewProspects) t.push({ id: 'cold-prospects', label: 'Cold Prospects' });
    t.push({ id: 'outreach-stage', label: 'Outreach Stage' });
    t.push({ id: 'interaction-activity', label: 'Interaction Activity' });
    return t;
  }, [canViewProspects]);

  const handleNavigateToCampaign = useCallback((campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setActiveTab('outreach-stage');
  }, []);

  const handleTabKeyDown = (e: React.KeyboardEvent, tabIndex: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (tabIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIdx].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (tabIndex - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prevIdx].id);
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-black mb-2">Analytics</h2>
          <p className="text-gray-500">Track your cold outreach pipeline and campaign performance.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6" role="tablist" aria-label="Analytics sections">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-black text-white shadow-lg shadow-black/20'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'cold-prospects' && (
          <div role="tabpanel" id="panel-cold-prospects" aria-labelledby="tab-cold-prospects" className="h-full">
            <ColdProspectsTab />
          </div>
        )}

        {activeTab === 'outreach-stage' && (
          <div role="tabpanel" id="panel-outreach-stage" aria-labelledby="tab-outreach-stage" className="h-full">
            <OutreachStageTab initialCampaignId={selectedCampaignId || undefined} />
          </div>
        )}

        {activeTab === 'interaction-activity' && (
          <div role="tabpanel" id="panel-interaction-activity" aria-labelledby="tab-interaction-activity" className="h-full">
            <InteractionActivityTab onNavigateToCampaign={handleNavigateToCampaign} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsView;
