import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Lead, Message, PendingEmail } from '../types';
import { Search, Send, Paperclip, MoreVertical, Phone, Star, Mail, ArrowLeft, Clock, Loader2, X, Plus, MessageSquare, AlertCircle, UserPlus, Link2, Trash2, ChevronDown, Inbox, RotateCcw, Bot, ShieldCheck, ShieldAlert, Zap } from 'lucide-react';
import { useGmail } from '../contexts/GmailContext';
import { useUser } from '../contexts/UserContext';
import { pendingEmailService } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';

interface ContactViewProps {
    leads: Lead[];
    messages: Message[];
    onSendMessage: (leadId: string, content: string, subject: string) => void;
    onMarkAsRead: (messageIds: string[]) => void;
    onLeadCreated: (lead: Lead, message: Message) => void;
    onMessageLinked: (message: Message) => void;
}

interface ThreadInfo {
    threadId: string;
    label: string;
    lastTimestamp: string;
    messageCount: number;
    hasUnread: boolean;
}

/** Normalize a subject line for grouping legacy messages without gmail_thread_id */
const normalizeSubject = (subject?: string): string =>
    (subject || '(No Subject)').replace(/^(Re|Fwd):\s*/i, '').trim();

/** Get the thread key for a message */
const getThreadKey = (msg: Message): string =>
    msg.gmail_thread_id || `subject:${normalizeSubject(msg.subject)}`;

