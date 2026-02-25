import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GmailProvider } from './contexts/GmailContext';
import { UserProvider, useUser } from './contexts/UserContext';
import toast, { Toaster } from 'react-hot-toast';
import confetti from 'canvas-confetti';
import Sidebar from './components/Sidebar';
import { COMPANY_NAME } from './lib/branding';
import DashboardView from './components/DashboardView';

// Lazy load secondary views for better performance
const LeadsBoard = lazy(() => import('./components/LeadsBoard'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const ContactView = lazy(() => import('./components/ContactView'));
const AnalyticsView = lazy(() => import('./components/AnalyticsView'));
const TeamManagement = lazy(() => import('./components/TeamManagement'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const SetupWizard = lazy(() => import('./components/SetupWizard'));
import { leadService, meetingService, messageService, mapDbToLead, mapDbToMessage } from './services/supabaseService';
import { Lead, Meeting, LeadStatus, Message, AppNotification } from './types';
import { Bell, Search, User, Mail, Inbox, TrendingUp, X, Check } from 'lucide-react';
import { GmailAuthButton } from './components/GmailAuthButton';

import { AuthenticationView } from './components/AuthenticationView';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';

const App: React.FC = () => {
  const { currentUser } = useUser();
  const [session, setSession] = useState<Session | null>(null);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const leadsRef = useRef<Lead[]>([]); // Track leads for stage change detection

  // Keep leadsRef in sync
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications(prev => [{
      ...notif,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      read: false,
    }, ...prev].slice(0, 50)); // Keep max 50
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  const fireConfetti = () => {
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
    confetti({ ...defaults, particleCount: 50, origin: { x: 0.2, y: 0.6 } });
    confetti({ ...defaults, particleCount: 50, origin: { x: 0.8, y: 0.6 } });
    setTimeout(() => {
      confetti({ ...defaults, particleCount: 30, origin: { x: 0.5, y: 0.4 } });
    }, 250);
  };

  // Close notification panel on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Authentication State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Only stop loading if we have initialized auth
      if (!session) setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (!session) setIsLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Latch the setup wizard flag — once activated, stays on until explicitly completed
  useEffect(() => {
    if (isRecoverySession || (currentUser && !currentUser.setup_complete)) {
      setShowSetupWizard(true);
    }
  }, [isRecoverySession, currentUser]);

  // Fetch initial data only if we have a session
  useEffect(() => {
    if (!session) return;

    setIsLoading(true);
    const fetchData = async () => {
      try {
        const [leadsData, meetingsData, messagesData] = await Promise.all([
          leadService.getLeads(),
          meetingService.getMeetings(),
          messageService.getMessages()
        ]);
        setLeads(leadsData);
        setMeetings(meetingsData);
        setMessages(messagesData);
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();

    // Subscribe to Messages - dedicated channel (INSERT + UPDATE for is_read)
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('📨 NEW MESSAGE RECEIVED:', payload);
          const newMsg = mapDbToMessage(payload.new);
          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Generate notification for inbound messages
          if (newMsg.direction === 'inbound') {
            const lead = leadsRef.current.find(l => l.id === newMsg.lead_id);
            addNotification({
              type: 'new_message',
              title: 'New message received',
              description: lead
                ? `${lead.first_name} ${lead.last_name}: ${(newMsg.subject || newMsg.content).substring(0, 60)}`
                : `New inbound email: ${(newMsg.subject || newMsg.content).substring(0, 60)}`,
              navigateTo: 'contact',
              leadId: newMsg.lead_id,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const updatedMsg = mapDbToMessage(payload.new);
          setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Messages channel status:', status);
        if (err) console.error('📡 Messages channel error:', err);
      });

    // Subscribe to Leads - separate channel
    const leadsChannel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newLead = mapDbToLead(payload.new);
            setLeads(prev => {
              if (prev.some(l => l.id === newLead.id)) return prev;
              return [newLead, ...prev];
            });
            // Celebrate when a prospect converts to a lead
            if (newLead.source === 'cold_outreach' || newLead.source === 'form_submission' || newLead.prospect_id) {
              fireConfetti();
              toast(
                `${newLead.first_name} ${newLead.last_name} just became a lead!`,
                {
                  icon: '🎉',
                  duration: 5000,
                  style: { background: '#000', color: '#fff', fontWeight: 600, borderRadius: '12px' },
                }
              );
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedLead = mapDbToLead(payload.new);
            // Detect stage change for notification
            const oldLead = leadsRef.current.find(l => l.id === updatedLead.id);
            if (oldLead && oldLead.status !== updatedLead.status) {
              addNotification({
                type: 'lead_stage_change',
                title: 'Lead stage changed',
                description: `${updatedLead.first_name} ${updatedLead.last_name} moved from ${oldLead.status} to ${updatedLead.status}`,
                navigateTo: 'leads',
                leadId: updatedLead.id,
              });
            }
            setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Leads channel status:', status);
        if (err) console.error('📡 Leads channel error:', err);
      });

    // Subscribe to Pending Emails - separate channel
    const pendingChannel = supabase
      .channel('pending-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_emails' },
        (payload) => {
          console.log('📩 NEW PENDING EMAIL:', payload);
          addNotification({
            type: 'pending_email',
            title: 'New pending email',
            description: `From ${payload.new.from_name || payload.new.from_email}: ${(payload.new.subject || '(No Subject)').substring(0, 60)}`,
            navigateTo: 'contact',
          });
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Pending channel status:', status);
        if (err) console.error('📡 Pending channel error:', err);
      });

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(pendingChannel);
    };
  }, [session]);

  const handleUpdateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    // Optimistic update
    const updatedLeads = leads.map(lead =>
      lead.id === leadId ? { ...lead, status: newStatus } : lead
    );
    setLeads(updatedLeads);

    const leadToUpdate = updatedLeads.find(l => l.id === leadId);
    if (leadToUpdate) {
      await leadService.updateLead(leadToUpdate);
    }
  };

  const handleSendMessage = async (leadId: string, content: string, subject: string) => {
    const newMessage = await messageService.sendMessage({
      lead_id: leadId,
      content: content,
      subject: subject,
      direction: 'outbound',
      user_id: currentUser?.id,
      sender_name: currentUser?.full_name,
      sender_email: currentUser?.email,
    });
    setMessages([...messages, newMessage]);
  };

  const handleMarkAsRead = async (messageIds: string[]) => {
    await messageService.markAsRead(messageIds);
    setMessages(prev => prev.map(m =>
      messageIds.includes(m.id) ? { ...m, is_read: true } : m
    ));
  };

  const handleCreateLead = async (lead: Omit<Lead, 'id' | 'created_at'>) => {
    const newLead = await leadService.createLead(lead);
    setLeads(prev => [newLead, ...prev]);
  };

  // Called when a pending email is approved as a new lead
  const handleLeadCreated = (lead: Lead, message: Message) => {
    setLeads(prev => {
      if (prev.some(l => l.id === lead.id)) return prev;
      return [lead, ...prev];
    });
    if (message) {
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
    }
  };

  // Called when a pending email is linked to an existing lead
  const handleMessageLinked = (message: Message) => {
    setMessages(prev => {
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
    });
  };

  const handleDeleteLead = async (leadId: string) => {
    const { error } = await supabase.from('leads').delete().eq('id', leadId);
    if (error) throw error;
    setLeads(prev => prev.filter(l => l.id !== leadId));
  };

  const handleRefreshLeads = async () => {
    const leadsData = await leadService.getLeads();
    setLeads(leadsData);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView leads={leads} meetings={meetings} />;
      case 'leads':
        return (
          <LeadsBoard
            leads={leads}
            messages={messages}
            onUpdateStatus={handleUpdateLeadStatus}
            onCreateLead={handleCreateLead}
            onDeleteLead={handleDeleteLead}
            onUpdateLead={async (lead: Lead) => { await leadService.updateLead(lead); setLeads(prev => prev.map(l => l.id === lead.id ? lead : l)); }}
            onRefreshLeads={handleRefreshLeads}
            onNavigate={setCurrentView}
          />
        );
      case 'contact':
        return <ContactView leads={leads} messages={messages} onSendMessage={handleSendMessage} onMarkAsRead={handleMarkAsRead} onLeadCreated={handleLeadCreated} onMessageLinked={handleMessageLinked} />;
      case 'calendar':
        return <CalendarView meetings={meetings} leads={leads} messages={messages} />;
      case 'analytics':
        return <AnalyticsView />;
      case 'team':
        return <TeamManagement />;
      case 'settings':
        return <SettingsView />;
      default:
        return <div className="text-center pt-20 text-gray-400">Section under construction</div>;
    }
  };

  // Loading Screen
  if (isLoading && !session && session === null) { // Simple loading check logic could be refined
    // Keep existing loader
  }
  // But wait, checking logic:
  // initial render: session=null, isLoading=true.
  // getSession runs.
  // if session found -> setSession(s), isLoading remains true (fetchData will run).
  // if no session -> setSession(null), isLoading=false.

  // If not logged in, show Auth View
  if (!session && !isLoading) {
    return <AuthenticationView />;
  }

  // Show Setup Wizard for new users (recovery link or incomplete setup)
  // This check comes BEFORE the loading spinner so password updates don't unmount the wizard
  // Uses a latched flag so auth state changes during password update don't unmount the wizard
  if (showSetupWizard) {
    return (
      <Suspense fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBE1]">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="w-12 h-12 bg-[#522B47] rounded-full"></div>
            <div className="font-serif text-lg font-medium">Loading...</div>
          </div>
        </div>
      }>
        <SetupWizard
          isRecoverySession={isRecoverySession}
          onComplete={() => {
            setIsRecoverySession(false);
            setShowSetupWizard(false);
          }}
        />
      </Suspense>
    );
  }

  // Loading screen (shown after auth check and wizard check)
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBE1]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-[#522B47] rounded-full"></div>
          <div className="font-serif text-lg font-medium">{COMPANY_NAME}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen relative overflow-hidden bg-[#FDFBE1] text-gray-900 font-sans">

      {/* Ambient Background Blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-beige rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
      <div className="fixed top-[-10%] right-[-10%] w-[35%] h-[35%] bg-accent-pink rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="fixed bottom-[-10%] left-[20%] w-[45%] h-[45%] bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      <main className="flex-1 ml-64 relative z-10 p-8 h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex justify-between items-center mb-8 z-20 py-2 flex-shrink-0">
          <div className="relative w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" size={20} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search leads, companies..."
              aria-label="Search leads and companies"
              className="w-full bg-white/50 border border-transparent focus:border-black/10 focus:bg-white pl-10 pr-4 py-2.5 rounded-full outline-none transition-all duration-300 placeholder:text-gray-400 cursor-text"
            />
          </div>

          <div className="flex items-center gap-4">
            <GmailAuthButton />
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 bg-white rounded-full hover:bg-[#522B47] hover:text-white transition-all duration-300 shadow-sm group cursor-pointer"
                aria-label={`Notifications (${unreadNotifCount} unread)`}
              >
                <Bell size={20} aria-hidden="true" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                    <h3 className="font-serif font-bold text-sm">Notifications</h3>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-xs text-gray-500 hover:text-black transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Check size={12} />
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-gray-400">
                        <Bell size={24} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => {
                            markNotificationRead(notif.id);
                            if (notif.navigateTo) setCurrentView(notif.navigateTo);
                            setShowNotifications(false);
                          }}
                          className={`px-5 py-3.5 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 flex items-start gap-3 ${
                            !notif.read ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            notif.type === 'new_message' ? 'bg-blue-100 text-blue-600'
                            : notif.type === 'pending_email' ? 'bg-amber-100 text-amber-600'
                            : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            {notif.type === 'new_message' && <Mail size={14} />}
                            {notif.type === 'pending_email' && <Inbox size={14} />}
                            {notif.type === 'lead_stage_change' && <TrendingUp size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm truncate ${!notif.read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                {notif.title}
                              </p>
                              {!notif.read && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{notif.description}</p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold leading-none">{currentUser?.full_name || 'User'}</p>
                <p className="text-xs text-gray-500 capitalize">{currentUser?.role === 'admin' ? 'Admin' : 'Sales Rep'}</p>
              </div>
              <button
                className="w-10 h-10 rounded-full bg-[#522B47] text-white flex items-center justify-center hover:scale-105 transition-transform shadow-md ring-4 ring-white/50 cursor-pointer"
                aria-label={`User profile menu for ${currentUser?.full_name || 'User'}`}
              >
                <User size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="relative flex-1 min-h-0 overflow-y-auto" role="main">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-[#522B47] rounded-full"></div>
                <div className="font-serif text-lg font-medium">Loading...</div>
              </div>
            </div>
          }>
            {renderView()}
          </Suspense>
        </main>
      </main>
    </div>
  );
};

// Initialize dark mode from localStorage
if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
  const root = createRoot(rootElement);
  root.render(
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <UserProvider>
        <GmailProvider>
          <App />
          <Toaster position="bottom-right" />
        </GmailProvider>
      </UserProvider>
    </GoogleOAuthProvider>
  );
}