import React, { useState, useEffect, useRef } from 'react';
import { Lead, LeadStatus, Message, EmailCampaignRecipient, EmailToCampaign } from '../types';
import {
    Plus, Search, Filter, LayoutGrid, List, RefreshCw, Download, Edit3,
    MoreHorizontal, ChevronRight, Star, Send, X,
    ArrowLeft, Mail, Phone, Loader2, Trash2, ChevronDown, Clock, Eye, FileSearch, Linkedin
} from 'lucide-react';
import { emailCampaignService } from '../services/supabaseService';
import toast from 'react-hot-toast';
import { useUser } from '../contexts/UserContext';

interface LeadsBoardProps {
    leads: Lead[];
    messages: Message[];
    onUpdateStatus: (leadId: string, newStatus: LeadStatus) => void;
    onCreateLead: (lead: Omit<Lead, 'id' | 'created_at'>) => Promise<void>;
    onDeleteLead: (leadId: string) => Promise<void>;
    onUpdateLead: (lead: Lead) => Promise<void>;
    onRefreshLeads: () => Promise<void>;
    onNavigate: (view: string) => void;
}

const STATUS_OPTIONS = Object.values(LeadStatus);
const STATUS_COLORS: Record<string, string> = {
    New: 'bg-blue-100 text-blue-700',
    Contacted: 'bg-yellow-100 text-yellow-700',
    Qualified: 'bg-purple-100 text-purple-700',
    Proposal: 'bg-orange-100 text-orange-700',
    Won: 'bg-green-100 text-green-700',
    Lost: 'bg-red-100 text-red-700',
};