const ContactView: React.FC<ContactViewProps> = ({ leads, messages, onSendMessage, onMarkAsRead, onLeadCreated, onMessageLinked }) => {
    // Sub-tab: 'conversations' or 'pending'
    const [activeTab, setActiveTab] = useState<'conversations' | 'pending'>('conversations');

    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leads[0]?.id || null);
    const [searchTerm, setSearchTerm] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [subjectLine, setSubjectLine] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    // Pending emails state
    const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
    const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<'none' | 'create' | 'link'>('none');
    const [createLeadForm, setCreateLeadForm] = useState({ first_name: '', last_name: '', company: '' });
    const [linkLeadId, setLinkLeadId] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showDismissConfirm, setShowDismissConfirm] = useState(false);

    // Auto-dismissed emails
    const [autoDismissed, setAutoDismissed] = useState<PendingEmail[]>([]);
    const [showAutoDismissed, setShowAutoDismissed] = useState(false);

    const { sendEmail, isAuthenticated } = useGmail();
    const { currentUser, teamMembers } = useUser();

    // Compose new email modal state
    const [showCompose, setShowCompose] = useState(false);
    const [composeMode, setComposeMode] = useState<'lead' | 'custom'>('lead');
    const [composeLeadSearch, setComposeLeadSearch] = useState('');
    const [composeSelectedLeadId, setComposeSelectedLeadId] = useState<string | null>(null);
    const [composeCustomEmail, setComposeCustomEmail] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeSending, setComposeSending] = useState(false);

    // In "Mine" mode: view another team member's conversation with the selected lead (read-only)
    // null = viewing own, string = viewing that user's conversation
    const [viewingUserId, setViewingUserId] = useState<string | null>(null);

    // Shared inbox filter: 'mine' shows only current user's conversations, 'all' shows everything
    const [inboxFilter, setInboxFilter] = useState<'all' | 'mine'>('mine');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch pending emails + realtime subscription + cleanup expired
    useEffect(() => {
        pendingEmailService.getAll().then(setPendingEmails).catch(console.error);
        pendingEmailService.getAutoDismissed().then(setAutoDismissed).catch(console.error);
        // Clean up auto-dismissed emails older than 14 days
        pendingEmailService.cleanupExpiredDismissed().then(count => {
            if (count > 0) console.log(`Cleaned up ${count} expired auto-dismissed emails`);
        }).catch(console.error);

        const pendingChannel = supabase
            .channel('contact-pending-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pending_emails' },
                () => {
                    // Refresh both lists on any change (INSERT, UPDATE, DELETE)
                    pendingEmailService.getAll().then(setPendingEmails).catch(console.error);
                    pendingEmailService.getAutoDismissed().then(setAutoDismissed).catch(console.error);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(pendingChannel); };
    }, []);

    const refreshPending = () => {
        pendingEmailService.getAll().then(setPendingEmails).catch(console.error);
        pendingEmailService.getAutoDismissed().then(setAutoDismissed).catch(console.error);
    };

    const handleRestore = async (id: string) => {
        try {
            await pendingEmailService.restore(id);
            refreshPending();
        } catch (err) {
            console.error('Error restoring email:', err);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setAttachments(prev => [...prev, ...files]);
        e.target.value = '';
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const selectedLead = leads.find(l => l.id === selectedLeadId);
    const selectedPending = pendingEmails.find(p => p.id === selectedPendingId);

    // Compute per-lead conversation status for sidebar indicators
    type ConvoStatus = 'unread' | 'received' | 'delivered' | 'none';
    const leadConvoInfo = useMemo(() => {
        const info = new Map<string, { status: ConvoStatus; lastTimestamp: string; lastMsg: Message | null; unreadIds: string[] }>();
        for (const lead of leads) {
            const leadMsgs = messages
                .filter(m => m.lead_id === lead.id)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            const lastMsg = leadMsgs[0] || null;
            const lastTimestamp = lastMsg?.timestamp || '';
            const unreadInbound = leadMsgs.filter(m => !m.is_read && m.direction === 'inbound');

            let status: ConvoStatus = 'none';
            if (unreadInbound.length > 0) {
                status = 'unread'; // Red dot — new unread inbound
            } else if (lastMsg?.direction === 'inbound') {
                // Last message was inbound and is read, but user hasn't replied yet
                // Check if there's any outbound AFTER this inbound
                const lastInboundTime = new Date(lastMsg.timestamp).getTime();
                const hasReplyAfter = leadMsgs.some(m =>
                    m.direction === 'outbound' && new Date(m.timestamp).getTime() > lastInboundTime
                );
                status = hasReplyAfter ? 'delivered' : 'received';
            } else if (lastMsg?.direction === 'outbound') {
                status = 'delivered'; // Last action was our reply
            }

            info.set(lead.id, {
                status,
                lastTimestamp,
                lastMsg,
                unreadIds: unreadInbound.map(m => m.id)
            });
        }
        return info;
    }, [leads, messages]);

    // Set of lead IDs where the current user has at least one message (sent or received)
    const myLeadIds = useMemo(() => {
        const ids = new Set<string>();
        for (const msg of messages) {
            if (msg.lead_id && msg.user_id === currentUser?.id) {
                ids.add(msg.lead_id);
            }
        }
        return ids;
    }, [messages, currentUser?.id]);

    // Filter and sort leads: unread first, assigned to me second, then by latest message timestamp
    const filteredLeads = useMemo(() => {
        let filtered = leads.filter(l =>
            l.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.company.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // When "Mine" filter is active, show leads with my conversations OR assigned to me
        if (inboxFilter === 'mine') {
            filtered = filtered.filter(l => myLeadIds.has(l.id) || l.assigned_to === currentUser?.id);
        }

        return filtered.sort((a, b) => {
            const aInfo = leadConvoInfo.get(a.id);
            const bInfo = leadConvoInfo.get(b.id);
            // 1. Unread always first
            const aUnread = aInfo?.status === 'unread' ? 1 : 0;
            const bUnread = bInfo?.status === 'unread' ? 1 : 0;
            if (aUnread !== bUnread) return bUnread - aUnread;
            // 2. Assigned to current user second
            const aAssigned = a.assigned_to === currentUser?.id ? 1 : 0;
            const bAssigned = b.assigned_to === currentUser?.id ? 1 : 0;
            if (aAssigned !== bAssigned) return bAssigned - aAssigned;
            // 3. Then by latest message timestamp
            const aTime = aInfo?.lastTimestamp ? new Date(aInfo.lastTimestamp).getTime() : 0;
            const bTime = bInfo?.lastTimestamp ? new Date(bInfo.lastTimestamp).getTime() : 0;
            return bTime - aTime;
        });
    }, [leads, searchTerm, leadConvoInfo, inboxFilter, myLeadIds, currentUser?.id]);

    // Determine if AI scanning is active — check if any pending/dismissed email has ai_classification
    const aiScanningActive = useMemo(() => {
        const allEmails = [...pendingEmails, ...autoDismissed];
        return allEmails.some(e => e.ai_classification && e.ai_confidence != null);
    }, [pendingEmails, autoDismissed]);

    // Filter pending emails based on search
    const filteredPending = pendingEmails.filter(p =>
        (p.from_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.from_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.subject.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // The effective user ID for filtering: own or viewing another user's conversation
    const effectiveUserId = viewingUserId || currentUser?.id;

    // Other team members who have conversations with the selected lead (for "Mine" mode tabs)
    const otherUsersWithConvos = useMemo(() => {
        if (inboxFilter !== 'mine' || !selectedLeadId || !currentUser?.id) return [];
        const userIds = new Set<string>();
        for (const msg of messages) {
            if (msg.lead_id === selectedLeadId && msg.user_id && msg.user_id !== currentUser.id) {
                userIds.add(msg.user_id);
            }
        }
        return teamMembers.filter(m => userIds.has(m.id));
    }, [messages, selectedLeadId, currentUser?.id, inboxFilter, teamMembers]);

    // Compute threads for the selected lead (filtered by inbox mode)
    const threads = useMemo((): ThreadInfo[] => {
        let leadMessages = messages.filter(m => m.lead_id === selectedLeadId);

        const threadMap = new Map<string, Message[]>();
        for (const msg of leadMessages) {
            const key = getThreadKey(msg);
            if (!threadMap.has(key)) {
                threadMap.set(key, []);
            }
            threadMap.get(key)!.push(msg);
        }

        const threadInfos: ThreadInfo[] = [];
        for (const [key, msgs] of threadMap) {
            // In "mine" mode, filter threads by the effective user (own or viewing another)
            if (inboxFilter === 'mine' && !msgs.some(m => m.user_id === effectiveUserId)) {
                continue;
            }
            const sorted = msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            const label = normalizeSubject(sorted[0].subject);
            threadInfos.push({
                threadId: key,
                label,
                lastTimestamp: sorted[sorted.length - 1].timestamp,
                messageCount: msgs.length,
                hasUnread: msgs.some(m => !m.is_read && m.direction === 'inbound'),
            });
        }

        return threadInfos.sort((a, b) =>
            new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
        );
    }, [messages, selectedLeadId, inboxFilter, effectiveUserId]);

    // Auto-select the most recent thread when threads change or lead changes
    useEffect(() => {
        if (threads.length > 0 && (!activeThreadId || activeThreadId === '__new__' || !threads.some(t => t.threadId === activeThreadId))) {
            setActiveThreadId(threads[0].threadId);
        }
        if (threads.length === 0) {
            setActiveThreadId(null);
        }
    }, [threads]);

    // When selecting a lead, mark unread inbound messages as read
    const handleSelectLead = (leadId: string) => {
        setSelectedLeadId(leadId);
        const info = leadConvoInfo.get(leadId);
        if (info && info.unreadIds.length > 0) {
            onMarkAsRead(info.unreadIds);
        }
    };

    // Reset thread selection and viewing user when lead changes
    useEffect(() => {
        setActiveThreadId(null);
        setSubjectLine('');
        setNewMessage('');
        setViewingUserId(null);
    }, [selectedLeadId]);

    // Get messages for the active thread (with inbox filter)
    const currentMessages = useMemo(() => {
        if (!activeThreadId || activeThreadId === '__new__') return [];
        return messages
            .filter(m => {
                if (m.lead_id !== selectedLeadId) return false;
                if (getThreadKey(m) !== activeThreadId) return false;
                // In "mine" mode, filter by the effective user (own or viewing another)
                if (inboxFilter === 'mine' && m.user_id && m.user_id !== effectiveUserId) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [messages, selectedLeadId, activeThreadId, inboxFilter, effectiveUserId]);

    // Scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages, selectedLeadId, activeThreadId]);

    const activeThread = threads.find(t => t.threadId === activeThreadId);
    const isNewThread = activeThreadId === '__new__';
    const isReply = activeThreadId && !isNewThread && !activeThreadId.startsWith('subject:');

    // Select a pending email
    const handleSelectPending = (pendingId: string) => {
        setSelectedPendingId(pendingId);
        setPendingAction('none');
        setShowDismissConfirm(false);
        setLinkLeadId('');

        // Pre-fill create form from sender name
        const pending = pendingEmails.find(p => p.id === pendingId);
        if (pending) {
            const nameParts = (pending.from_name || '').split(' ');
            setCreateLeadForm({
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
                company: ''
            });
        }
    };

    // Handle Create Lead action
    const handleCreateLead = async () => {
        if (!selectedPending || !createLeadForm.first_name.trim()) return;
        setIsProcessing(true);
        try {
            // Auto-set lead source to "{User}'s Email" based on who received the inbound email
            const pendingUserId = selectedPending.user_id;
            const sourceUser = teamMembers.find(m => m.id === pendingUserId);
            const leadSource = sourceUser ? `${sourceUser.full_name}'s Email` : 'inbound_email';
            const { lead, message } = await pendingEmailService.approveAsNewLead(selectedPending.id, selectedPending, createLeadForm, leadSource);
            // Push new lead + message into App state so they appear immediately
            onLeadCreated(lead, message);
            setSelectedPendingId(null);
            setPendingAction('none');
            // Switch to conversations tab and select the new lead
            setActiveTab('conversations');
            setSelectedLeadId(lead.id);
            refreshPending();
        } catch (err) {
            console.error('Error creating lead from pending:', err);
        }
        setIsProcessing(false);
    };

    // Handle Link to Lead action
    const handleLinkToLead = async () => {
        if (!selectedPending || !linkLeadId) return;
        setIsProcessing(true);
        try {
            const message = await pendingEmailService.linkToExistingLead(selectedPending.id, linkLeadId, selectedPending);
            // Push message into App state so it appears immediately in the conversation
            if (message) onMessageLinked(message);
            setSelectedPendingId(null);
            setPendingAction('none');
            // Switch to conversations tab and select the linked lead
            setActiveTab('conversations');
            setSelectedLeadId(linkLeadId);
            setLinkLeadId('');
            refreshPending();
        } catch (err) {
            console.error('Error linking pending to lead:', err);
        }
        setIsProcessing(false);
    };

    // Handle Dismiss action
    const handleDismiss = async () => {
        if (!selectedPending) return;
        setIsProcessing(true);
        try {
            await pendingEmailService.dismiss(selectedPending.id);
            setSelectedPendingId(null);
            setShowDismissConfirm(false);
            refreshPending();
        } catch (err) {
            console.error('Error dismissing pending email:', err);
        }
        setIsProcessing(false);
    };

    const handleSend = async () => {
        if (!selectedLeadId || !newMessage.trim()) return;

        // Determine subject
        let finalSubject = subjectLine;
        if (!isNewThread && activeThread && !finalSubject) {
            finalSubject = `Re: ${activeThread.label}`;
        }
        if (!finalSubject) finalSubject = 'New Message';

        // Determine threadId to pass for Gmail threading
        const threadIdToSend = isReply ? activeThreadId : undefined;

        if (isAuthenticated) {
            setIsSending(true);
            const success = await sendEmail(
                selectedLead!.email,
                finalSubject,
                newMessage,
                selectedLeadId,
                attachments,
                threadIdToSend || undefined
            );
            setIsSending(false);

            if (success) {
                setNewMessage('');
                setSubjectLine('');
                setAttachments([]);
            }
        } else {
            onSendMessage(selectedLeadId, newMessage, finalSubject);
            setNewMessage('');
            setSubjectLine('');
        }
    };

    // Compose email handler
    const handleComposeSend = async () => {
        const toEmail = composeMode === 'lead'
            ? leads.find(l => l.id === composeSelectedLeadId)?.email
            : composeCustomEmail.trim();
        if (!toEmail || !composeSubject.trim() || !composeBody.trim()) return;

        setComposeSending(true);
        if (isAuthenticated) {
            const leadId = composeMode === 'lead' ? composeSelectedLeadId || undefined : undefined;
            const success = await sendEmail(toEmail, composeSubject, composeBody, leadId);
            if (success) {
                setShowCompose(false);
                setComposeSubject('');
                setComposeBody('');
                setComposeLeadSearch('');
                setComposeSelectedLeadId(null);
                setComposeCustomEmail('');
            }
        } else {
            if (composeMode === 'lead' && composeSelectedLeadId) {
                onSendMessage(composeSelectedLeadId, composeBody, composeSubject);
                setShowCompose(false);
                setComposeSubject('');
                setComposeBody('');
                setComposeSelectedLeadId(null);
                setComposeLeadSearch('');
            }
        }
        setComposeSending(false);
    };

    const composeSearchResults = composeLeadSearch.trim()
        ? leads.filter(l =>
            `${l.first_name} ${l.last_name}`.toLowerCase().includes(composeLeadSearch.toLowerCase()) ||
            l.email.toLowerCase().includes(composeLeadSearch.toLowerCase())
        ).slice(0, 5)
        : [];

    return (
        <div className="h-full flex flex-col gap-6 animate-fade-in pb-2 min-h-0">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 flex-shrink-0">
                <div>
                    <h2 className="text-3xl font-serif font-bold text-black leading-tight">Communication</h2>
                    <p className="text-gray-500 text-sm">Email and messaging history with your leads</p>
                </div>

                {/* AI Status + Sub-tabs */}
                <div className="flex items-center gap-3">
                    {/* Lead Scanning AI indicator */}
                    <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold ${
                        aiScanningActive
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'bg-red-50 text-red-500 border border-red-200'
                    }`}>
                        <Zap size={13} className={aiScanningActive ? 'text-emerald-500' : 'text-red-400'} />
                        <span>Lead Scanning AI:</span>
                        <span className={`${aiScanningActive ? 'text-emerald-700' : 'text-red-600'}`}>
                            {aiScanningActive ? 'Active' : 'Not Active'}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${aiScanningActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
                    </div>
                <div className="flex items-center bg-white/60 rounded-2xl p-1 border border-gray-200/50 shadow-sm">
                    <button
                        onClick={() => setActiveTab('conversations')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                            activeTab === 'conversations'
                                ? 'bg-black text-white shadow-md'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
                        }`}
                    >
                        <MessageSquare size={16} />
                        Conversations
                    </button>
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                            activeTab === 'pending'
                                ? 'bg-black text-white shadow-md'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
                        }`}
                    >
                        <Inbox size={16} />
                        Pending
                        {pendingEmails.length > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                activeTab === 'pending'
                                    ? 'bg-white/20 text-white'
                                    : 'bg-amber-100 text-amber-700'
                            }`}>
                                {pendingEmails.length}
                            </span>
                        )}
                    </button>
                </div>
                    {/* Compose New Email button */}
                    <button
                        onClick={() => setShowCompose(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all shadow-md cursor-pointer"
                    >
                        <Plus size={16} />
                        New Email
                    </button>
                </div>{/* end AI status + sub-tabs wrapper */}
            </div>

            {/* ===== COMPOSE NEW EMAIL MODAL ===== */}
            {showCompose && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowCompose(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="font-serif font-bold text-lg">New Email</h3>
                            <button onClick={() => setShowCompose(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* To: mode toggle */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-500 w-8">To:</span>
                                <div className="flex items-center bg-gray-100 rounded-lg p-0.5 flex-1">
                                    <button
                                        onClick={() => { setComposeMode('lead'); setComposeCustomEmail(''); }}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                            composeMode === 'lead' ? 'bg-white text-black shadow-sm' : 'text-gray-500'
                                        }`}
                                    >
                                        Existing Lead
                                    </button>
                                    <button
                                        onClick={() => { setComposeMode('custom'); setComposeSelectedLeadId(null); setComposeLeadSearch(''); }}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                            composeMode === 'custom' ? 'bg-white text-black shadow-sm' : 'text-gray-500'
                                        }`}
                                    >
                                        Custom Email
                                    </button>
                                </div>
                            </div>

                            {/* Lead search / Custom email input */}
                            {composeMode === 'lead' ? (
                                <div className="relative">
                                    {composeSelectedLeadId ? (
                                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl">
                                            <span className="text-sm font-medium text-gray-900">
                                                {(() => { const l = leads.find(l => l.id === composeSelectedLeadId); return l ? `${l.first_name} ${l.last_name} (${l.email})` : ''; })()}
                                            </span>
                                            <button onClick={() => { setComposeSelectedLeadId(null); setComposeLeadSearch(''); }} className="ml-auto text-gray-400 hover:text-gray-600 cursor-pointer"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="Search leads by name or email..."
                                                value={composeLeadSearch}
                                                onChange={e => setComposeLeadSearch(e.target.value)}
                                                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/10"
                                            />
                                            {composeSearchResults.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                                                    {composeSearchResults.map(l => (
                                                        <button
                                                            key={l.id}
                                                            onClick={() => { setComposeSelectedLeadId(l.id); setComposeLeadSearch(''); }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm cursor-pointer"
                                                        >
                                                            <span className="font-medium">{l.first_name} {l.last_name}</span>
                                                            <span className="text-gray-400 ml-2">{l.email}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <input
                                    type="email"
                                    placeholder="Enter email address..."
                                    value={composeCustomEmail}
                                    onChange={e => setComposeCustomEmail(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/10"
                                />
                            )}

                            {/* Subject */}
                            <input
                                type="text"
                                placeholder="Subject"
                                value={composeSubject}
                                onChange={e => setComposeSubject(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />

                            {/* Body */}
                            <textarea
                                placeholder="Write your message..."
                                value={composeBody}
                                onChange={e => setComposeBody(e.target.value)}
                                rows={6}
                                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/10 resize-none"
                            />

                            {/* Send button */}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setShowCompose(false)}
                                    className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleComposeSend}
                                    disabled={composeSending || !composeSubject.trim() || !composeBody.trim() || (composeMode === 'lead' ? !composeSelectedLeadId : !composeCustomEmail.trim())}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                                >
                                    {composeSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    {composeSending ? 'Sending...' : 'Send'}
                                </button>
                            </div>

                            {!isAuthenticated && (
                                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                    Connect Gmail to send emails. Without Gmail, you can only send to existing leads via the database.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== CONVERSATIONS TAB ===== */}
            {activeTab === 'conversations' && (
                <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">

                    {/* LEFT: Contact List */}
                    <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col glass-card rounded-3xl overflow-hidden">
                        <div className="p-6 pb-4 border-b border-gray-100 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
                                    <input
                                        type="text"
                                        placeholder="Search messages..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        aria-label="Search messages"
                                        className="w-full bg-gray-50 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-black/5 cursor-text"
                                    />
                                </div>
                            </div>
                            {/* Mine / All toggle */}
                            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                                <button
                                    onClick={() => setInboxFilter('mine')}
                                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                        inboxFilter === 'mine' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    Mine
                                </button>
                                <button
                                    onClick={() => { setInboxFilter('all'); setViewingUserId(null); }}
                                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                        inboxFilter === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    All
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {filteredLeads.map(lead => {
                                const info = leadConvoInfo.get(lead.id);
                                const lastMsg = info?.lastMsg || null;
                                const convoStatus = info?.status || 'none';
                                const isSelected = selectedLeadId === lead.id;

                                return (
                                    <div
                                        key={lead.id}
                                        onClick={() => handleSelectLead(lead.id)}
                                        className={`p-4 rounded-2xl cursor-pointer transition-all border border-transparent ${isSelected
                                            ? 'bg-black text-white shadow-lg'
                                            : convoStatus === 'unread'
                                                ? 'bg-white hover:bg-gray-50 border-gray-200 shadow-sm'
                                                : 'hover:bg-white hover:border-gray-100'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                {/* Avatar with status indicator */}
                                                <div className="relative flex-shrink-0">
                                                    {lead.avatar_url ? (
                                                        <img src={lead.avatar_url} className="w-10 h-10 rounded-full object-cover border border-white/20" />
                                                    ) : (
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isSelected ? 'bg-white/20' : 'bg-accent-beige'}`}>
                                                            {lead.first_name[0]}{lead.last_name[0]}
                                                        </div>
                                                    )}
                                                    {/* Status indicator dot */}
                                                    {convoStatus === 'unread' && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" title="New message" />
                                                    )}
                                                    {convoStatus === 'received' && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-blue-500 bg-white" title="Read — awaiting reply" />
                                                    )}
                                                    {convoStatus === 'delivered' && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" title="Replied" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className={`text-sm truncate ${isSelected ? 'text-white' : 'text-gray-900'} ${convoStatus === 'unread' ? 'font-extrabold' : 'font-bold'}`}>
                                                        {lead.first_name} {lead.last_name}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className={`text-xs truncate ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                                            {lead.company}
                                                        </p>
                                                        {lead.assigned_to === currentUser?.id && (
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                                isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                                                            }`}>
                                                                Assigned
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                {lastMsg && (
                                                    <span className={`text-[10px] ${isSelected ? 'text-gray-400' : convoStatus === 'unread' ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                                                        {new Date(lastMsg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className={`text-xs line-clamp-2 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {lastMsg ? (
                                                <span className={convoStatus === 'unread' ? 'font-bold text-gray-800' : ''}>
                                                    {lastMsg.direction === 'outbound' ? 'You: ' : ''}{lastMsg.content}
                                                </span>
                                            ) : (
                                                <span className="italic opacity-70">No messages yet</span>
                                            )}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT: Conversation Thread */}
                    <div className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col glass-card rounded-3xl overflow-hidden h-full">
                        {selectedLead ? (
                            <>
                                {/* Header */}
                                <div className="p-6 border-b border-gray-100 bg-white/40 backdrop-blur-md flex justify-between items-center z-10">
                                    <div className="flex items-center gap-4">
                                        {selectedLead.avatar_url ? (
                                            <img src={selectedLead.avatar_url} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-accent-beige flex items-center justify-center font-bold text-lg">
                                                {selectedLead.first_name[0]}{selectedLead.last_name[0]}
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-serif font-bold text-xl text-black">{selectedLead.first_name} {selectedLead.last_name}</h3>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                <span className="flex items-center gap-1"><Mail size={12} /> {selectedLead.email}</span>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span className="flex items-center gap-1"><Phone size={12} /> {selectedLead.phone}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors cursor-pointer" aria-label="Make call"><Phone size={18} aria-hidden="true" /></button>
                                        <button className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors cursor-pointer" aria-label="Add to favorites"><Star size={18} aria-hidden="true" /></button>
                                        <button className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors cursor-pointer" aria-label="More options"><MoreVertical size={18} aria-hidden="true" /></button>
                                    </div>
                                </div>

                                {/* User Conversation Tabs (Mine mode only) */}
                                {inboxFilter === 'mine' && otherUsersWithConvos.length > 0 && (
                                    <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-100 bg-gray-50/50">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Viewing:</span>
                                        <button
                                            onClick={() => { setViewingUserId(null); setActiveThreadId(null); }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                                !viewingUserId
                                                    ? 'bg-black text-white shadow-sm'
                                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                            }`}
                                        >
                                            My Conversations
                                        </button>
                                        {otherUsersWithConvos.map(user => (
                                            <button
                                                key={user.id}
                                                onClick={() => { setViewingUserId(user.id); setActiveThreadId(null); }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                                    viewingUserId === user.id
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                                }`}
                                            >
                                                {user.full_name}'s Conversations
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Thread Tabs */}
                                <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white/30 overflow-x-auto scrollbar-hide">
                                    {threads.map(thread => (
                                        <button
                                            key={thread.threadId}
                                            onClick={() => {
                                                setActiveThreadId(thread.threadId);
                                                setSubjectLine('');
                                                setNewMessage('');
                                            }}
                                            className={`
                                                flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                                                whitespace-nowrap transition-all cursor-pointer flex-shrink-0
                                                ${activeThreadId === thread.threadId
                                                    ? 'bg-black text-white shadow-md'
                                                    : 'bg-white/60 text-gray-600 hover:bg-white hover:text-gray-900 border border-gray-200'
                                                }
                                            `}
                                        >
                                            <MessageSquare size={14} className="flex-shrink-0" />
                                            <span className="truncate max-w-[180px]">{thread.label}</span>
                                            {thread.hasUnread && (
                                                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                                            )}
                                            <span className={`text-xs ${activeThreadId === thread.threadId ? 'text-gray-400' : 'text-gray-400'}`}>
                                                ({thread.messageCount})
                                            </span>
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => {
                                            setActiveThreadId('__new__');
                                            setSubjectLine('');
                                            setNewMessage('');
                                        }}
                                        className={`
                                            flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                                            whitespace-nowrap transition-all cursor-pointer flex-shrink-0
                                            ${isNewThread
                                                ? 'bg-black text-white shadow-md'
                                                : 'bg-accent-beige/20 text-gray-600 hover:bg-accent-beige/40 border border-dashed border-gray-300'
                                            }
                                        `}
                                    >
                                        <Plus size={14} />
                                        <span>New Thread</span>
                                    </button>
                                </div>

                                {/* Messages Area */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white/30">
                                    {isNewThread ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                                <Mail size={32} className="opacity-50" />
                                            </div>
                                            <p>Start a new conversation thread</p>
                                            <p className="text-xs text-gray-300">Enter a subject and compose your message below</p>
                                        </div>
                                    ) : currentMessages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                                <Mail size={32} className="opacity-50" />
                                            </div>
                                            <p>No conversation history. Start a new thread.</p>
                                        </div>
                                    ) : (
                                        currentMessages.map((msg, idx) => {
                                            const isOutbound = msg.direction === 'outbound';
                                            const isOwnMessage = !msg.user_id || msg.user_id === currentUser?.id;
                                            const showAvatar = idx === 0 || currentMessages[idx - 1].direction !== msg.direction;
                                            const senderLabel = isOutbound
                                                ? (isOwnMessage ? 'You' : (msg.sender_name || 'Team member'))
                                                : null;
                                            const showSenderLabel = isOutbound && showAvatar;

                                            return (
                                                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group`}>
                                                    <div className={`flex gap-3 max-w-[80%] ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                                                        {/* Avatar placeholder for alignment */}
                                                        <div className="w-8 flex-shrink-0 flex flex-col items-center">
                                                            {!isOutbound && showAvatar && selectedLead.avatar_url && (
                                                                <img src={selectedLead.avatar_url} className="w-8 h-8 rounded-full object-cover shadow-sm" />
                                                            )}
                                                            {!isOutbound && showAvatar && !selectedLead.avatar_url && (
                                                                <div className="w-8 h-8 rounded-full bg-accent-beige flex items-center justify-center text-xs font-bold">
                                                                    {selectedLead.first_name[0]}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                                                            {/* Sender attribution label */}
                                                            {showSenderLabel && senderLabel && (
                                                                <span className={`text-[10px] font-semibold mb-1 px-1 ${
                                                                    isOwnMessage ? 'text-gray-400' : 'text-blue-500'
                                                                }`}>
                                                                    {senderLabel}
                                                                </span>
                                                            )}
                                                            <div className={`
                                                        p-4 rounded-2xl shadow-sm relative
                                                        ${isOutbound
                                                                    ? isOwnMessage
                                                                        ? 'bg-black text-white rounded-tr-sm'
                                                                        : 'bg-gray-700 text-white rounded-tr-sm'
                                                                    : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                                                                }
                                                    `}>
                                                                {msg.subject && !msg.subject.startsWith('Re:') && (
                                                                    <p className={`text-xs font-bold mb-2 ${isOutbound ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                        Subject: {msg.subject}
                                                                    </p>
                                                                )}
                                                                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                                                            </div>
                                                            <span className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 px-1">
                                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                {isOutbound && isOwnMessage && <span className="text-gray-300 ml-1">Read</span>}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Compose Area (hidden when viewing another user's conversation) */}
                                {viewingUserId ? (
                                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-center">
                                        <p className="text-xs text-gray-400">Viewing {otherUsersWithConvos.find(u => u.id === viewingUserId)?.full_name}'s conversation — read only</p>
                                    </div>
                                ) : (
                                <div className="p-4 bg-white/60 border-t border-gray-100 backdrop-blur-md">
                                    {/* Reply context indicator */}
                                    {activeThread && !isNewThread && (
                                        <div className="flex items-center gap-2 px-4 py-2 mb-2 text-xs text-gray-500">
                                            <ArrowLeft size={12} />
                                            <span>Replying in: <strong className="text-gray-700">{activeThread.label}</strong></span>
                                        </div>
                                    )}
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 transition-all focus-within:ring-2 focus-within:ring-black/5 focus-within:border-black/20">
                                        {/* Show subject input only for new threads or when no active thread */}
                                        {(isNewThread || !activeThreadId) && (
                                            <input
                                                type="text"
                                                placeholder="Subject"
                                                value={subjectLine}
                                                onChange={(e) => setSubjectLine(e.target.value)}
                                                className="w-full px-4 py-2 border-b border-gray-100 text-sm font-semibold outline-none text-gray-900 bg-transparent placeholder-gray-400"
                                            />
                                        )}
                                        <textarea
                                            placeholder={isNewThread ? "Compose your new email..." : "Write your reply..."}
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            className="w-full px-4 py-3 min-h-[80px] outline-none text-sm resize-none text-gray-900 bg-transparent placeholder-gray-400"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && e.metaKey) handleSend();
                                            }}
                                        />
                                        {/* Attachments display */}
                                        {attachments.length > 0 && (
                                            <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-gray-100">
                                                {attachments.map((file, idx) => (
                                                    <div key={idx} className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5 text-sm">
                                                        <Paperclip size={14} className="text-gray-500" />
                                                        <span className="truncate max-w-[150px]">{file.name}</span>
                                                        <button
                                                            onClick={() => removeAttachment(idx)}
                                                            className="text-gray-400 hover:text-red-500 cursor-pointer"
                                                            aria-label={`Remove ${file.name}`}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center px-2 pb-1">
                                            <div className="flex gap-2">
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    onChange={handleFileSelect}
                                                    multiple
                                                    className="hidden"
                                                />
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-full transition-colors cursor-pointer"
                                                    aria-label="Attach file"
                                                >
                                                    <Paperclip size={18} aria-hidden="true" />
                                                </button>
                                            </div>
                                            <button
                                                onClick={handleSend}
                                                disabled={!newMessage.trim() || isSending}
                                                className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-black/10 cursor-pointer"
                                                aria-label="Send email message"
                                            >
                                                {isSending ? (
                                                    <>
                                                        <span>Sending...</span>
                                                        <Loader2 size={14} className="animate-spin" />
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>{isNewThread ? 'Send Email' : 'Reply'}</span>
                                                        <Send size={14} aria-hidden="true" />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                <Mail size={48} className="opacity-20 mb-4" />
                                <p>Select a conversation to start messaging</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== PENDING EMAILS TAB ===== */}
            {activeTab === 'pending' && (
                <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">

                    {/* LEFT: Pending Email List */}
                    <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col glass-card rounded-3xl overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
                                <input
                                    type="text"
                                    placeholder="Search pending emails..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    aria-label="Search pending emails"
                                    className="w-full bg-gray-50 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-black/5 cursor-text"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {filteredPending.length === 0 && autoDismissed.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                                    <Inbox size={40} className="opacity-30 mb-3" />
                                    <p className="text-sm font-medium">No pending emails</p>
                                    <p className="text-xs mt-1">All caught up!</p>
                                </div>
                            ) : (
                                <>
                                    {filteredPending.map(pending => {
                                        const isSelected = selectedPendingId === pending.id;
                                        const badgeConfig = pending.status === 'likely_lead'
                                            ? { label: 'Likely Lead', bg: 'bg-emerald-100 text-emerald-700', activeBg: 'bg-white/20 text-white' }
                                            : pending.status === 'needs_review'
                                            ? { label: 'Review', bg: 'bg-yellow-100 text-yellow-700', activeBg: 'bg-white/20 text-white' }
                                            : { label: 'Pending', bg: 'bg-gray-100 text-gray-500', activeBg: 'bg-white/15 text-white/80' };

                                        return (
                                            <div
                                                key={pending.id}
                                                onClick={() => handleSelectPending(pending.id)}
                                                className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                                                    isSelected
                                                        ? pending.status === 'likely_lead'
                                                            ? 'bg-emerald-600 text-white shadow-lg border-emerald-600'
                                                            : 'bg-amber-600 text-white shadow-lg border-amber-600'
                                                        : pending.status === 'likely_lead'
                                                            ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300'
                                                            : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-300'
                                                }`}
                                            >
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                                                            isSelected ? 'bg-white/20 text-white'
                                                            : pending.status === 'likely_lead' ? 'bg-emerald-200 text-emerald-700'
                                                            : 'bg-amber-200 text-amber-700'
                                                        }`}>
                                                            {(pending.from_name || pending.from_email)[0].toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                                    {pending.from_name || pending.from_email}
                                                                </h4>
                                                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                                    isSelected ? badgeConfig.activeBg : badgeConfig.bg
                                                                }`}>
                                                                    {badgeConfig.label}
                                                                </span>
                                                            </div>
                                                            <p className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-gray-500'}`}>
                                                                {pending.from_email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                                                        {new Date(pending.received_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                </div>
                                                <p className={`text-xs truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                                                    {pending.subject}
                                                </p>
                                            </div>
                                        );
                                    })}

                                    {/* Auto-dismissed section */}
                                    {autoDismissed.length > 0 && (
                                        <div className="mt-4">
                                            <button
                                                onClick={() => setShowAutoDismissed(!showAutoDismissed)}
                                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Bot size={14} className="text-gray-400" />
                                                    <span>{autoDismissed.length} auto-dismissed</span>
                                                </div>
                                                <ChevronDown size={14} className={`transition-transform ${showAutoDismissed ? 'rotate-180' : ''}`} />
                                            </button>
                                            {showAutoDismissed && (
                                                <div className="mt-2 space-y-2">
                                                    {autoDismissed.map(email => {
                                                        const daysLeft = Math.max(0, 14 - Math.floor((Date.now() - new Date(email.received_at).getTime()) / (1000 * 60 * 60 * 24)));
                                                        return (
                                                        <div
                                                            key={email.id}
                                                            className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-medium text-gray-600 truncate">
                                                                    {email.from_name || email.from_email}
                                                                </p>
                                                                <p className="text-[10px] text-gray-400 truncate">{email.subject}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    {email.ai_classification && (
                                                                        <span className="text-[9px] text-gray-400 italic">
                                                                            AI: {email.ai_classification} ({Math.round((email.ai_confidence || 0) * 100)}%)
                                                                        </span>
                                                                    )}
                                                                    <span className={`text-[9px] font-medium ${daysLeft <= 3 ? 'text-red-400' : 'text-gray-400'}`}>
                                                                        {daysLeft}d left
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRestore(email.id)}
                                                                className="ml-2 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer flex-shrink-0"
                                                            >
                                                                <RotateCcw size={10} />
                                                                Restore
                                                            </button>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: Pending Email Review Panel */}
                    <div className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col glass-card rounded-3xl overflow-hidden h-full">
                        {selectedPending ? (
                            <div className="flex flex-col h-full">
                                {/* Header */}
                                <div className="p-6 border-b border-gray-100 bg-amber-50/40 backdrop-blur-md">
                                    <div className="flex items-center gap-2 mb-3">
                                        {selectedPending.status === 'likely_lead' ? (
                                            <>
                                                <ShieldCheck size={18} className="text-emerald-500" />
                                                <span className="text-sm font-semibold text-emerald-600">Likely Lead</span>
                                            </>
                                        ) : selectedPending.status === 'needs_review' ? (
                                            <>
                                                <ShieldAlert size={18} className="text-yellow-500" />
                                                <span className="text-sm font-semibold text-yellow-600">Needs Review</span>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle size={18} className="text-amber-500" />
                                                <span className="text-sm font-semibold text-amber-600">Pending Review</span>
                                            </>
                                        )}
                                        {selectedPending.ai_classification && (
                                            <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-400">
                                                <Bot size={12} />
                                                AI: {selectedPending.ai_classification} ({Math.round((selectedPending.ai_confidence || 0) * 100)}%)
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center font-bold text-lg">
                                            {(selectedPending.from_name || selectedPending.from_email)[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-serif font-bold text-xl text-black">
                                                {selectedPending.from_name || 'Unknown Sender'}
                                            </h3>
                                            <p className="text-xs text-gray-500">{selectedPending.from_email}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Email Content */}
                                <div className="flex-1 overflow-y-auto p-6 bg-white/30">
                                    <div className="max-w-2xl">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="text-xs text-gray-400">
                                                {new Date(selectedPending.received_at).toLocaleDateString(undefined, {
                                                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                            <p className="text-xs font-bold text-gray-500 mb-3">
                                                Subject: {selectedPending.subject}
                                            </p>
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                                {selectedPending.content}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Area */}
                                <div className="p-5 border-t border-gray-100 bg-white/60 backdrop-blur-md space-y-4">
                                    {/* Action buttons row */}
                                    {pendingAction === 'none' && !showDismissConfirm && (
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setPendingAction('create')}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-black text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors cursor-pointer"
                                            >
                                                <UserPlus size={16} />
                                                Create Lead
                                            </button>
                                            <button
                                                onClick={() => setPendingAction('link')}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-gray-700 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                                            >
                                                <Link2 size={16} />
                                                Link to Lead
                                            </button>
                                            <button
                                                onClick={() => setShowDismissConfirm(true)}
                                                className="flex items-center justify-center gap-2 py-3 px-5 text-red-500 rounded-xl font-medium text-sm border border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
                                            >
                                                <Trash2 size={16} />
                                                Dismiss
                                            </button>
                                        </div>
                                    )}

                                    {/* Create Lead Form */}
                                    {pendingAction === 'create' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-semibold text-sm text-gray-700">Create New Lead</h4>
                                                <button onClick={() => setPendingAction('none')} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                                    <X size={18} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <input
                                                    type="text"
                                                    placeholder="First Name *"
                                                    value={createLeadForm.first_name}
                                                    onChange={(e) => setCreateLeadForm(f => ({ ...f, first_name: e.target.value }))}
                                                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Last Name"
                                                    value={createLeadForm.last_name}
                                                    onChange={(e) => setCreateLeadForm(f => ({ ...f, last_name: e.target.value }))}
                                                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Company"
                                                    value={createLeadForm.company}
                                                    onChange={(e) => setCreateLeadForm(f => ({ ...f, company: e.target.value }))}
                                                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400">
                                                Email: {selectedPending.from_email} (auto-linked)
                                            </p>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => setPendingAction('none')}
                                                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleCreateLead}
                                                    disabled={!createLeadForm.first_name.trim() || isProcessing}
                                                    className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
                                                >
                                                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                                    {isProcessing ? 'Creating...' : 'Create & Link'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Link to Lead Form */}
                                    {pendingAction === 'link' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-semibold text-sm text-gray-700">Link to Existing Lead</h4>
                                                <button onClick={() => setPendingAction('none')} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                                    <X size={18} />
                                                </button>
                                            </div>
                                            <select
                                                value={linkLeadId}
                                                onChange={(e) => setLinkLeadId(e.target.value)}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none bg-white"
                                            >
                                                <option value="">Select a lead...</option>
                                                {leads.map(lead => (
                                                    <option key={lead.id} value={lead.id}>
                                                        {lead.first_name} {lead.last_name} — {lead.company} ({lead.email})
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => setPendingAction('none')}
                                                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleLinkToLead}
                                                    disabled={!linkLeadId || isProcessing}
                                                    className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
                                                >
                                                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                                    {isProcessing ? 'Linking...' : 'Link Email'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Dismiss Confirmation */}
                                    {showDismissConfirm && (
                                        <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                                            <p className="text-sm text-red-800 mb-3">Are you sure you want to dismiss this email? This action cannot be undone.</p>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => setShowDismissConfirm(false)}
                                                    className="flex-1 py-2 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-white transition-colors cursor-pointer"
                                                >
                                                    Keep
                                                </button>
                                                <button
                                                    onClick={handleDismiss}
                                                    disabled={isProcessing}
                                                    className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                                                >
                                                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                    {isProcessing ? 'Deleting...' : 'Dismiss'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                <Inbox size={48} className="opacity-20 mb-4" />
                                {pendingEmails.length === 0 ? (
                                    <>
                                        <p className="font-medium">No pending emails</p>
                                        <p className="text-sm mt-1">Emails from unknown senders will appear here for review</p>
                                    </>
                                ) : (
                                    <p>Select a pending email to review</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContactView;
