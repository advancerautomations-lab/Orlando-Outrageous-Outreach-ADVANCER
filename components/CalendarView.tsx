import React from 'react';
import { Meeting } from '../types';
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';

interface CalendarViewProps {
  meetings: Meeting[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ meetings }) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  
  // Simplified calendar generation logic for demo
  const currentMonth = today.toLocaleString('default', { month: 'long' });
  const currentYear = today.getFullYear();

  // Generate mock grid for visual purposes
  const generateDays = () => {
    const dates = [];
    for (let i = 1; i <= 30; i++) {
        dates.push(i);
    }
    return dates;
  };

  return (
    <div className="h-full flex gap-6 animate-fade-in">
        <div className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-serif font-bold text-black mb-2">Schedule</h2>
                    <p className="text-gray-500">Manage your meetings and events.</p>
                </div>
                 <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                    <button className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
                    <span className="font-semibold w-32 text-center">{currentMonth} {currentYear}</span>
                    <button className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
                </div>
            </div>

            <div className="glass-card flex-1 rounded-3xl p-6 overflow-hidden flex flex-col">
                <div className="grid grid-cols-7 mb-4">
                    {days.map(d => (
                        <div key={d} className="text-center text-sm font-medium text-gray-400 py-2">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 grid-rows-5 flex-1 gap-2">
                    {/* Empty slots for previous month */}
                    {[1,2,3].map(n => <div key={`prev-${n}`} className="p-2 opacity-30"></div>)}
                    
                    {generateDays().map(day => {
                        const hasMeeting = meetings.some(m => new Date(m.start_time).getDate() === day);
                        const isToday = day === today.getDate();
                        
                        return (
                            <div 
                                key={day} 
                                className={`
                                    relative p-2 rounded-xl border border-transparent transition-all duration-200 cursor-pointer
                                    ${isToday ? 'bg-black text-white shadow-lg' : 'hover:bg-white hover:shadow-sm hover:border-gray-100'}
                                    ${hasMeeting && !isToday ? 'bg-accent-beige/20' : ''}
                                `}
                            >
                                <span className={`text-sm font-semibold ${isToday ? 'text-white' : 'text-gray-700'}`}>{day}</span>
                                {hasMeeting && (
                                    <div className="mt-2 space-y-1">
                                        <div className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-accent-pink' : 'bg-black'}`}></div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Upcoming Panel */}
        <div className="w-80 flex flex-col gap-4">
             <div className="glass-card p-6 rounded-2xl h-full">
                <h3 className="font-serif font-bold text-xl mb-6">Upcoming</h3>
                <div className="space-y-4">
                    {meetings.map(meeting => (
                        <div key={meeting.id} className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer">
                            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-accent-pink uppercase tracking-wide">
                                {new Date(meeting.start_time).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                            </div>
                            <h4 className="font-bold text-gray-900 mb-2 leading-tight">{meeting.title}</h4>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                <div className="flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>
                                        {new Date(meeting.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                            </div>
                            <div className="h-0 group-hover:h-8 overflow-hidden transition-all duration-300">
                                <button className="mt-3 w-full py-1 text-xs bg-black text-white rounded-md">View Details</button>
                            </div>
                        </div>
                    ))}
                    
                    <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm hover:border-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                        + Schedule Meeting
                    </div>
                </div>
             </div>
        </div>
    </div>
  );
};

export default CalendarView;
