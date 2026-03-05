import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Lead, Message, PendingEmail, Prospect } from '../types';
import { Search, Send, Paperclip, MoreVertical, Phone, Star, Mail, ArrowLeft, Clock, Loader2, X, Plus, MessageSquare, AlertCircle, UserPlus, Link2, Trash2, ChevronDown, Inbox, RotateCcw, Bot, ShieldCheck, ShieldAlert, Zap, UserCheck } from 'lucide-react';
import { useGmail } from '../contexts/GmailContext';
import { useUser } from '../contexts/UserContext';
import { pendingEmailService } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';

interface ContactViewProps {
    leads: Lead[];
    prospects: Prospect[];
    messages: Message[];
    onSendMessage: (leadId: string, content: string, subject: string) => void;
    onMarkAsRead: (messageIds: string[]) => void;
    onLeadCreated: (lead: Lead, message: Message) => void;
    onMessageLinked: (message: Message) => void;
    onProspectConverted: (leadId: string) => void;
}

interface ThreadInfo {
    threadId: string;
    label: string;
    lastTimestamp: string;
    messageCount: number;
    hasUnread: boolean;
    hasCc: boolean;
}

/** Normalize a subject line for grouping legacy messages without gmail_thread_id */
const normalizeSubject = (subject?: string): string =>
    (subject || '(No Subject)').replace(/^(Re|Fwd):\s*/i, '').trim();

/** Get the thread key for a message */
// Group messages by normalized subject so CC'd conversations (which have different
// gmail_thread_id values per Gmail account) still appear as a single thread in the UI.
// The actual gmail_thread_id on each row is used only when sending replies.
const getThreadKey = (msg: Message): string =>
    `subject:${normalizeSubject(msg.subject)}`;

