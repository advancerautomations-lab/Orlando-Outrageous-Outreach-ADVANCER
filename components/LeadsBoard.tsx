import React, { useState } from 'react';
import { Lead, LeadStatus } from '../types';
import { 
  Plus, Search, Filter, LayoutGrid, List, RefreshCw, Upload, Edit3, 
  MoreHorizontal, ChevronRight, Star, Paperclip, Send, X, 
  ArrowLeft, Bell, Smartphone, Share2, Calendar, CheckCircle2,
  MoreVertical, Printer, Download, Mail
} from 'lucide-react';

interface LeadsBoardProps {
  leads: Lead[];
  onUpdateStatus: (leadId: string, newStatus: LeadStatus) => void;
}

const LeadsBoard: React.FC<LeadsBoardProps> = ({ leads, onUpdateStatus }) => {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leads[0]?.id || null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  // Derived Stats
  const totalValue = leads.reduce((acc, l) => acc + l.value, 0);
  const activeCount = leads.filter(l => l.status !== LeadStatus.LOST && l.status !== LeadStatus.WON).length;
  const wonValue = leads.filter(l => l.status === LeadStatus.WON).reduce((acc, l) => acc + l.value, 0);

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in pb-8">
        
        {/* 1. Page Header & Actions */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            <div className="flex items-center gap-4">
                <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-3xl font-serif font-bold text-black leading-tight">Customers & Leads</h2>
                    <p className="text-gray-500 text-sm">Manage your pipeline and relationships</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                {/* Icon Group */}
                <div className="flex items-center bg-white/50 border border-white/60 rounded-full px-2 py-1.5 shadow-sm">
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Bell size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Send size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Calendar size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Smartphone size={18} /></button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Plus size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Star size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Upload size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Share2 size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-black hover:bg-white rounded-full transition-all"><Search size={18} /></button>
                </div>

                <div className="h-8 w-px bg-gray-300 hidden xl:block"></div>

                <button className="bg-white px-4 py-2.5 rounded-full text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                    Filter Type
                </button>
                
                <button className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-full hover:bg-gray-800 shadow-lg shadow-black/20 transition-all active:scale-95">
                    <span className="font-medium">New Customer</span>
                    <Plus size={16} className="bg-white/20 rounded-full p-0.5" />
                </button>
            </div>
        </div>

        {/* 2. Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 px-2">
            <div>
                <p className="text-2xl font-serif font-bold text-gray-900">${totalValue.toLocaleString()}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Total Pipeline</p>
            </div>
            <div>
                <p className="text-2xl font-serif font-bold text-gray-900">${wonValue.toLocaleString()}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Won Revenue</p>
            </div>
            <div>
                <p className="text-2xl font-serif font-bold text-gray-900">{activeCount}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Active Deals</p>
            </div>
            <div>
                <p className="text-2xl font-serif font-bold text-gray-900">$0.00</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Unbilled Income</p>
            </div>
        </div>

        {/* 3. Segmented Progress Bar */}
        <div className="w-full h-4 rounded-full flex overflow-hidden shadow-inner">
            <div className="w-[35%] bg-black h-full"></div>
            <div className="w-[20%] bg-gray-500 h-full"></div>
            <div className="w-[25%] bg-accent-beige h-full"></div>
            <div className="w-[15%] bg-white h-full"></div>
            <div className="w-[5%] bg-accent-pink h-full"></div>
        </div>

        {/* 4. Split Layout (List + Detail) */}
        <div className="flex-1 grid grid-cols-12 gap-6 min-h-[600px]">
            
            {/* LEFT: List View */}
            <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col glass-card rounded-3xl overflow-hidden">
                {/* List Header */}
                <div className="p-6 pb-2">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <h3 className="font-serif font-bold text-xl">All Leads</h3>
                            <button className="p-1.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 shadow-sm transition-all">
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex bg-gray-100 rounded-full p-1">
                                <button 
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-full transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                                >
                                    <List size={16} />
                                </button>
                                <button 
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-full transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                                >
                                    <LayoutGrid size={16} />
                                </button>
                            </div>
                            <button className="p-2 text-gray-400 hover:text-black"><RefreshCw size={18} /></button>
                            <button className="p-2 text-gray-400 hover:text-black"><Upload size={18} /></button>
                            <button className="p-2 text-gray-400 hover:text-black"><Edit3 size={18} /></button>
                        </div>
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200/50">
                         <div className="col-span-4">Name</div>
                         <div className="col-span-3">Phone</div>
                         <div className="col-span-2">Value</div>
                         <div className="col-span-3 text-right">Action</div>
                    </div>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto px-2">
                    {leads.map((lead) => (
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
                            <div className="col-span-4 flex items-center gap-3">
                                {lead.avatar_url ? (
                                    <img src={lead.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-accent-beige flex items-center justify-center font-serif font-bold text-sm">
                                        {lead.first_name[0]}{lead.last_name[0]}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className={`font-semibold text-sm truncate ${selectedLeadId === lead.id ? 'text-black' : 'text-gray-700'}`}>
                                        {lead.first_name} {lead.last_name}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">{lead.company}</p>
                                </div>
                            </div>

                            <div className="col-span-3 text-sm text-gray-600">
                                {lead.phone || 'N/A'}
                            </div>

                            <div className="col-span-2 text-sm font-medium text-gray-900">
                                ${lead.value.toLocaleString()}
                            </div>

                            <div className="col-span-3 flex items-center justify-end gap-2">
                                <button className={`
                                    px-3 py-1.5 rounded-full text-xs font-medium transition-all
                                    ${selectedLeadId === lead.id 
                                        ? 'bg-black text-white' 
                                        : 'bg-white border border-gray-200 text-gray-600 group-hover:border-gray-300'
                                    }
                                `}>
                                    {lead.status === 'New' ? 'Contact' : 'View'}
                                </button>
                                <button className="p-1.5 text-gray-400 hover:text-black opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal size={16} />
                                </button>
                                {selectedLeadId === lead.id && (
                                    <ArrowLeft size={16} className="text-black rotate-180" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* RIGHT: Detail View */}
            <div className="col-span-12 lg:col-span-5 xl:col-span-4 glass-card rounded-3xl flex flex-col overflow-hidden">
                {selectedLead ? (
                    <>
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                            <div>
                                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                                    Lead Details
                                </h4>
                                <p className="text-xs text-gray-400 mt-1">ID: #{selectedLead.id.toUpperCase()}</p>
                            </div>
                            <div className="flex gap-2">
                                <button className="p-2 bg-white rounded-full hover:bg-gray-50 text-gray-500 transition-colors shadow-sm"><Paperclip size={16} /></button>
                                <button className="p-2 bg-white rounded-full hover:bg-gray-50 text-gray-500 transition-colors shadow-sm"><Send size={16} /></button>
                                <button className="p-2 bg-white rounded-full hover:bg-gray-50 text-gray-500 transition-colors shadow-sm"><Upload size={16} /></button>
                                <button className="p-2 bg-white rounded-full hover:bg-gray-50 text-gray-500 transition-colors shadow-sm"><Edit3 size={16} /></button>
                                <div className="w-px h-8 bg-gray-200 mx-1"></div>
                                <button className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"><X size={18} /></button>
                            </div>
                        </div>

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
                                <div className="absolute top-0 right-0 bg-white p-1.5 rounded-full shadow-md text-yellow-400">
                                    <Star size={16} fill="currentColor" />
                                </div>
                            </div>
                            
                            <h3 className="font-serif font-bold text-2xl text-black mb-1">
                                {selectedLead.first_name} {selectedLead.last_name}
                            </h3>
                            <div className="text-sm text-gray-500 mb-6 max-w-[200px]">
                                1561 Appleview Town, Bakers Street, Chicago, U.S.A {/* Mock address */}
                            </div>

                            <div className="w-full grid grid-cols-2 gap-4 text-left border-t border-gray-100 pt-6">
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">Company</p>
                                    <p className="font-semibold text-sm text-accent-pink">{selectedLead.company}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400 mb-1">Est. Value</p>
                                    <p className="font-semibold text-sm text-black">${selectedLead.value.toFixed(2)}</p>
                                </div>
                                
                                <div className="col-span-2 flex items-center gap-3 mt-4 bg-white/50 p-3 rounded-xl">
                                    {selectedLead.avatar_url ? (
                                        <img src={selectedLead.avatar_url} className="w-8 h-8 rounded-full" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-black"></div>
                                    )}
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase">Contact Person</p>
                                        <p className="text-xs font-bold text-black">{selectedLead.first_name} {selectedLead.last_name}</p>
                                    </div>
                                </div>

                                <div className="col-span-2 flex justify-between mt-2">
                                    <div>
                                        <p className="text-xs text-gray-400">Created Date</p>
                                        <p className="text-xs font-semibold">{new Date(selectedLead.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">Source</p>
                                        <p className="text-xs font-semibold">{selectedLead.source}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Items Table Mock */}
                        <div className="flex-1 bg-white/40 overflow-y-auto">
                            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50/50 border-y border-gray-100 text-[10px] font-bold text-gray-400 uppercase">
                                <div className="col-span-1">#</div>
                                <div className="col-span-7">Item & Description</div>
                                <div className="col-span-2 text-right">Qty</div>
                                <div className="col-span-2 text-right">Amt</div>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-12 gap-2 text-sm">
                                    <div className="col-span-1 text-gray-400">1</div>
                                    <div className="col-span-7 font-medium text-gray-800">Initial Consultation</div>
                                    <div className="col-span-2 text-right text-gray-500">1.00</div>
                                    <div className="col-span-2 text-right font-semibold">150.00</div>
                                </div>
                                <div className="grid grid-cols-12 gap-2 text-sm">
                                    <div className="col-span-1 text-gray-400">2</div>
                                    <div className="col-span-7 font-medium text-gray-800">Product Samples Kit</div>
                                    <div className="col-span-2 text-right text-gray-500">2.00</div>
                                    <div className="col-span-2 text-right font-semibold">80.00</div>
                                </div>
                                <div className="grid grid-cols-12 gap-2 text-sm">
                                    <div className="col-span-1 text-gray-400">3</div>
                                    <div className="col-span-7 font-medium text-gray-800">Service Retainer</div>
                                    <div className="col-span-2 text-right text-gray-500">1.00</div>
                                    <div className="col-span-2 text-right font-semibold">500.00</div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Totals */}
                        <div className="mt-auto">
                            <div className="flex justify-between items-center px-6 py-3 bg-white border-t border-gray-100">
                                <span className="text-sm text-gray-500">Sub Total</span>
                                <span className="text-sm font-bold">$730.00</span>
                            </div>
                            <div className="flex justify-between items-center px-6 py-3 bg-gray-100">
                                <span className="text-sm text-gray-600">Tax (10%)</span>
                                <span className="text-sm font-bold">$73.00</span>
                            </div>
                            <div className="flex justify-between items-center px-6 py-4 bg-accent-beige text-black">
                                <span className="text-sm font-bold uppercase">Total Value</span>
                                <span className="text-lg font-serif font-bold">${selectedLead.value.toLocaleString()}</span>
                            </div>
                        </div>
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
    </div>
  );
};

export default LeadsBoard;