const LeadsBoard: React.FC<LeadsBoardProps> = ({
    leads, messages, onUpdateStatus, onCreateLead, onDeleteLead, onUpdateLead, onRefreshLeads, onNavigate
}) => {
    const { hasPermission, teamMembers, currentUser } = useUser();
    const canDelete = hasPermission('delete_leads');
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leads[0]?.id || null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showNewLeadModal, setShowNewLeadModal] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Detail panel state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Lead>>({});
    const [notes, setNotes] = useState('');
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    // Row action dropdown
    const [activeRowMenu, setActiveRowMenu] = useState<string | null>(null);
    const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // New lead form
    const [newLeadForm, setNewLeadForm] = useState({
        first_name: '', last_name: '', email: '', phone: '', company: '',
        value: 0, status: LeadStatus.NEW, source: ''
    });
    const [isCreating, setIsCreating] = useState(false);

    // Outreach summary for converted prospects
    const [outreachSummary, setOutreachSummary] = useState<{ lastEmail?: string; respondedTo?: string; step?: number; total?: number } | null>(null);
    const [isResearching, setIsResearching] = useState(false);

    const filterRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const selectedLead = leads.find(l => l.id === selectedLeadId);

    // Sync notes when lead changes
    useEffect(() => {
        if (selectedLead) {
            setNotes(selectedLead.notes || '');
            setIsEditing(false);
            setEditForm({});
        }
    }, [selectedLeadId]);

    // Load outreach summary for leads with prospect_id
    useEffect(() => {
        if (!selectedLead?.prospect_id) {
            setOutreachSummary(null);
            return;
        }
        emailCampaignService.getProspectJourney(selectedLead.prospect_id).then(async (journey) => {
            if (journey.length === 0) {
                setOutreachSummary(null);
                return;
            }
            // Get email names
            const emailIds = journey.map(j => j.email_to_campaign_id).filter(Boolean) as string[];
            let emailNames = new Map<string, string>();
            if (emailIds.length > 0) {
                const campaigns = await emailCampaignService.getAll();
                for (const c of campaigns) {
                    const emails = await emailCampaignService.getEmails(c.id);
                    for (const e of emails) {
                        emailNames.set(e.id, e.name || e.subject || `Email ${e.order || '?'}`);
                    }
                }
            }
            const lastSent = [...journey].reverse().find(j => j.sent_at);
            const lastOpened = [...journey].reverse().find(j => j.opened_at);
            const responded = [...journey].reverse().find(j => j.replied_at);
            const highestStep = Math.max(...journey.map(j => j.current_email_step || 0));

            setOutreachSummary({
                lastEmail: lastSent?.email_to_campaign_id ? emailNames.get(lastSent.email_to_campaign_id) : undefined,
                respondedTo: (responded?.email_to_campaign_id ? emailNames.get(responded.email_to_campaign_id) : undefined) ||
                             (lastOpened?.email_to_campaign_id ? emailNames.get(lastOpened.email_to_campaign_id) : undefined),
                step: highestStep,
                total: emailNames.size || undefined,
            });
        }).catch(() => setOutreachSummary(null));
    }, [selectedLead?.prospect_id]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowFilterDropdown(false);
            }
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setActiveRowMenu(null);
                setShowStatusSubmenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Filter & search
    const filteredLeads = leads.filter(l => {
        const matchesSearch = !searchTerm ||
            `${l.first_name} ${l.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterStatus === 'All' || l.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    // Derived Stats
    const activeCount = leads.filter(l => l.status !== LeadStatus.LOST && l.status !== LeadStatus.WON).length;

    // Progress bar segments
    const statusCounts = STATUS_OPTIONS.map(s => leads.filter(l => l.status === s).length);
    const total = leads.length || 1;
    const segments = statusCounts.map(c => Math.max((c / total) * 100, 0));

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await onRefreshLeads();
            toast.success('Leads refreshed');
        } catch { toast.error('Failed to refresh'); }
        setIsRefreshing(false);
    };

    const exportCSV = () => {
        const headers = ['Name', 'Email', 'Phone', 'Company', 'Value', 'Status', 'Source', 'Created'];
        const rows = filteredLeads.map(l => [
            `"${l.first_name} ${l.last_name}"`, l.email, l.phone || '', `"${l.company}"`,
            l.value.toString(), l.status, l.source, l.created_at
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${filteredLeads.length} leads`);
    };

    const handleCreateLead = async () => {
        if (!newLeadForm.first_name.trim() || !newLeadForm.last_name.trim() || !newLeadForm.email.trim()) return;
        setIsCreating(true);
        try {
            await onCreateLead(newLeadForm);
            setShowNewLeadModal(false);
            setNewLeadForm({ first_name: '', last_name: '', email: '', phone: '', company: '', value: 0, status: LeadStatus.NEW, source: '' });
            toast.success('Lead created');
        } catch { toast.error('Failed to create lead'); }
        setIsCreating(false);
    };

    const handleSaveEdit = async () => {
        if (!selectedLead) return;
        const updated = { ...selectedLead, ...editForm };
        try {
            await onUpdateLead(updated);
            setIsEditing(false);
            setEditForm({});
            toast.success('Lead updated');
        } catch { toast.error('Failed to update lead'); }
    };

    const handleSaveNotes = async () => {
        if (!selectedLead) return;
        setIsSavingNotes(true);
        try {
            await onUpdateLead({ ...selectedLead, notes });
            toast.success('Notes saved');
        } catch { toast.error('Failed to save notes'); }
        setIsSavingNotes(false);
    };

    const handleDeleteLead = async () => {
        if (!activeRowMenu) return;
        try {
            await onDeleteLead(activeRowMenu);
            if (selectedLeadId === activeRowMenu) setSelectedLeadId(null);
            setActiveRowMenu(null);
            setShowDeleteConfirm(false);
            toast.success('Lead deleted');
        } catch { toast.error('Failed to delete lead'); }
    };

    // Activity timeline for selected lead
    const leadMessages = messages
        .filter(m => m.lead_id === selectedLeadId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

    return (
        <div className="h-full flex flex-col gap-6 animate-fade-in pb-2 min-h-0">

            {/* 1. Page Header & Actions */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 flex-shrink-0">
                <div>
                    <h2 className="text-3xl font-serif font-bold text-black leading-tight">Customers & Leads</h2>
                    <p className="text-gray-500 text-sm">Manage your pipeline and relationships</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 xl:flex-none xl:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white/50 border border-white/60 rounded-full py-2.5 pl-9 pr-4 text-sm focus:ring-2 focus:ring-black/5 focus:bg-white outline-none shadow-sm cursor-text"
                        />
                    </div>

                    {/* Filter */}
                    <div className="relative" ref={filterRef}>
                        <button
                            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                            className={`flex items-center gap-2 bg-white px-4 py-2.5 rounded-full text-sm font-medium border transition-colors shadow-sm cursor-pointer ${
                                filterStatus !== 'All' ? 'border-black bg-black/5' : 'border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <Filter size={16} />
                            {filterStatus === 'All' ? 'Filter' : filterStatus}
                            <ChevronDown size={14} />
                        </button>
                        {showFilterDropdown && (
                            <div className="absolute top-12 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 min-w-[160px] z-50">
                                <button
                                    onClick={() => { setFilterStatus('All'); setShowFilterDropdown(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer ${filterStatus === 'All' ? 'font-bold' : ''}`}
                                >
                                    All Leads
                                </button>
                                {STATUS_OPTIONS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => { setFilterStatus(s); setShowFilterDropdown(false); }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer ${filterStatus === s ? 'font-bold' : ''}`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]?.split(' ')[0] || 'bg-gray-300'}`} />
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* New Customer */}
                    <button
                        onClick={() => setShowNewLeadModal(true)}
                        className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-full hover:bg-[#3D1F35] shadow-lg shadow-black/20 transition-all active:scale-95 cursor-pointer"
                    >
                        <span className="font-medium">New Customer</span>
                        <Plus size={16} className="bg-white/20 rounded-full p-0.5" />
                    </button>
                </div>
            </div>

            {/* 2. Stats Row */}
            <div className="grid grid-cols-3 gap-8 px-2">
                <div>
                    <p className="text-2xl font-serif font-bold text-gray-900">{leads.length}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Total Leads</p>
                </div>
                <div>
                    <p className="text-2xl font-serif font-bold text-gray-900">{activeCount}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Active Deals</p>
                </div>
                <div>
                    <p className="text-2xl font-serif font-bold text-gray-900">{leads.filter(l => l.status === LeadStatus.WON).length}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Won</p>
                </div>
            </div>

            {/* 3. Segmented Progress Bar */}
            <div className="w-full h-4 rounded-full flex overflow-hidden shadow-inner">
                {segments.map((pct, i) => (
                    <div key={STATUS_OPTIONS[i]} className={`h-full ${
                        ['bg-blue-400', 'bg-yellow-400', 'bg-purple-400', 'bg-orange-400', 'bg-green-500', 'bg-red-400'][i]
                    }`} style={{ width: `${pct}%` }} title={`${STATUS_OPTIONS[i]}: ${statusCounts[i]}`} />
                ))}
            </div>

            {/* 4. Split Layout (List + Detail) */}
            <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">

                {/* LEFT: List View */}
                <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col glass-card rounded-3xl overflow-hidden">
                    {/* List Header */}
                    <div className="p-6 pb-2">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <h3 className="font-serif font-bold text-xl">All Leads</h3>
                                <button
                                    onClick={() => setShowNewLeadModal(true)}
                                    className="p-1.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 shadow-sm transition-all cursor-pointer"
                                    aria-label="Add new lead"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex bg-gray-100 rounded-full p-1">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        aria-label="List view"
                                        className={`p-1.5 rounded-full transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                                    >
                                        <List size={16} />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        aria-label="Grid view"
                                        className={`p-1.5 rounded-full transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                                    >
                                        <LayoutGrid size={16} />
                                    </button>
                                </div>
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="p-2 text-gray-400 hover:text-black cursor-pointer disabled:opacity-50"
                                    aria-label="Refresh leads"
                                >
                                    <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                                </button>
                                <button
                                    onClick={exportCSV}
                                    className="p-2 text-gray-400 hover:text-black cursor-pointer"
                                    aria-label="Export as CSV"
                                >
                                    <Download size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200/50">
                            <div className="col-span-5">Name</div>
                            <div className="col-span-4">Phone</div>
                            <div className="col-span-3 text-right">Action</div>
                        </div>
                    </div>

                    {/* List Content */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {filteredLeads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Search size={40} className="opacity-30 mb-3" />
                                <p className="text-sm font-medium">No leads found</p>
                                <p className="text-xs mt-1">{searchTerm || filterStatus !== 'All' ? 'Try adjusting your search or filter' : 'Create your first lead to get started'}</p>
                            </div>
                        ) : (
                            filteredLeads.map((lead) => (
                                <div
                                    key={lead.id}
                                    onClick={() => setSelectedLeadId(lead.id)}
                                    className={`
                                    group grid grid-cols-12 gap-4 items-center px-4 py-4 mb-2 rounded-2xl cursor-pointer transition-all duration-200 border
                                    ${selectedLeadId === lead.id
                                            ? 'bg-black/5 border-black/10 shadow-sm'
                                            : 'border-transparent hover:bg-white/60 hover:border-white'
                                        }
                                `}
                                >
                                    <div className="col-span-5 flex items-center gap-3">
                                        {lead.avatar_url ? (
                                            <img src={lead.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-accent-beige flex items-center justify-center font-serif font-bold text-sm">
                                                {lead.first_name[0]}{lead.last_name[0]}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm truncate text-gray-700">
                                                {lead.first_name} {lead.last_name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">{lead.company}</p>
                                        </div>
                                        {lead.assigned_to && (() => {
                                            const assignee = teamMembers.find(m => m.id === lead.assigned_to);
                                            if (!assignee) return null;
                                            const initials = assignee.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
                                            return (
                                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0" title={assignee.full_name}>
                                                    {initials}
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    <div className="col-span-4 text-sm text-gray-600">
                                        {lead.phone || 'N/A'}
                                    </div>

                                    <div className="col-span-3 flex items-center justify-end gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (lead.status === LeadStatus.NEW) {
                                                    onUpdateStatus(lead.id, LeadStatus.CONTACTED);
                                                    onNavigate('contact');
                                                } else {
                                                    setSelectedLeadId(lead.id);
                                                }
                                            }}
                                            className={`
                                            px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer
                                            ${selectedLeadId === lead.id
                                                    ? 'bg-[#522B47] text-white'
                                                    : 'bg-white border border-gray-200 text-gray-600 group-hover:border-gray-300'
                                                }
                                        `}
                                        >
                                            {lead.status === LeadStatus.NEW ? 'Contact' : 'View'}
                                        </button>

                                        {/* More options */}
                                        <div className="relative" ref={activeRowMenu === lead.id ? menuRef : undefined}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveRowMenu(activeRowMenu === lead.id ? null : lead.id);
                                                    setShowStatusSubmenu(false);
                                                    setShowDeleteConfirm(false);
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-black opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                            >
                                                <MoreHorizontal size={16} />
                                            </button>

                                            {activeRowMenu === lead.id && (
                                                <div className="absolute right-0 top-8 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[180px] z-50">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedLeadId(lead.id);
                                                            setIsEditing(true);
                                                            setEditForm(lead);
                                                            setActiveRowMenu(null);
                                                        }}
                                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <Edit3 size={14} />
                                                        Edit Lead
                                                    </button>

                                                    {/* Status submenu */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setShowStatusSubmenu(!showStatusSubmenu); }}
                                                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between cursor-pointer"
                                                        >
                                                            <span className="flex items-center gap-2"><ChevronRight size={14} /> Change Status</span>
                                                        </button>
                                                        {showStatusSubmenu && (
                                                            <div className="absolute left-full top-0 ml-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px]">
                                                                {STATUS_OPTIONS.map(s => (
                                                                    <button
                                                                        key={s}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onUpdateStatus(lead.id, s);
                                                                            setActiveRowMenu(null);
                                                                            setShowStatusSubmenu(false);
                                                                            toast.success(`Status changed to ${s}`);
                                                                        }}
                                                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer ${lead.status === s ? 'font-bold' : ''}`}
                                                                    >
                                                                        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]?.split(' ')[0] || 'bg-gray-300'}`} />
                                                                        {s}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {canDelete && (
                                                        <>
                                                        <div className="h-px bg-gray-100 my-1" />

                                                        {showDeleteConfirm ? (
                                                            <div className="px-4 py-2">
                                                                <p className="text-xs text-red-600 mb-2">Delete this lead?</p>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                                                                        className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteLead(); }}
                                                                        className="flex-1 text-xs py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <Trash2 size={14} />
                                                                Delete Lead
                                                            </button>
                                                        )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {selectedLeadId === lead.id && (
                                            <ArrowLeft size={16} className="text-black rotate-180" />
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT: Detail View */}
                <div className="col-span-12 lg:col-span-5 xl:col-span-4 glass-card rounded-3xl flex flex-col overflow-hidden min-h-0">
                    {selectedLead ? (
                        <>
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100 flex justify-between items-start flex-shrink-0">
                                <div>
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Lead Details</h4>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onNavigate('contact')}
                                        className="p-2 bg-white rounded-full hover:bg-gray-50 text-gray-500 transition-colors shadow-sm cursor-pointer"
                                        title="Go to Communication"
                                    >
                                        <Send size={16} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (isEditing) {
                                                handleSaveEdit();
                                            } else {
                                                setIsEditing(true);
                                                setEditForm(selectedLead);
                                            }
                                        }}
                                        className={`p-2 rounded-full transition-colors shadow-sm cursor-pointer ${
                                            isEditing ? 'bg-[#522B47] text-white hover:bg-[#3D1F35]' : 'bg-white hover:bg-gray-50 text-gray-500'
                                        }`}
                                        title={isEditing ? 'Save changes' : 'Edit lead'}
                                    >
                                        {isEditing ? <ChevronRight size={16} /> : <Edit3 size={16} />}
                                    </button>
                                    {isEditing && (
                                        <button
                                            onClick={() => { setIsEditing(false); setEditForm({}); }}
                                            className="p-2 bg-white rounded-full hover:bg-gray-50 text-gray-400 transition-colors shadow-sm cursor-pointer"
                                            title="Cancel editing"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                    {!isEditing && (
                                        <button
                                            onClick={() => setSelectedLeadId(null)}
                                            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors cursor-pointer"
                                            title="Close"
                                        >
                                            <X size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Scrollable content */}
                            <div className="flex-1 overflow-y-auto min-h-0">

                            {/* Profile Section */}
                            <div className="p-8 flex flex-col items-center text-center relative">
                                <div className="relative mb-4">
                                    {selectedLead.avatar_url ? (
                                        <img src={selectedLead.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-lg" />
                                    ) : (
                                        <div className="w-24 h-24 rounded-full bg-accent-beige flex items-center justify-center font-serif font-bold text-3xl ring-4 ring-white shadow-lg">
                                            {selectedLead.first_name[0]}{selectedLead.last_name[0]}
                                        </div>
                                    )}
                                </div>

                                {isEditing ? (
                                    <div className="w-full space-y-3 text-left">
                                        <div className="grid grid-cols-2 gap-3">
                                            <input
                                                value={editForm.first_name || ''}
                                                onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                                                placeholder="First Name"
                                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                            />
                                            <input
                                                value={editForm.last_name || ''}
                                                onChange={(e) => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                                                placeholder="Last Name"
                                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                            />
                                        </div>
                                        <input
                                            value={editForm.email || ''}
                                            onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                                            placeholder="Email"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                        />
                                        <input
                                            value={editForm.phone || ''}
                                            onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                                            placeholder="Phone"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                        />
                                        <input
                                            value={editForm.company || ''}
                                            onChange={(e) => setEditForm(f => ({ ...f, company: e.target.value }))}
                                            placeholder="Company"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                        />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input
                                                type="number"
                                                value={editForm.value || 0}
                                                onChange={(e) => setEditForm(f => ({ ...f, value: Number(e.target.value) }))}
                                                placeholder="Value"
                                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                            />
                                            <input
                                                value={editForm.source || ''}
                                                onChange={(e) => setEditForm(f => ({ ...f, source: e.target.value }))}
                                                placeholder="Source"
                                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                            />
                                        </div>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Linkedin size={14} className="text-gray-400" />
                                            </div>
                                            <input
                                                value={editForm.linkedin_url || ''}
                                                onChange={(e) => setEditForm(f => ({ ...f, linkedin_url: e.target.value }))}
                                                placeholder="LinkedIn URL"
                                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="font-serif font-bold text-2xl text-black mb-1">
                                            {selectedLead.first_name} {selectedLead.last_name}
                                        </h3>

                                        {/* Contact info */}
                                        <div className="w-full space-y-2 mt-2 mb-4">
                                            <a href={`mailto:${selectedLead.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                                                <Mail size={14} className="text-gray-400" />
                                                {selectedLead.email}
                                            </a>
                                            {selectedLead.phone && (
                                                <a href={`tel:${selectedLead.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                                                    <Phone size={14} className="text-gray-400" />
                                                    {selectedLead.phone}
                                                </a>
                                            )}
                                        </div>

                                        <div className="w-full grid grid-cols-2 gap-4 text-left border-t border-gray-100 pt-4">
                                            <div>
                                                <p className="text-xs text-gray-400 mb-1">Company</p>
                                                <p className="font-semibold text-sm">{selectedLead.company || '—'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-400 mb-1">Est. Value</p>
                                                <div className="relative inline-flex items-center">
                                                    <span className="absolute left-2 text-sm font-semibold text-gray-400 pointer-events-none">$</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={selectedLead.value || 0}
                                                        onChange={(e) => {
                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                            onUpdateLead({ ...selectedLead, value: val });
                                                        }}
                                                        className="w-28 pl-6 pr-2 py-1 text-sm font-semibold text-right bg-white/50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-400 mb-1">Status</p>
                                                <select
                                                    value={selectedLead.status}
                                                    onChange={(e) => onUpdateStatus(selectedLead.id, e.target.value as LeadStatus)}
                                                    className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer outline-none ${STATUS_COLORS[selectedLead.status] || 'bg-gray-100 text-gray-600'}`}
                                                >
                                                    {STATUS_OPTIONS.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-400 mb-1">Source</p>
                                                <p className="text-xs font-semibold">{selectedLead.source || '—'}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-xs text-gray-400 mb-1">Created</p>
                                                <p className="text-xs font-semibold">{new Date(selectedLead.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-xs text-gray-400 mb-1">Assigned To</p>
                                                <select
                                                    value={selectedLead.assigned_to || ''}
                                                    onChange={async (e) => {
                                                        const assignedTo = e.target.value || undefined;
                                                        const updated = { ...selectedLead, assigned_to: assignedTo };
                                                        await onUpdateLead(updated);
                                                        toast.success(assignedTo ? 'Lead assigned' : 'Lead unassigned');
                                                    }}
                                                    className="text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer outline-none bg-gray-100 text-gray-600"
                                                >
                                                    <option value="">Unassigned</option>
                                                    {teamMembers.map(member => (
                                                        <option key={member.id} value={member.id}>
                                                            {member.full_name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Outreach Summary (only for converted prospects) */}
                            {outreachSummary && selectedLead.prospect_id && (
                                <div className="px-6 pb-4">
                                    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">Outreach History</p>
                                        <div className="space-y-1">
                                            {outreachSummary.respondedTo && (
                                                <div className="flex items-center gap-2 text-xs text-gray-700">
                                                    <Eye size={12} className="text-blue-500" />
                                                    <span>Engaged with: <strong>{outreachSummary.respondedTo}</strong></span>
                                                </div>
                                            )}
                                            {outreachSummary.lastEmail && (
                                                <div className="flex items-center gap-2 text-xs text-gray-700">
                                                    <Send size={12} className="text-gray-400" />
                                                    <span>Last sent: <strong>{outreachSummary.lastEmail}</strong></span>
                                                </div>
                                            )}
                                            {outreachSummary.step && outreachSummary.total && (
                                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                    <div className="flex gap-0.5">
                                                        {Array.from({ length: outreachSummary.total }, (_, i) => (
                                                            <div key={i} className={`w-2.5 h-1 rounded-full ${i < outreachSummary.step! ? 'bg-blue-500' : 'bg-gray-200'}`} />
                                                        ))}
                                                    </div>
                                                    <span>Email {outreachSummary.step} of {outreachSummary.total}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Deep Research Button */}
                            <div className="px-6 pb-4">
                                <button
                                    onClick={async () => {
                                        const leadLinkedin = selectedLead.linkedin_url;
                                        const userLinkedin = currentUser?.linkedin_url;

                                        if (!leadLinkedin) {
                                            toast.error('This lead has no LinkedIn URL. Edit the lead to add one.');
                                            return;
                                        }
                                        if (!userLinkedin) {
                                            toast.error('Your LinkedIn URL is not set. Add it in your profile settings.');
                                            return;
                                        }

                                        const webhookUrl = import.meta.env.VITE_DEEP_RESEARCH_WEBHOOK_URL;
                                        if (!webhookUrl) {
                                            toast.error('Deep research webhook URL is not configured.');
                                            return;
                                        }

                                        setIsResearching(true);
                                        try {
                                            const res = await fetch(webhookUrl, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    lead_linkedin_url: leadLinkedin,
                                                    user_linkedin_url: userLinkedin,
                                                    user_email: currentUser?.email,
                                                }),
                                            });
                                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                            toast.success('Deep research started! You\'ll see the report once it\'s ready.');
                                        } catch (err: any) {
                                            toast.error('Failed to trigger deep research. Try again later.');
                                        }
                                        setIsResearching(false);
                                    }}
                                    disabled={isResearching}
                                    className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3 px-4 rounded-xl hover:bg-[#3D1F35] active:scale-[0.98] transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {isResearching ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <FileSearch size={16} />
                                    )}
                                    {isResearching ? 'Researching...' : 'Deep Research Report'}
                                </button>
                                {!selectedLead.linkedin_url && (
                                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                                        Add a LinkedIn URL to this lead to enable deep research
                                    </p>
                                )}
                            </div>

                            {/* Notes */}
                            <div className="px-6 pb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Notes</p>
                                    {notes !== (selectedLead.notes || '') && (
                                        <button
                                            onClick={handleSaveNotes}
                                            disabled={isSavingNotes}
                                            className="text-xs text-black font-medium hover:underline cursor-pointer flex items-center gap-1"
                                        >
                                            {isSavingNotes ? <Loader2 size={12} className="animate-spin" /> : null}
                                            Save
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onBlur={() => { if (notes !== (selectedLead.notes || '')) handleSaveNotes(); }}
                                    placeholder="Add notes about this lead..."
                                    className="w-full px-3 py-2.5 bg-white/50 border border-gray-100 rounded-xl text-sm resize-none min-h-[60px] outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10 placeholder-gray-400"
                                />
                            </div>

                            {/* Activity Timeline */}
                            <div className="px-6 pb-6">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Activity</p>
                                {leadMessages.length === 0 ? (
                                    <div className="flex flex-col items-center py-8 text-gray-400">
                                        <Clock size={24} className="opacity-30 mb-2" />
                                        <p className="text-xs">No activity yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {leadMessages.map(msg => (
                                            <div key={msg.id} className="flex gap-3 items-start">
                                                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                                                    msg.direction === 'outbound' ? 'bg-black/10' : 'bg-accent-beige/50'
                                                }`}>
                                                    {msg.direction === 'outbound' ? (
                                                        <Send size={12} className="text-black" />
                                                    ) : (
                                                        <Mail size={12} className="text-gray-600" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-gray-700">
                                                        {msg.direction === 'outbound' ? 'You sent' : 'Received'}: {msg.subject || '(No Subject)'}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">{msg.content}</p>
                                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                                        {new Date(msg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            </div>{/* end scrollable content */}
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <List size={24} className="opacity-50" />
                            </div>
                            <p>Select a lead to view details</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== NEW LEAD MODAL ===== */}
            {showNewLeadModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewLeadModal(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 mx-4 animate-fade-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-serif font-bold text-2xl text-black">New Customer</h3>
                            <button
                                onClick={() => setShowNewLeadModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">First Name *</label>
                                    <input
                                        value={newLeadForm.first_name}
                                        onChange={(e) => setNewLeadForm(f => ({ ...f, first_name: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Last Name *</label>
                                    <input
                                        value={newLeadForm.last_name}
                                        onChange={(e) => setNewLeadForm(f => ({ ...f, last_name: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
                                <input
                                    type="email"
                                    value={newLeadForm.email}
                                    onChange={(e) => setNewLeadForm(f => ({ ...f, email: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                                    <input
                                        value={newLeadForm.phone}
                                        onChange={(e) => setNewLeadForm(f => ({ ...f, phone: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Company</label>
                                    <input
                                        value={newLeadForm.company}
                                        onChange={(e) => setNewLeadForm(f => ({ ...f, company: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Estimated Value</label>
                                    <input
                                        type="number"
                                        value={newLeadForm.value || ''}
                                        onChange={(e) => setNewLeadForm(f => ({ ...f, value: Number(e.target.value) || 0 }))}
                                        placeholder="0"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Source</label>
                                    <input
                                        value={newLeadForm.source}
                                        onChange={(e) => setNewLeadForm(f => ({ ...f, source: e.target.value }))}
                                        placeholder="e.g. Website, Referral"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setShowNewLeadModal(false)}
                                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateLead}
                                disabled={!newLeadForm.first_name.trim() || !newLeadForm.last_name.trim() || !newLeadForm.email.trim() || isCreating}
                                className="flex-1 py-3 bg-[#522B47] text-white rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
                            >
                                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                {isCreating ? 'Creating...' : 'Create Lead'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsBoard;
