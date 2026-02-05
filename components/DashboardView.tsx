import React from 'react';
import { Lead, Meeting } from '../types';
import { ArrowUpRight, DollarSign, Users, CalendarCheck, MoreHorizontal, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';

interface DashboardViewProps {
  leads: Lead[];
  meetings: Meeting[];
}

const DashboardView: React.FC<DashboardViewProps> = ({ leads, meetings }) => {
  const totalValue = leads.reduce((acc, curr) => acc + curr.value, 0);
  const activeLeads = leads.filter(l => l.status !== 'Lost' && l.status !== 'Won').length;
  
  // Mock data for charts
  const data = [
    { name: 'Won', value: 30, color: '#000000' },
    { name: 'Active', value: 45, color: '#EBD3C1' },
    { name: 'Lost', value: 25, color: '#F9B6B6' },
  ];

  const activityData = [
    { day: 'Mon', calls: 12, emails: 24 },
    { day: 'Tue', calls: 18, emails: 30 },
    { day: 'Wed', calls: 15, emails: 45 },
    { day: 'Thu', calls: 22, emails: 35 },
    { day: 'Fri', calls: 30, emails: 20 },
  ];

  const StatCard = ({ label, value, icon: Icon, trend }: any) => (
    <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-accent-beige/20 rounded-full blur-2xl group-hover:bg-accent-pink/20 transition-all duration-500" />
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-white rounded-xl shadow-sm">
          <Icon size={20} className="text-black" />
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">
          +{trend}% <TrendingUp size={12} />
        </span>
      </div>
      <h3 className="text-gray-500 font-medium text-sm mb-1">{label}</h3>
      <p className="text-3xl font-serif font-bold text-black">{value}</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif font-bold text-black mb-2">Dashboard Overview</h2>
          <p className="text-gray-500">Welcome back, here's what's happening with your leads today.</p>
        </div>
        <div className="flex gap-3">
             <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50">Last 30 Days</button>
             <button className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 shadow-lg shadow-black/20">Download Report</button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Pipeline Value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} trend={12} />
        <StatCard label="Active Leads" value={activeLeads} icon={Users} trend={5} />
        <StatCard label="Scheduled Meetings" value={meetings.length} icon={CalendarCheck} trend={8} />
        <StatCard label="Conversion Rate" value="24%" icon={ArrowUpRight} trend={2} />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif font-bold text-xl">Weekly Activity</h3>
                <button className="text-gray-400 hover:text-black"><MoreHorizontal size={20} /></button>
            </div>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityData}>
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} />
                        <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)' }}
                            cursor={{fill: 'transparent'}}
                        />
                        <Bar dataKey="calls" fill="#000000" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="emails" fill="#EBD3C1" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif font-bold text-xl">Lead Status</h3>
                <button className="text-gray-400 hover:text-black"><MoreHorizontal size={20} /></button>
            </div>
            <div className="h-64 relative">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                            ))}
                        </Pie>
                         <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
                {/* Center text overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold font-serif">{leads.length}</span>
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Total</span>
                </div>
            </div>
            <div className="flex justify-center gap-6 mt-2">
                {data.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: item.color}} />
                        <span className="text-sm text-gray-500">{item.name}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
