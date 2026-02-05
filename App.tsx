import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import LeadsBoard from './components/LeadsBoard';
import CalendarView from './components/CalendarView';
import ContactView from './components/ContactView';
import { leadService, meetingService, messageService } from './services/supabaseService';
import { Lead, Meeting, LeadStatus, Message } from './types';
import { Bell, Search, User } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
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
  }, []);

  const handleUpdateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    // Optimistic update
    const updatedLeads = leads.map(lead => 
      lead.id === leadId ? { ...lead, status: newStatus } : lead
    );
    setLeads(updatedLeads);
    
    const leadToUpdate = updatedLeads.find(l => l.id === leadId);
    if(leadToUpdate) {
        await leadService.updateLead(leadToUpdate);
    }
  };

  const handleSendMessage = async (leadId: string, content: string, subject: string) => {
    const newMessage = await messageService.sendMessage({
      lead_id: leadId,
      content: content,
      subject: subject,
      direction: 'outbound'
    });
    setMessages([...messages, newMessage]);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView leads={leads} meetings={meetings} />;
      case 'leads':
        return <LeadsBoard leads={leads} onUpdateStatus={handleUpdateLeadStatus} />;
      case 'contact':
        return <ContactView leads={leads} messages={messages} onSendMessage={handleSendMessage} />;
      case 'calendar':
        return <CalendarView meetings={meetings} />;
      default:
        return <div className="text-center pt-20 text-gray-400">Section under construction</div>;
    }
  };

  if (isLoading) {
    return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#F8F5F2]">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-black rounded-full"></div>
                <div className="font-serif text-lg font-medium">Lumina</div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen relative overflow-hidden bg-[#F8F5F2] text-gray-900 font-sans">
      
      {/* Ambient Background Blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-beige rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
      <div className="fixed top-[-10%] right-[-10%] w-[35%] h-[35%] bg-accent-pink rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="fixed bottom-[-10%] left-[20%] w-[45%] h-[45%] bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      <main className="flex-1 ml-64 relative z-10 p-8 h-screen overflow-y-auto">
        {/* Top Header */}
        <header className="flex justify-between items-center mb-8 sticky top-0 z-20 py-2">
            <div className="relative w-96 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" size={20} />
                <input 
                    type="text" 
                    placeholder="Search leads, companies..." 
                    className="w-full bg-white/50 border border-transparent focus:border-black/10 focus:bg-white pl-10 pr-4 py-2.5 rounded-full outline-none transition-all duration-300 placeholder:text-gray-400"
                />
            </div>

            <div className="flex items-center gap-4">
                <button className="relative p-2.5 bg-white rounded-full hover:bg-black hover:text-white transition-all duration-300 shadow-sm group">
                    <Bell size={20} />
                    <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white group-hover:border-black"></span>
                </button>
                <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                    <div className="text-right hidden md:block">
                        <p className="text-sm font-bold leading-none">Alex Morgan</p>
                        <p className="text-xs text-gray-500">Sales Director</p>
                    </div>
                    <button className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:scale-105 transition-transform shadow-md ring-4 ring-white/50">
                        <User size={20} />
                    </button>
                </div>
            </div>
        </header>

        {/* Main Content Area */}
        <div className="relative">
            {renderView()}
        </div>
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}