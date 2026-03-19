import React, { useState, useMemo, useEffect } from 'react';
import { ProspectToCall, ProspectToCallStatus } from '../types';
import { emailCampaignService } from '../services/supabaseService';
import {
  PhoneCall, UserPlus, Eye, MousePointerClick, Loader2,
  ChevronDown, ChevronUp, Clock, Building2, Mail, Phone, GripVertical, Star, X,
} from 'lucide-react';

interface ProspectsToCallViewProps {
  prospectsToCall: ProspectToCall[];
  onStatusUpdate: (id: string, status: ProspectToCallStatus, notes?: string) => Promise<void>;
  onMarkAsCalled: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onConvertToLead: (prospectToCall: ProspectToCall) => Promise<void>;
  onNavigate: (view: string) => void;
}

const COLUMNS: { id: ProspectToCallStatus; label: string; headerBg: string; headerText: string; borderColor: string; dropBg: string }[] = [
  { id: 'new',       label: 'New',       headerBg: 'bg-blue-600',   headerText: 'text-white', borderColor: 'border-blue-200',   dropBg: 'bg-blue-50/60' },
  { id: 'called',    label: 'Called',    headerBg: 'bg-green-600',  headerText: 'text-white', borderColor: 'border-green-200',  dropBg: 'bg-green-50/60' },
  { id: 'promising', label: 'Promising', headerBg: 'bg-[#522B47]',  headerText: 'text-white', borderColor: 'border-purple-200', dropBg: 'bg-purple-50/60' },
  { id: 'dismissed', label: 'Dismissed', headerBg: 'bg-gray-400',   headerText: 'text-white', borderColor: 'border-gray-200',   dropBg: 'bg-gray-50/60' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function engagementScore(p: ProspectToCall): number {
  return (p.total_opens || 0) + (p.total_clicks || 0) * 2;
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  ptc: ProspectToCall;
  campaignName?: string;
  loadingId: string | null;
  onAction: (id: string, action: () => Promise<void>) => Promise<void>;
  onStatusUpdate: (id: string, status: ProspectToCallStatus, notes?: string) => Promise<void>;
  onMarkAsCalled: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onConvertToLead: (ptc: ProspectToCall) => Promise<void>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

const ProspectCard: React.FC<CardProps> = ({
  ptc, campaignName, loadingId, onAction, onStatusUpdate, onMarkAsCalled, onDismiss, onConvertToLead,
  onDragStart, onDragEnd, isDragging,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | undefined>(undefined);
  const isLoading = loadingId === ptc.id;
  const score = engagementScore(ptc);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ptc.id)}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm transition-all duration-200 select-none motion-reduce:transition-none
        ${isDragging ? 'opacity-40 motion-reduce:opacity-100 scale-95 motion-reduce:scale-100' : 'hover:shadow-md cursor-grab active:cursor-grabbing'}
      `}
    >
      {/* Card header row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-3">
          {/* Drag handle hint */}
          <GripVertical size={14} className="text-gray-300 mt-1 shrink-0" />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-black truncate leading-tight">
                  {ptc.prospect_name || 'Unknown'}
                </p>
                {ptc.prospect_company && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{ptc.prospect_company}</p>
                )}
              </div>
              {/* Engagement score badge */}
              <div className="w-7 h-7 rounded-full bg-[#522B47] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-xs">{score}</span>
              </div>
            </div>

            {/* Engagement stats */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Eye size={11} className="text-blue-500" />
                <span>{ptc.total_opens}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <MousePointerClick size={11} className="text-green-500" />
                <span>{ptc.total_clicks}</span>
              </div>
              {campaignName && (
                <span className="text-xs text-gray-400 truncate max-w-[100px]" title={campaignName}>
                  {campaignName}
                </span>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                <Clock size={10} />
                <span>{timeAgo(ptc.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick action: Convert to Lead — always visible */}
        {ptc.status !== 'converted' && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
            <button
              onClick={(e) => { e.stopPropagation(); onAction(ptc.id, () => onConvertToLead(ptc)); }}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#EBD3C1]/40 text-[#522B47] hover:bg-[#EBD3C1]/70 border border-[#EBD3C1] transition-colors duration-150 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522B47]/50"
            >
              {isLoading ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
              Convert to Lead
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522B47]/50 rounded"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{expanded ? 'Less' : 'More'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {/* Contact info */}
          <div className="space-y-1.5 mb-3 mt-2">
            <div className="flex items-center gap-2 text-xs">
              <Mail size={11} className="text-gray-400 shrink-0" />
              <a href={`mailto:${ptc.prospect_email}`} className="text-[#522B47] hover:underline truncate">
                {ptc.prospect_email}
              </a>
            </div>
            {ptc.prospect_phone && (
              <div className="flex items-center gap-2 text-xs">
                <Phone size={11} className="text-gray-400 shrink-0" />
                <a href={`tel:${ptc.prospect_phone}`} className="text-[#522B47] hover:underline">
                  {ptc.prospect_phone}
                </a>
              </div>
            )}
            {ptc.prospect_company && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Building2 size={11} className="text-gray-400 shrink-0" />
                <span>{ptc.prospect_company}</span>
              </div>
            )}
          </div>

          {/* Engagement grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-blue-50/50 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-blue-600">{ptc.total_opens}</div>
              <div className="text-xs text-gray-500">Opens</div>
            </div>
            <div className="bg-green-50/50 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-green-600">{ptc.total_clicks}</div>
              <div className="text-xs text-gray-500">Clicks</div>
            </div>
          </div>

          {/* Notes */}
          <textarea
            value={notesDraft ?? ptc.notes ?? ''}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Add notes..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#522B47]/30 resize-none"
            rows={2}
            onClick={(e) => e.stopPropagation()}
          />
          {notesDraft !== undefined && notesDraft !== (ptc.notes ?? '') && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction(ptc.id, () => onStatusUpdate(ptc.id, ptc.status, notesDraft)); setNotesDraft(undefined); }}
              disabled={isLoading}
              className="mt-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-[#522B47] text-white hover:bg-[#3d1f35] transition-colors duration-150 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522B47]/50"
            >
              Save Notes
            </button>
          )}

          {/* Secondary actions */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
            {ptc.status === 'new' && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(ptc.id, () => onMarkAsCalled(ptc.id)); }}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors duration-150 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50"
              >
                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <PhoneCall size={11} />}
                Mark Called
              </button>
            )}
            {(ptc.status === 'new' || ptc.status === 'called') && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(ptc.id, () => onStatusUpdate(ptc.id, 'promising')); }}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors duration-150 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
              >
                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} />}
                Mark Promising
              </button>
            )}
            {ptc.status !== 'dismissed' && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(ptc.id, () => onDismiss(ptc.id)); }}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors duration-150 cursor-pointer disabled:opacity-50 ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50"
              >
                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                Dismiss
              </button>
            )}
          </div>

          {ptc.called_at && (
            <p className="text-xs text-gray-400 mt-2">Called {new Date(ptc.called_at).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main View ────────────────────────────────────────────────────────────────

const ProspectsToCallView: React.FC<ProspectsToCallViewProps> = ({
  prospectsToCall,
  onStatusUpdate,
  onMarkAsCalled,
  onDismiss,
  onConvertToLead,
  onNavigate,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProspectToCallStatus | null>(null);
  const [campaignNames, setCampaignNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    emailCampaignService.getAll().then((campaigns) => {
      const nameMap = new Map<string, string>();
      campaigns.forEach((c) => nameMap.set(c.id, c.name));
      setCampaignNames(nameMap);
    }).catch(console.error);
  }, []);

  // Sort by engagement score desc within each column
  const byColumn = useMemo(() => {
    const map: Record<ProspectToCallStatus, ProspectToCall[]> = {
      new: [], called: [], promising: [], converted: [], dismissed: [],
    };
    for (const p of prospectsToCall) {
      if (p.status in map) map[p.status].push(p);
    }
    for (const key of Object.keys(map) as ProspectToCallStatus[]) {
      map[key].sort((a, b) => engagementScore(b) - engagementScore(a));
    }
    return map;
  }, [prospectsToCall]);

  const convertedCount = byColumn.converted.length;

  const handleAction = async (id: string, action: () => Promise<void>) => {
    setLoadingId(id);
    try { await action(); } catch (err) { console.error('Action failed:', err); } finally { setLoadingId(null); }
  };

  // ── Drag handlers ──
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: ProspectToCallStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(colId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: ProspectToCallStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const card = prospectsToCall.find((p) => p.id === id);
    if (!card || card.status === targetStatus) return;

    if (targetStatus === 'called') {
      await handleAction(id, () => onMarkAsCalled(id));
    } else if (targetStatus === 'dismissed') {
      await handleAction(id, () => onDismiss(id));
    } else {
      await handleAction(id, () => onStatusUpdate(id, targetStatus));
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-3xl font-serif font-bold text-black mb-2">Prospects to Call</h2>
          <p className="text-gray-500 text-sm">
            Drag cards between columns to track your cold-call pipeline.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <PhoneCall size={15} />
            <span><strong className="text-black">{byColumn.new.length}</strong> new</span>
          </div>
          {convertedCount > 0 && (
            <button
              onClick={() => onNavigate('leads')}
              className="flex items-center gap-1.5 text-[#522B47] hover:underline transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522B47]/50 rounded"
            >
              <UserPlus size={15} />
              <span>{convertedCount} converted → Leads</span>
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-5 h-full min-w-max pb-4">
          {COLUMNS.map((col) => {
            const cards = byColumn[col.id];
            const isOver = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`flex flex-col w-72 rounded-2xl border-2 transition-all duration-200 motion-reduce:transition-none ${
                  isOver
                    ? `${col.borderColor} ${col.dropBg} shadow-lg scale-[1.01] motion-reduce:scale-100`
                    : 'border-transparent bg-gray-100/60'
                }`}
              >
                {/* Column header */}
                <div className={`${col.headerBg} ${col.headerText} rounded-xl mx-2 mt-2 px-4 py-2.5 flex items-center justify-between`}>
                  <span className="font-semibold text-sm tracking-wide">{col.label}</span>
                  <span className="text-xs opacity-80 font-medium bg-white/20 px-2 py-0.5 rounded-full">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-3 min-h-[200px]">
                  {cards.length === 0 && (
                    <div className={`h-full flex items-center justify-center text-xs text-gray-400 rounded-xl border-2 border-dashed min-h-[100px] transition-colors ${isOver ? col.borderColor : 'border-gray-200'}`}>
                      Drop here
                    </div>
                  )}
                  {cards.map((ptc) => (
                    <ProspectCard
                      key={ptc.id}
                      ptc={ptc}
                      campaignName={ptc.campaign_id ? campaignNames.get(ptc.campaign_id) : undefined}
                      loadingId={loadingId}
                      onAction={handleAction}
                      onStatusUpdate={onStatusUpdate}
                      onMarkAsCalled={onMarkAsCalled}
                      onDismiss={onDismiss}
                      onConvertToLead={onConvertToLead}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingId === ptc.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProspectsToCallView;
