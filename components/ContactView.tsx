import React, { useState, useRef, useEffect } from 'react';
import { Lead, Message } from '../types';
import { Search, Send, Paperclip, MoreVertical, Phone, Star, Mail, ArrowLeft, Clock } from 'lucide-react';

interface ContactViewProps {
  leads: Lead[];
  messages: Message[];
  onSendMessage: (leadId: string, content: string, subject: string) => void;
}

const ContactView: React.FC<ContactViewProps> = ({ leads, messages, onSendMessage }) => {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leads[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [subjectLine, setSubjectLine] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedLead = leads.find(l => l.id === selectedLeadId);
  
  // Filter leads based on search
  const filteredLeads = leads.filter(l => 
    l.first_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get messages for selected lead
  const currentMessages = messages
    .filter(m => m.lead_id === selectedLeadId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, selectedLeadId]);

  const handleSend = () => {
    if (selectedLeadId && newMessage.trim()) {
      onSendMessage(selectedLeadId, newMessage, subjectLine || 'New Message');
      setNewMessage('');
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in pb-2">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
           <h2 className="text-3xl font-serif font-bold text-black leading-tight">Communication</h2>
           <p className="text-gray-500 text-sm">Email and messaging history with your leads</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-[600px] overflow-hidden">
        
        {/* LEFT: Contact List */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col glass-card rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search messages..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-black/5"
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredLeads.map(lead => {
                    // Find last message snippet
                    const lastMsg = messages
                        .filter(m => m.lead_id === lead.id)
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                    
                    return (
                        <div 
                            key={lead.id}
                            onClick={() => setSelectedLeadId(lead.id)}
                            className={`p-4 rounded-2xl cursor-pointer transition-all border border-transparent ${
                                selectedLeadId === lead.id 
                                ? 'bg-black text-white shadow-lg' 
                                : 'hover:bg-white hover:border-gray-100'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-3">
                                    {lead.avatar_url ? (
                                        <img src={lead.avatar_url} className="w-10 h-10 rounded-full object-cover border border-white/20" />
                                    ) : (
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${selectedLeadId === lead.id ? 'bg-white/20' : 'bg-accent-beige'}`}>
                                            {lead.first_name[0]}{lead.last_name[0]}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h4 className={`font-bold text-sm truncate ${selectedLeadId === lead.id ? 'text-white' : 'text-gray-900'}`}>
                                            {lead.first_name} {lead.last_name}
                                        </h4>
                                        <p className={`text-xs truncate ${selectedLeadId === lead.id ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {lead.company}
                                        </p>
                                    </div>
                                </div>
                                {lastMsg && (
                                    <span className={`text-[10px] ${selectedLeadId === lead.id ? 'text-gray-400' : 'text-gray-400'}`}>
                                        {new Date(lastMsg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                            </div>
                            <p className={`text-xs line-clamp-2 ${selectedLeadId === lead.id ? 'text-gray-300' : 'text-gray-500'}`}>
                                {lastMsg ? (
                                    <span className={!lastMsg.is_read && lastMsg.direction === 'inbound' ? 'font-bold' : ''}>
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
                                    <span className="flex items-center gap-1"><Mail size={12}/> {selectedLead.email}</span>
                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                    <span className="flex items-center gap-1"><Phone size={12}/> {selectedLead.phone}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"><Phone size={18} /></button>
                            <button className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"><Star size={18} /></button>
                            <button className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"><MoreVertical size={18} /></button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white/30">
                        {currentMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                    <Mail size={32} className="opacity-50" />
                                </div>
                                <p>No conversation history. Start a new thread.</p>
                            </div>
                        ) : (
                            currentMessages.map((msg, idx) => {
                                const isUser = msg.direction === 'outbound';
                                const showAvatar = idx === 0 || currentMessages[idx-1].direction !== msg.direction;

                                return (
                                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                                        <div className={`flex gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                            {/* Avatar placeholder for alignment */}
                                            <div className="w-8 flex-shrink-0 flex flex-col items-center">
                                                {!isUser && showAvatar && selectedLead.avatar_url && (
                                                    <img src={selectedLead.avatar_url} className="w-8 h-8 rounded-full object-cover shadow-sm" />
                                                )}
                                                {!isUser && showAvatar && !selectedLead.avatar_url && (
                                                    <div className="w-8 h-8 rounded-full bg-accent-beige flex items-center justify-center text-xs font-bold">
                                                        {selectedLead.first_name[0]}
                                                    </div>
                                                )}
                                            </div>

                                            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                                                <div className={`
                                                    p-4 rounded-2xl shadow-sm relative
                                                    ${isUser 
                                                        ? 'bg-black text-white rounded-tr-sm' 
                                                        : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                                                    }
                                                `}>
                                                    {msg.subject && !msg.subject.startsWith('Re:') && (
                                                        <p className={`text-xs font-bold mb-2 ${isUser ? 'text-gray-400' : 'text-gray-500'}`}>
                                                            Subject: {msg.subject}
                                                        </p>
                                                    )}
                                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                                                </div>
                                                <span className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 px-1">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {isUser && <span className="text-gray-300 ml-1">Read</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Compose Area */}
                    <div className="p-4 bg-white/60 border-t border-gray-100 backdrop-blur-md">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 transition-all focus-within:ring-2 focus-within:ring-black/5 focus-within:border-black/20">
                            {currentMessages.length === 0 && (
                                <input
                                    type="text"
                                    placeholder="Subject"
                                    value={subjectLine}
                                    onChange={(e) => setSubjectLine(e.target.value)}
                                    className="w-full px-4 py-2 border-b border-gray-100 text-sm font-semibold outline-none text-gray-900 bg-transparent placeholder-gray-400"
                                />
                            )}
                            <textarea
                                placeholder="Write your email to the lead..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                className="w-full px-4 py-3 min-h-[80px] outline-none text-sm resize-none text-gray-900 bg-transparent placeholder-gray-400"
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && e.metaKey) handleSend();
                                }}
                            />
                            <div className="flex justify-between items-center px-2 pb-1">
                                <div className="flex gap-2">
                                    <button className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-full transition-colors">
                                        <Paperclip size={18} />
                                    </button>
                                </div>
                                <button 
                                    onClick={handleSend}
                                    disabled={!newMessage.trim()}
                                    className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-black/10"
                                >
                                    <span>Send Email</span>
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <Mail size={48} className="opacity-20 mb-4" />
                    <p>Select a conversation to start messaging</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ContactView;