const ContactView: React.FC<ContactViewProps> = ({ leads, prospects, messages, onSendMessage, onMarkAsRead, onLeadCreated, onMessageLinked, onProspectConverted }) => {
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
    const [composeMode, setComposeMode] = useState<'lead' | 'prospect' | 'custom'>('lead');
    const [composeLeadSearch, setComposeLeadSearch] = useState('');
    const [composeSelectedLeadId, setComposeSelectedLeadId] = useState<string | null>(null);
    const [composeCustomEmail, setComposeCustomEmail] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeSending, setComposeSending] = useState(false);
    const [composeCc, setComposeCc] = useState<string[]>([]);
    const [composeCcInput, setComposeCcInput] = useState('');
    const [showComposeCc, setShowComposeCc] = useState(false);

    // Reply CC state
    const [replyCc, setReplyCc] = useState<string[]>([]);
    const [replyCcInput, setReplyCcInput] = useState('');
    const [showReplyCc, setShowReplyCc] = useState(false);

    // Reply vs Reply All mode
    const [replyMode, setReplyMode] = useState<'reply' | 'reply-all'>('reply');

    // Prospect selection state — null means a lead is selected
    const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
    const [isConvertingProspect, setIsConvertingProspect] = useState(false);

    // Custom email contact selection (for messages with no lead_id or prospect_id)
    const [selectedCustomEmail, setSelectedCustomEmail] = useState<string | null>(null);

    // Header button state — starred contacts persisted in localStorage
    const [starredContacts, setStarredContacts] = useState<Set<string>>(() => {
        try {
            const stored = localStorage.getItem('starredContacts');
            return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
        } catch { return new Set<string>(); }
    });
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showAddLeadModal, setShowAddLeadModal] = useState(false);
    const [addLeadForm, setAddLeadForm] = useState({ first_name: '', last_name: '', company: '', phone: '' });
    const [isAddingLead, setIsAddingLead] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

    // Compose prospect search
    const [composeProspectSearch, setComposeProspectSearch] = useState('');
    const [composeSelectedProspectId, setComposeSelectedProspectId] = useState<string | null>(null);

    // In "Mine" mode: view another team member's conversation with the selected lead (read-only)
    // null = viewing own, string = viewing that user's conversation
    const [viewingUserId, setViewingUserId] = useState<string | null>(null);

    // Shared inbox filter: 'mine' shows only current user's conversations, 'all' shows everything
    const [inboxFilter, setInboxFilter] = useState<'all' | 'mine'>('mine');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch pending emails + realtime subscription + cleanup expired
    useEffect(() => {
        pendingEmailService.getAll(currentUser?.id).then(setPendingEmails).catch(console.error);
        pendingEmailService.getAutoDismissed(currentUser?.id).then(setAutoDismissed).catch(console.error);
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
                    pendingEmailService.getAll(currentUser?.id).then(setPendingEmails).catch(console.error);
                    pendingEmailService.getAutoDismissed(currentUser?.id).then(setAutoDismissed).catch(console.error);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(pendingChannel); };
    }, [currentUser?.id]);

    const refreshPending = () => {
        pendingEmailService.getAll(currentUser?.id).then(setPendingEmails).catch(console.error);
        pendingEmailService.getAutoDismissed(currentUser?.id).then(setAutoDismissed).catch(console.error);
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
    const selectedProspect = prospects.find(p => p.id === selectedProspectId);
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

    // Set of lead IDs where the current user has at least one message (sent, received, or CC'd)
    const myLeadIds = useMemo(() => {
        const ids = new Set<string>();
        const userEmail = currentUser?.email?.toLowerCase();
        for (const msg of messages) {
            if (!msg.lead_id) continue;
            if (msg.user_id === currentUser?.id) {
                ids.add(msg.lead_id);
            }
            // Also include leads where user was CC'd or in To
            if (userEmail && (
                msg.cc_emails?.some(e => e.toLowerCase() === userEmail) ||
                msg.to_emails?.some(e => e.toLowerCase() === userEmail)
            )) {
                ids.add(msg.lead_id);
            }
        }
        return ids;
    }, [messages, currentUser?.id, currentUser?.email]);

    // Thread keys where the current user appears in cc_emails or to_emails (for group chat visibility)
    const myCcThreadKeys = useMemo(() => {
        const keys = new Set<string>();
        const userEmail = currentUser?.email?.toLowerCase();
        if (!userEmail) return keys;
        for (const msg of messages) {
            if (
                msg.cc_emails?.some(e => e.toLowerCase() === userEmail) ||
                msg.to_emails?.some(e => e.toLowerCase() === userEmail)
            ) {
                keys.add(getThreadKey(msg));
            }
        }
        return keys;
    }, [messages, currentUser?.email]);

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

    // Prospects that have at least one message (to show in sidebar)
    const prospectsWithMessages = useMemo(() => {
        const prospectIdsWithMsgs = new Set(messages.filter(m => m.prospect_id && !m.lead_id).map(m => m.prospect_id!));
        return prospects.filter(p =>
            prospectIdsWithMsgs.has(p.id) &&
            !p.converted_to_lead_id && // hide if already converted to lead
            (`${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.company_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [prospects, messages, searchTerm]);

    // Custom contacts: messages with no lead_id and no prospect_id, grouped by recipient email
    const customContactsWithMessages = useMemo(() => {
        const orphanMsgs = messages.filter(m => !m.lead_id && !m.prospect_id);
        const byEmail = new Map<string, Message[]>();
        for (const msg of orphanMsgs) {
            // For outbound: key is to_emails[0]; for inbound: key is sender_email
            const email = msg.direction === 'outbound'
                ? (msg.to_emails?.[0] || msg.sender_email || '')
                : (msg.sender_email || (msg.to_emails?.[0] || ''));
            if (!email) continue;
            const key = email.toLowerCase();
            if (!byEmail.has(key)) byEmail.set(key, []);
            byEmail.get(key)!.push(msg);
        }
        return Array.from(byEmail.entries())
            .map(([email, msgs]) => ({
                email,
                msgs: msgs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
            }))
            .filter(({ email }) => email.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [messages, searchTerm]);

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

    // Compute threads for the selected lead, prospect, or custom contact (filtered by inbox mode)
    const threads = useMemo((): ThreadInfo[] => {
        let leadMessages: Message[];
        if (selectedCustomEmail) {
            leadMessages = messages.filter(m => {
                if (m.lead_id || m.prospect_id) return false;
                const email = m.direction === 'outbound'
                    ? (m.to_emails?.[0] || m.sender_email || '')
                    : (m.sender_email || (m.to_emails?.[0] || ''));
                return email.toLowerCase() === selectedCustomEmail;
            });
        } else if (selectedProspectId) {
            leadMessages = messages.filter(m => m.prospect_id === selectedProspectId);
        } else {
            leadMessages = messages.filter(m => m.lead_id === selectedLeadId);
        }

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
            // Also include threads where the user was CC'd (group chat threads)
            if (inboxFilter === 'mine' && !msgs.some(m => m.user_id === effectiveUserId) && !myCcThreadKeys.has(key)) {
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
                hasCc: msgs.some(m => m.cc_emails && m.cc_emails.length > 0),
            });
        }

        return threadInfos.sort((a, b) =>
            new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
        );
    }, [messages, selectedLeadId, selectedProspectId, selectedCustomEmail, inboxFilter, effectiveUserId, myCcThreadKeys]);

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
        setSelectedProspectId(null);
        setSelectedCustomEmail(null);
        const info = leadConvoInfo.get(leadId);
        if (info && info.unreadIds.length > 0) {
            onMarkAsRead(info.unreadIds);
        }
    };

    // When selecting a prospect conversation
    const handleSelectProspect = (prospectId: string) => {
        setSelectedProspectId(prospectId);
        setSelectedLeadId(null);
        setSelectedCustomEmail(null);
        setActiveThreadId(null);
    };

    // When selecting a custom email conversation
    const handleSelectCustomEmail = (email: string) => {
        setSelectedCustomEmail(email);
        setSelectedLeadId(null);
        setSelectedProspectId(null);
        setActiveThreadId(null);
    };

    // Reset thread selection and viewing user when lead/prospect/custom changes
    useEffect(() => {
        setActiveThreadId(null);
        setSubjectLine('');
        setNewMessage('');
        setViewingUserId(null);
        setReplyMode('reply');
    }, [selectedLeadId, selectedProspectId, selectedCustomEmail]);

    // Get messages for the active thread (with inbox filter)
    const currentMessages = useMemo(() => {
        if (!activeThreadId || activeThreadId === '__new__') return [];
        return messages
            .filter(m => {
                // Match to the selected contact type
                if (selectedCustomEmail) {
                    if (m.lead_id || m.prospect_id) return false;
                    const email = m.direction === 'outbound'
                        ? (m.to_emails?.[0] || m.sender_email || '')
                        : (m.sender_email || (m.to_emails?.[0] || ''));
                    if (email.toLowerCase() !== selectedCustomEmail) return false;
                } else if (selectedProspectId) {
                    if (m.prospect_id !== selectedProspectId) return false;
                } else {
                    if (m.lead_id !== selectedLeadId) return false;
                }
                if (getThreadKey(m) !== activeThreadId) return false;
                // In "mine" mode, filter by the effective user (own or viewing another)
                // But show ALL messages in CC'd threads (group chat behavior)
                if (inboxFilter === 'mine' && m.user_id && m.user_id !== effectiveUserId) {
                    if (!myCcThreadKeys.has(activeThreadId!)) {
                        return false;
                    }
                }
                return true;
            })
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [messages, selectedLeadId, selectedProspectId, selectedCustomEmail, activeThreadId, inboxFilter, effectiveUserId, myCcThreadKeys]);

    // Collect all CC/To participants from the current thread for "Reply All"
    const replyAllCcList = useMemo(() => {
        if (!currentMessages.length) return [];
        const userEmail = currentUser?.email?.toLowerCase();
        const recipientEmail = selectedLead?.email?.toLowerCase()
            || selectedProspect?.email?.toLowerCase()
            || selectedCustomEmail?.toLowerCase();

        const allEmails = new Set<string>();
        for (const msg of currentMessages) {
            msg.cc_emails?.forEach(e => allEmails.add(e.toLowerCase()));
            msg.to_emails?.forEach(e => allEmails.add(e.toLowerCase()));
            if (msg.sender_email) allEmails.add(msg.sender_email.toLowerCase());
        }
        // Remove current user and the primary recipient
        if (userEmail) allEmails.delete(userEmail);
        if (recipientEmail) allEmails.delete(recipientEmail);

        return Array.from(allEmails);
    }, [currentMessages, currentUser?.email, selectedLead, selectedProspect, selectedCustomEmail]);

    // Scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages, selectedLeadId, activeThreadId]);

    const activeThread = threads.find(t => t.threadId === activeThreadId);
    const isNewThread = activeThreadId === '__new__';
    const isReply = activeThreadId && !isNewThread;

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

    // --- Header button handlers ---

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(label);
            setTimeout(() => setCopyFeedback(null), 2000);
        });
    };

    const handlePhoneClick = () => {
        const contact = selectedLead || selectedProspect;
        const phone = selectedLead?.phone || (selectedProspect as any)?.phone;
        if (phone) {
            window.open(`tel:${phone}`, '_self');
        } else {
            const email = contact?.email || selectedCustomEmail || '';
            copyToClipboard(email, 'Email copied!');
        }
    };

    const handleStarClick = () => {
        const key = selectedLeadId || selectedProspectId || selectedCustomEmail || '';
        setStarredContacts(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            try { localStorage.setItem('starredContacts', JSON.stringify(Array.from(next))); } catch {}
            return next;
        });
    };

    const handleAddLeadFromCustom = async () => {
        const email = selectedCustomEmail;
        if (!email || !addLeadForm.first_name.trim()) return;
        setIsAddingLead(true);
        try {
            const { data: newLead, error } = await supabase.from('leads').insert({
                first_name: addLeadForm.first_name.trim(),
                last_name: addLeadForm.last_name.trim(),
                email,
                phone: addLeadForm.phone.trim() || null,
                company: addLeadForm.company.trim() || '',
                estimated_value: 0,
                lead_status: 'new',
                lead_source: 'Communication',
            }).select().single();
            if (!error && newLead) {
                // Link all messages for this custom email to the new lead
                const customMsgIds = messages
                    .filter(m => !m.lead_id && !m.prospect_id && (
                        (m.direction === 'outbound' && (m.to_emails?.[0] || '').toLowerCase() === email) ||
                        (m.direction === 'inbound' && (m.sender_email || '').toLowerCase() === email)
                    ))
                    .map(m => m.id);
                if (customMsgIds.length > 0) {
                    await supabase.from('messages').update({ lead_id: newLead.id }).in('id', customMsgIds);
                }
                setShowAddLeadModal(false);
                setAddLeadForm({ first_name: '', last_name: '', company: '', phone: '' });
                setSelectedCustomEmail(null);
                setSelectedLeadId(newLead.id);
                onLeadCreated(newLead as any, messages.find(m => customMsgIds.includes(m.id)) as any);
            }
        } catch (err) {
            console.error('Error adding lead:', err);
        }
        setIsAddingLead(false);
    };

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        if (!selectedLeadId && !selectedProspectId && !selectedCustomEmail) return;

        // Determine subject
        let finalSubject = subjectLine;
        if (!isNewThread && activeThread && !finalSubject) {
            finalSubject = `Re: ${activeThread.label}`;
        }
        if (!finalSubject) finalSubject = 'New Message';

        // Determine which gmail_thread_id to pass to the Gmail API for this reply.
        // User A: their own outbound message has the correct gmail_thread_id.
        // User B (CC'd): their thread ID is stored in cc_thread_ids map on the outbound message,
        // keyed by their email address — populated by the webhook when their inbox copy arrived.
        const userEmail = currentUser?.email?.toLowerCase();
        const myOutboundInThread = currentMessages.find(
            m => m.direction === 'outbound' && m.user_id === currentUser?.id
        );
        const ccThreadId = userEmail
            ? currentMessages.map(m => m.cc_thread_ids?.[userEmail]).find(Boolean)
            : undefined;
        // Also check any message in the thread for a gmail_thread_id (e.g. inbound replies have one too)
        const anyThreadId = currentMessages.find(m => m.gmail_thread_id)?.gmail_thread_id;
        const threadIdToSend = isReply
            ? (myOutboundInThread?.gmail_thread_id || ccThreadId || anyThreadId || undefined)
            : undefined;

        // For In-Reply-To MIME header: use the RFC 2822 Message-ID from the most recent inbound message.
        // Find the RFC 2822 Message-ID of the most recent message for In-Reply-To.
        // Outbound: stored in rfc_message_id (fetched by gmail-send after sending).
        // Inbound: stored in gmail_message_id (the rfcMessageId captured by the webhook).
        // This causes the lead's email client to thread the reply in the same conversation.
        const reversedMessages = [...currentMessages].reverse();
        const inReplyToMsgId = isReply
            ? (reversedMessages.find(m => m.direction === 'outbound' && m.rfc_message_id)?.rfc_message_id
                || reversedMessages.find(m => m.direction === 'inbound' && m.gmail_message_id)?.gmail_message_id)
            : undefined;

        // Build effective CC list.
        // CC threads always force Reply All — the full CC list is always included.
        const isThreadWithCc = activeThread?.hasCc && replyAllCcList.length > 0;
        const effectiveCc = isThreadWithCc || (replyMode === 'reply-all' && replyAllCcList.length > 0)
            ? [...new Set([...replyCc, ...replyAllCcList])]
            : replyCc.length > 0 ? replyCc : undefined;

        if (isAuthenticated) {
            setIsSending(true);
            const toEmail = selectedCustomEmail
                ? selectedCustomEmail
                : selectedLead ? selectedLead.email : selectedProspect!.email;
            const success = await sendEmail(
                toEmail,
                finalSubject,
                newMessage,
                selectedLeadId || undefined,
                attachments,
                threadIdToSend || undefined,
                effectiveCc && effectiveCc.length > 0 ? effectiveCc : undefined,
                selectedProspectId || undefined,
                inReplyToMsgId || undefined
            );
            setIsSending(false);

            if (success) {
                setNewMessage('');
                setSubjectLine('');
                setAttachments([]);
                setReplyCc([]);
                setReplyCcInput('');
                setShowReplyCc(false);
            }
        } else if (selectedLeadId) {
            onSendMessage(selectedLeadId, newMessage, finalSubject);
            setNewMessage('');
            setSubjectLine('');
        }
    };

    // Compose email handler
    const handleComposeSend = async () => {
        const selectedProspect = prospects.find(p => p.id === composeSelectedProspectId);
        const toEmail = composeMode === 'lead'
            ? leads.find(l => l.id === composeSelectedLeadId)?.email
            : composeMode === 'prospect'
            ? selectedProspect?.email
            : composeCustomEmail.trim();
        if (!toEmail || !composeSubject.trim() || !composeBody.trim()) return;

        setComposeSending(true);
        if (isAuthenticated) {
            const leadId = composeMode === 'lead' ? composeSelectedLeadId || undefined : undefined;
            const prospectId = composeMode === 'prospect' ? composeSelectedProspectId || undefined : undefined;
            const success = await sendEmail(toEmail, composeSubject, composeBody, leadId, undefined, undefined, composeCc.length > 0 ? composeCc : undefined, prospectId);
            if (success) {
                setShowCompose(false);
                setComposeSubject('');
                setComposeBody('');
                setComposeLeadSearch('');
                setComposeSelectedLeadId(null);
                setComposeCustomEmail('');
                setComposeProspectSearch('');
                setComposeSelectedProspectId(null);
                setComposeCc([]);
                setComposeCcInput('');
                setShowComposeCc(false);
                // Auto-select the contact in sidebar so conversation is visible
                if (prospectId) {
                    setSelectedProspectId(prospectId);
                    setSelectedLeadId(null);
                    setSelectedCustomEmail(null);
                } else if (composeMode === 'custom' && toEmail) {
                    setSelectedCustomEmail(toEmail.toLowerCase());
                    setSelectedLeadId(null);
                    setSelectedProspectId(null);
                }
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
                                ? 'bg-[#522B47] text-white shadow-md'
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
                                ? 'bg-[#522B47] text-white shadow-md'
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
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#522B47] text-white rounded-xl text-sm font-medium hover:bg-[#3D1F35] transition-all shadow-md cursor-pointer"
                    >
                        <Plus size={16} />
                        New Email
                    </button>
                </div>{/* end AI status + sub-tabs wrapper */}
            </div>

            {/* ===== ADD CUSTOM CONTACT AS LEAD MODAL ===== */}
            {showAddLeadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowAddLeadModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="font-serif font-bold text-lg">Add as Lead</h3>
                            <button onClick={() => setShowAddLeadModal(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                                <span className="font-medium">Email:</span> {selectedCustomEmail}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">First Name *</label>
                                    <input
                                        type="text"
                                        placeholder="First name"
                                        value={addLeadForm.first_name}
                                        onChange={e => setAddLeadForm(f => ({ ...f, first_name: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#522B47]/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Last Name</label>
                                    <input
                                        type="text"
                                        placeholder="Last name"
                                        value={addLeadForm.last_name}
                                        onChange={e => setAddLeadForm(f => ({ ...f, last_name: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#522B47]/20"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Company</label>
                                <input
                                    type="text"
                                    placeholder="Company name"
                                    value={addLeadForm.company}
                                    onChange={e => setAddLeadForm(f => ({ ...f, company: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#522B47]/20"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                                <input
                                    type="tel"
                                    placeholder="Phone number"
                                    value={addLeadForm.phone}
                                    onChange={e => setAddLeadForm(f => ({ ...f, phone: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#522B47]/20"
                                />
                            </div>
                            <button
                                onClick={handleAddLeadFromCustom}
                                disabled={isAddingLead || !addLeadForm.first_name.trim()}
                                className="w-full py-3 bg-[#522B47] hover:bg-[#3D1F35] text-white rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isAddingLead ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                                Create Lead
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                        onClick={() => { setComposeMode('lead'); setComposeCustomEmail(''); setComposeSelectedProspectId(null); setComposeProspectSearch(''); }}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${composeMode === 'lead' ? 'bg-white text-black shadow-sm' : 'text-gray-500'}`}
                                    >
                                        Lead
                                    </button>
                                    <button
                                        onClick={() => { setComposeMode('prospect'); setComposeCustomEmail(''); setComposeSelectedLeadId(null); setComposeLeadSearch(''); }}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${composeMode === 'prospect' ? 'bg-white text-black shadow-sm' : 'text-gray-500'}`}
                                    >
                                        Prospect
                                    </button>
                                    <button
                                        onClick={() => { setComposeMode('custom'); setComposeSelectedLeadId(null); setComposeLeadSearch(''); setComposeSelectedProspectId(null); setComposeProspectSearch(''); }}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${composeMode === 'custom' ? 'bg-white text-black shadow-sm' : 'text-gray-500'}`}
                                    >
                                        Custom
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
                            ) : composeMode === 'prospect' ? (
                                <div className="relative">
                                    {composeSelectedProspectId ? (
                                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 rounded-xl">
                                            <span className="text-sm font-medium text-gray-900">
                                                {(() => { const p = prospects.find(p => p.id === composeSelectedProspectId); return p ? `${p.first_name} ${p.last_name} (${p.email})` : ''; })()}
                                            </span>
                                            <button onClick={() => { setComposeSelectedProspectId(null); setComposeProspectSearch(''); }} className="ml-auto text-gray-400 hover:text-gray-600 cursor-pointer"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="Search prospects by name or email..."
                                                value={composeProspectSearch}
                                                onChange={e => setComposeProspectSearch(e.target.value)}
                                                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/10"
                                            />
                                            {composeProspectSearch.trim() && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                                                    {prospects.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(composeProspectSearch.toLowerCase()) || p.email.toLowerCase().includes(composeProspectSearch.toLowerCase())).map(p => (
                                                        <button key={p.id} onClick={() => { setComposeSelectedProspectId(p.id); setComposeProspectSearch(''); }} className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm cursor-pointer">
                                                            <span className="font-medium">{p.first_name} {p.last_name}</span>
                                                            <span className="text-gray-400 ml-2">{p.email}</span>
                                                            {p.company_name && <span className="text-gray-300 ml-2">· {p.company_name}</span>}
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

                            {/* CC toggle + input */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowComposeCc(!showComposeCc)}
                                    className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors cursor-pointer mb-1"
                                >
                                    {showComposeCc ? '− CC' : '+ CC'}
                                </button>
                                {showComposeCc && (
                                    <div className="relative">
                                        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 bg-gray-50 rounded-xl">
                                            {composeCc.map((email, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700">
                                                    {email}
                                                    <button onClick={() => setComposeCc(composeCc.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 cursor-pointer"><X size={12} /></button>
                                                </span>
                                            ))}
                                            <input
                                                type="text"
                                                placeholder="Add CC — type name or email..."
                                                value={composeCcInput}
                                                onChange={e => setComposeCcInput(e.target.value)}
                                                onKeyDown={e => {
                                                    if ((e.key === 'Enter' || e.key === ',') && composeCcInput.trim()) {
                                                        e.preventDefault();
                                                        const email = composeCcInput.trim().replace(/,$/, '');
                                                        if (email && !composeCc.includes(email)) setComposeCc([...composeCc, email]);
                                                        setComposeCcInput('');
                                                    }
                                                }}
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        const email = composeCcInput.trim();
                                                        if (email && !composeCc.includes(email)) setComposeCc([...composeCc, email]);
                                                        setComposeCcInput('');
                                                    }, 150);
                                                }}
                                                className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder-gray-400"
                                            />
                                        </div>
                                        {/* Team member suggestions */}
                                        {composeCcInput.trim() && (() => {
                                            const q = composeCcInput.toLowerCase();
                                            const suggestions = teamMembers.filter(m =>
                                                m.email && !composeCc.includes(m.email) &&
                                                (m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
                                            );
                                            if (!suggestions.length) return null;
                                            return (
                                                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                                                    {suggestions.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onMouseDown={e => {
                                                                e.preventDefault();
                                                                if (!composeCc.includes(m.email)) setComposeCc([...composeCc, m.email]);
                                                                setComposeCcInput('');
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 cursor-pointer"
                                                        >
                                                            <div className="w-7 h-7 rounded-full bg-[#522B47] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                                {m.full_name[0]}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900">{m.full_name}</div>
                                                                <div className="text-xs text-gray-400">{m.email}</div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>

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
                                    disabled={composeSending || !composeSubject.trim() || !composeBody.trim() || (composeMode === 'lead' ? !composeSelectedLeadId : composeMode === 'prospect' ? !composeSelectedProspectId : !composeCustomEmail.trim())}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#522B47] text-white rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                                            ? 'bg-[#522B47] text-white shadow-lg'
                                            : convoStatus === 'unread'
                                                ? 'bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/15 border-gray-200 dark:border-gray-600 shadow-sm'
                                                : 'hover:bg-white dark:hover:bg-white/10 hover:border-gray-100 dark:hover:border-gray-600'
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
                                                    <h4 className={`text-sm truncate ${isSelected ? 'text-white' : 'text-gray-900 dark:text-white'} ${convoStatus === 'unread' ? 'font-extrabold' : 'font-bold'}`}>
                                                        {lead.first_name} {lead.last_name}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className={`text-xs truncate ${isSelected ? 'text-gray-300' : 'text-gray-500 dark:text-white/70'}`}>
                                                            {lead.company}
                                                        </p>
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                            isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                                                        }`}>
                                                            Lead
                                                        </span>
                                                        {lead.assigned_to === currentUser?.id && (
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                                isSelected ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-600'
                                                            }`}>
                                                                Assigned
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                {lastMsg && (
                                                    <span className={`text-[10px] ${isSelected ? 'text-gray-400' : convoStatus === 'unread' ? 'text-red-500 font-semibold' : 'text-gray-400 dark:text-white/60'}`}>
                                                        {new Date(lastMsg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className={`text-xs line-clamp-2 ${isSelected ? 'text-gray-300' : 'text-gray-500 dark:text-white/70'}`}>
                                            {lastMsg ? (
                                                <span className={convoStatus === 'unread' ? 'font-bold text-gray-800 dark:text-white' : ''}>
                                                    {lastMsg.direction === 'outbound' ? 'You: ' : ''}{lastMsg.content}
                                                </span>
                                            ) : (
                                                <span className="italic opacity-70">No messages yet</span>
                                            )}
                                        </p>
                                    </div>
                                );
                            })}

                            {/* Prospect conversations */}
                            {prospectsWithMessages.map(prospect => {
                                const prospectMsgs = messages.filter(m => m.prospect_id === prospect.id && !m.lead_id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                                const lastMsg = prospectMsgs[0] || null;
                                const hasUnread = prospectMsgs.some(m => !m.is_read && m.direction === 'inbound');
                                const isSelected = selectedProspectId === prospect.id;
                                return (
                                    <div
                                        key={prospect.id}
                                        onClick={() => handleSelectProspect(prospect.id)}
                                        className={`p-4 rounded-2xl cursor-pointer transition-all border border-transparent ${isSelected
                                            ? 'bg-[#522B47] text-white shadow-lg'
                                            : hasUnread
                                                ? 'bg-white border-gray-200 shadow-sm'
                                                : 'hover:bg-white hover:border-gray-100'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex-shrink-0">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isSelected ? 'bg-white/20' : 'bg-amber-100'}`}>
                                                        <span className={isSelected ? 'text-white' : 'text-amber-700'}>{prospect.first_name[0]}{prospect.last_name[0]}</span>
                                                    </div>
                                                    {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                        {prospect.first_name} {prospect.last_name}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className={`text-xs truncate ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>{prospect.company_name}</p>
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>Prospect</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {lastMsg && (
                                                <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-gray-400' : 'text-gray-400'}`}>
                                                    {new Date(lastMsg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-xs line-clamp-2 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {lastMsg ? `${lastMsg.direction === 'outbound' ? 'You: ' : ''}${lastMsg.content}` : <span className="italic opacity-70">No messages yet</span>}
                                        </p>
                                    </div>
                                );
                            })}

                            {/* Custom email contacts (no lead_id, no prospect_id) */}
                            {customContactsWithMessages.map(({ email, msgs }) => {
                                const lastMsg = msgs[0] || null;
                                const isSelected = selectedCustomEmail === email;
                                return (
                                    <div
                                        key={email}
                                        onClick={() => handleSelectCustomEmail(email)}
                                        className={`p-4 rounded-2xl cursor-pointer transition-all border border-transparent ${isSelected
                                            ? 'bg-[#522B47] text-white shadow-lg'
                                            : 'hover:bg-white hover:border-gray-100'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isSelected ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                    <span className={isSelected ? 'text-white' : 'text-gray-500'}>{email[0].toUpperCase()}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>{email}</h4>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>Custom</span>
                                                </div>
                                            </div>
                                            {lastMsg && (
                                                <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-gray-400' : 'text-gray-400'}`}>
                                                    {new Date(lastMsg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-xs line-clamp-2 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {lastMsg ? `${lastMsg.direction === 'outbound' ? 'You: ' : ''}${lastMsg.content}` : <span className="italic opacity-70">No messages yet</span>}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT: Conversation Thread */}
                    <div className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col glass-card rounded-3xl overflow-hidden h-full">
                        {(selectedLead || selectedProspect || selectedCustomEmail) ? (
                            <>
                                {/* Header */}
                                <div className="p-6 border-b border-gray-100 bg-white/40 backdrop-blur-md flex justify-between items-center z-10">
                                    <div className="flex items-center gap-4">
                                        {selectedCustomEmail ? (
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg bg-gray-100 text-gray-500">
                                                {selectedCustomEmail[0].toUpperCase()}
                                            </div>
                                        ) : selectedLead?.avatar_url ? (
                                            <img src={selectedLead.avatar_url} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                                        ) : (
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${selectedProspect ? 'bg-amber-100 text-amber-700' : 'bg-accent-beige'}`}>
                                                {(selectedLead || selectedProspect)!.first_name[0]}{(selectedLead || selectedProspect)!.last_name[0]}
                                            </div>
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                {selectedCustomEmail ? (
                                                    <h3 className="font-serif font-bold text-xl text-black">{selectedCustomEmail}</h3>
                                                ) : (
                                                    <h3 className="font-serif font-bold text-xl text-black">{(selectedLead || selectedProspect)!.first_name} {(selectedLead || selectedProspect)!.last_name}</h3>
                                                )}
                                                {selectedProspect && <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Prospect</span>}
                                                {selectedLead && <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Lead</span>}
                                                {selectedCustomEmail && <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Custom</span>}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                {selectedCustomEmail ? (
                                                    <span className="flex items-center gap-1"><Mail size={12} /> {selectedCustomEmail}</span>
                                                ) : (
                                                    <>
                                                        <span className="flex items-center gap-1"><Mail size={12} /> {(selectedLead || selectedProspect)!.email}</span>
                                                        {selectedLead?.phone && <><span className="w-1 h-1 bg-gray-300 rounded-full"></span><span className="flex items-center gap-1"><Phone size={12} /> {selectedLead.phone}</span></>}
                                                        {selectedProspect?.company_name && <><span className="w-1 h-1 bg-gray-300 rounded-full"></span><span>{selectedProspect.company_name}</span></>}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 relative">
                                        {/* Copy feedback toast */}
                                        {copyFeedback && (
                                            <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap z-20">{copyFeedback}</span>
                                        )}
                                        {/* Convert prospect to lead */}
                                        {selectedProspect && (
                                            <button
                                                onClick={async () => {
                                                    setIsConvertingProspect(true);
                                                    try {
                                                        const { data: newLead, error } = await supabase.from('leads').insert({
                                                            first_name: selectedProspect.first_name,
                                                            last_name: selectedProspect.last_name,
                                                            email: selectedProspect.email,
                                                            phone: selectedProspect.phone || null,
                                                            company: selectedProspect.company_name || '',
                                                            estimated_value: 0,
                                                            lead_status: 'new',
                                                            lead_source: 'Prospect',
                                                            prospect_id: selectedProspect.id,
                                                        }).select().single();
                                                        if (!error && newLead) {
                                                            await supabase.from('prospects').update({ converted_to_lead_id: newLead.id }).eq('id', selectedProspect.id);
                                                            await supabase.from('messages').update({ lead_id: newLead.id }).eq('prospect_id', selectedProspect.id);
                                                            setSelectedProspectId(null);
                                                            setSelectedLeadId(newLead.id);
                                                            onProspectConverted(newLead.id);
                                                        }
                                                    } finally {
                                                        setIsConvertingProspect(false);
                                                    }
                                                }}
                                                disabled={isConvertingProspect}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                {isConvertingProspect ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                                                Convert to Lead
                                            </button>
                                        )}
                                        {/* Add custom contact as lead */}
                                        {selectedCustomEmail && (
                                            <button
                                                onClick={() => {
                                                    setAddLeadForm({ first_name: '', last_name: '', company: '', phone: '' });
                                                    setShowAddLeadModal(true);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-[#522B47] hover:bg-[#3D1F35] text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
                                            >
                                                <UserPlus size={13} />
                                                Add as Lead
                                            </button>
                                        )}
                                        {/* Phone / call button */}
                                        <button
                                            onClick={handlePhoneClick}
                                            title={(selectedLead?.phone || (selectedProspect as any)?.phone) ? `Call ${selectedLead?.phone || (selectedProspect as any)?.phone}` : 'Copy email'}
                                            className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors cursor-pointer"
                                        >
                                            <Phone size={18} />
                                        </button>
                                        {/* Star / favourite */}
                                        {(() => {
                                            const key = selectedLeadId || selectedProspectId || selectedCustomEmail || '';
                                            const isStarred = starredContacts.has(key);
                                            return (
                                                <button
                                                    onClick={handleStarClick}
                                                    title={isStarred ? 'Unstar contact' : 'Star contact'}
                                                    className={`p-2.5 rounded-full border transition-colors cursor-pointer ${isStarred ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-500'}`}
                                                >
                                                    <Star size={18} fill={isStarred ? 'currentColor' : 'none'} />
                                                </button>
                                            );
                                        })()}
                                        {/* More options dropdown */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowMoreMenu(v => !v)}
                                                className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors cursor-pointer"
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            {showMoreMenu && (
                                                <>
                                                    {/* Backdrop to close */}
                                                    <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                                                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 overflow-hidden py-1">
                                                        <button
                                                            onClick={() => {
                                                                const email = selectedLead?.email || selectedProspect?.email || selectedCustomEmail || '';
                                                                copyToClipboard(email, 'Email copied!');
                                                                setShowMoreMenu(false);
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                                        >
                                                            <Mail size={14} className="text-gray-400" />
                                                            Copy Email
                                                        </button>
                                                        {(selectedLead?.phone || (selectedProspect as any)?.phone) && (
                                                            <button
                                                                onClick={() => {
                                                                    copyToClipboard(selectedLead?.phone || (selectedProspect as any)?.phone, 'Phone copied!');
                                                                    setShowMoreMenu(false);
                                                                }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <Phone size={14} className="text-gray-400" />
                                                                Copy Phone
                                                            </button>
                                                        )}
                                                        {selectedLead?.linkedin_url && (
                                                            <button
                                                                onClick={() => {
                                                                    const url = selectedLead.linkedin_url!;
                                                                    window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
                                                                    setShowMoreMenu(false);
                                                                }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <Link2 size={14} className="text-gray-400" />
                                                                Open LinkedIn
                                                            </button>
                                                        )}
                                                        {selectedCustomEmail && (
                                                            <button
                                                                onClick={() => {
                                                                    setAddLeadForm({ first_name: '', last_name: '', company: '', phone: '' });
                                                                    setShowAddLeadModal(true);
                                                                    setShowMoreMenu(false);
                                                                }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <UserPlus size={14} className="text-gray-400" />
                                                                Add as Lead
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
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
                                                    ? 'bg-[#522B47] text-white shadow-sm'
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

                                {/* Thread Tabs — newest first (leftmost), New Thread pinned at left */}
                                <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white/30 overflow-x-auto scrollbar-hide">
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
                                                ? 'bg-[#522B47] text-white shadow-md'
                                                : 'bg-accent-beige/20 text-gray-600 hover:bg-accent-beige/40 border border-dashed border-gray-300'
                                            }
                                        `}
                                    >
                                        <Plus size={14} />
                                        <span>New Thread</span>
                                    </button>
                                    {[...threads].reverse().map(thread => (
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
                                                    ? 'bg-[#522B47] text-white shadow-md'
                                                    : 'bg-white/60 text-gray-600 hover:bg-white hover:text-gray-900 border border-gray-200'
                                                }
                                            `}
                                        >
                                            <MessageSquare size={14} className="flex-shrink-0" />
                                            <span className="truncate max-w-[160px]">{thread.label}</span>
                                            {thread.hasCc && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                    activeThreadId === thread.threadId
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-blue-100 text-blue-600'
                                                }`}>CC</span>
                                            )}
                                            {thread.hasUnread && (
                                                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                                            )}
                                            <span className="text-xs opacity-50">({thread.messageCount})</span>
                                        </button>
                                    ))}
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
                                                            {!isOutbound && showAvatar && selectedLead?.avatar_url && (
                                                                <img src={selectedLead.avatar_url} className="w-8 h-8 rounded-full object-cover shadow-sm" />
                                                            )}
                                                            {!isOutbound && showAvatar && !(selectedLead?.avatar_url) && (
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedProspect ? 'bg-amber-100 text-amber-700' : 'bg-accent-beige'}`}>
                                                                    {(selectedLead || selectedProspect)?.first_name[0]}
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
                                                            {/* CC badge: show when current user was CC'd, not the direct recipient */}
                                                            {msg.direction === 'inbound' && msg.cc_emails && currentUser?.email &&
                                                                msg.cc_emails.some(e => e.toLowerCase() === currentUser.email!.toLowerCase()) &&
                                                                !(msg.to_emails?.some(e => e.toLowerCase() === currentUser.email!.toLowerCase())) && (
                                                                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full mb-1">
                                                                    CC'd to you
                                                                </span>
                                                            )}
                                                            <div className={`
                                                        p-4 rounded-2xl shadow-sm relative
                                                        ${isOutbound
                                                                    ? isOwnMessage
                                                                        ? 'bg-[#522B47] text-white rounded-tr-sm'
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
                                                                {/* CC metadata line */}
                                                                {(msg.cc_emails && msg.cc_emails.length > 0) && (
                                                                    <div className={`text-[10px] mt-2 pt-1.5 border-t ${isOutbound ? 'border-white/20 text-white/60' : 'border-gray-100 text-gray-400'}`}>
                                                                        {msg.to_emails && msg.to_emails.length > 0 && (
                                                                            <span>To: {msg.to_emails.join(', ')}</span>
                                                                        )}
                                                                        {msg.to_emails && msg.to_emails.length > 0 && <span className="mx-1">·</span>}
                                                                        <span>CC: {msg.cc_emails.join(', ')}</span>
                                                                    </div>
                                                                )}
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
                                        {/* CC field for replies */}
                                        <div className="px-4 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setShowReplyCc(!showReplyCc)}
                                                className="text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                                            >
                                                {showReplyCc ? '− CC' : '+ CC'}
                                            </button>
                                            {showReplyCc && (
                                                <div className="relative mt-1">
                                                    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-lg">
                                                        {replyCc.map((email, idx) => (
                                                            <span key={idx} className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                                                {email}
                                                                <button onClick={() => setReplyCc(replyCc.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 cursor-pointer"><X size={10} /></button>
                                                            </span>
                                                        ))}
                                                        <input
                                                            type="text"
                                                            placeholder="Add CC — type name or email..."
                                                            value={replyCcInput}
                                                            onChange={e => setReplyCcInput(e.target.value)}
                                                            onKeyDown={e => {
                                                                if ((e.key === 'Enter' || e.key === ',') && replyCcInput.trim()) {
                                                                    e.preventDefault();
                                                                    const email = replyCcInput.trim().replace(/,$/, '');
                                                                    if (email && !replyCc.includes(email)) setReplyCc([...replyCc, email]);
                                                                    setReplyCcInput('');
                                                                }
                                                            }}
                                                            onBlur={() => {
                                                                setTimeout(() => {
                                                                    const email = replyCcInput.trim();
                                                                    if (email && !replyCc.includes(email)) setReplyCc([...replyCc, email]);
                                                                    setReplyCcInput('');
                                                                }, 150);
                                                            }}
                                                            className="flex-1 min-w-[100px] bg-transparent text-xs outline-none placeholder-gray-400"
                                                        />
                                                    </div>
                                                    {/* Team member suggestions */}
                                                    {replyCcInput.trim() && (() => {
                                                        const q = replyCcInput.toLowerCase();
                                                        const suggestions = teamMembers.filter(m =>
                                                            m.email && !replyCc.includes(m.email) &&
                                                            (m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
                                                        );
                                                        if (!suggestions.length) return null;
                                                        return (
                                                            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                                                                {suggestions.map(m => (
                                                                    <button
                                                                        key={m.id}
                                                                        onMouseDown={e => {
                                                                            e.preventDefault();
                                                                            if (!replyCc.includes(m.email)) setReplyCc([...replyCc, m.email]);
                                                                            setReplyCcInput('');
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 cursor-pointer"
                                                                    >
                                                                        <div className="w-6 h-6 rounded-full bg-[#522B47] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                                                            {m.full_name[0]}
                                                                        </div>
                                                                        <div>
                                                                            <div className="text-xs font-medium text-gray-900">{m.full_name}</div>
                                                                            <div className="text-[10px] text-gray-400">{m.email}</div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
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
                                            {activeThread?.hasCc && replyAllCcList.length > 0 && !isNewThread ? (
                                                // CC thread — locked to Reply All, no toggle
                                                <button
                                                    onClick={handleSend}
                                                    disabled={!newMessage.trim() || isSending}
                                                    className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-black/10 cursor-pointer"
                                                    aria-label="Reply All"
                                                >
                                                    {isSending ? (
                                                        <>
                                                            <span>Sending...</span>
                                                            <Loader2 size={14} className="animate-spin" />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>Reply All</span>
                                                            <Send size={14} aria-hidden="true" />
                                                        </>
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleSend}
                                                    disabled={!newMessage.trim() || isSending}
                                                    className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-black/10 cursor-pointer"
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
                                            )}
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
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#522B47] text-white rounded-xl font-medium text-sm hover:bg-[#3D1F35] transition-colors cursor-pointer"
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
                                                    className="flex-1 py-2.5 bg-[#522B47] text-white rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
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
                                                    className="flex-1 py-2.5 bg-[#522B47] text-white rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
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
