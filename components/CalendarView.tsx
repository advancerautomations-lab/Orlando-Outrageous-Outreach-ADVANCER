import React, { useState, useEffect, useMemo } from 'react';
import { Meeting, Lead, Message } from '../types';
import { ChevronLeft, ChevronRight, Clock, X, Loader2, Users, Calendar, Trash2, TrendingUp, MessageSquare, Zap } from 'lucide-react';
import { useGmail, CalendarEvent } from '../contexts/GmailContext';

interface CalendarViewProps {
    meetings: Meeting[];
    leads: Lead[];
    messages: Message[];
}

interface LeadActivity {
    lead: Lead;
    messageCount: number;
    lastActivity: Date | null;
    recentMessages: number; // Messages in last 7 days
    activityScore: number;
}

const CalendarView: React.FC<CalendarViewProps> = ({ meetings, leads, messages }) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDayViewModal, setShowDayViewModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedLeadId, setSelectedLeadId] = useState<string>('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [isCreating, setIsCreating] = useState(false);

    // Edit modal state
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStartTime, setEditStartTime] = useState('09:00');
    const [editEndTime, setEditEndTime] = useState('10:00');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const { isAuthenticated, getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = useGmail();

    // Timeline constants
    const HOUR_HEIGHT = 60;
    const DAY_START_HOUR = 7;
    const DAY_END_HOUR = 22;
    const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

    // Timeline positioning functions
    const calculateYPosition = (startTimeStr: string): number => {
        const date = new Date(startTimeStr);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        return ((hours - DAY_START_HOUR) * HOUR_HEIGHT) + (minutes / 60 * HOUR_HEIGHT);
    };

    const calculateHeight = (startTimeStr: string, endTimeStr: string): number => {
        const durationMs = new Date(endTimeStr).getTime() - new Date(startTimeStr).getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        return Math.max(40, durationHours * HOUR_HEIGHT);
    };

    const formatHour = (hour: number): string => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour} ${ampm}`;
    };

    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentYear = currentDate.getFullYear();

    // Fetch calendar events when month changes
    useEffect(() => {
        if (isAuthenticated) {
            fetchEvents();
        }
    }, [currentDate, isAuthenticated]);

    const fetchEvents = async () => {
        setIsLoadingEvents(true);
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

        const events = await getCalendarEvents(startOfMonth, endOfMonth);
        setCalendarEvents(events);
        setIsLoadingEvents(false);
    };

    // Generate calendar grid
    const generateCalendarDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPadding = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        const calendarDays: (number | null)[] = [];

        // Add padding for days before the first of the month
        for (let i = 0; i < startPadding; i++) {
            calendarDays.push(null);
        }

        // Add the days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            calendarDays.push(i);
        }

        return calendarDays;
    };

    const getEventsForDay = (day: number) => {
        const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
        return calendarEvents.filter(event => {
            const eventDate = new Date(event.start).toDateString();
            return eventDate === dateStr;
        });
    };

    // Map lead emails for quick lookup from event attendees
    const leadsByEmail = useMemo(() => {
        const map = new Map<string, Lead>();
        for (const l of leads) {
            if (l.email) map.set(l.email.toLowerCase(), l);
        }
        return map;
    }, [leads]);

    const getLeadForEvent = (event: CalendarEvent): Lead | null => {
        if (!event.attendees) return null;
        for (const att of event.attendees) {
            const lead = leadsByEmail.get(att.email.toLowerCase());
            if (lead) return lead;
        }
        return null;
    };

    const handleDayClick = (day: number) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSelectedDate(date);
        setShowDayViewModal(true);
    };

    const handleScheduleFromDayView = () => {
        setShowDayViewModal(false);
        setShowCreateModal(true);
    };

    // Get events for selected date
    const getSelectedDateEvents = () => {
        if (!selectedDate) return [];
        const dateStr = selectedDate.toDateString();
        return calendarEvents
            .filter(event => new Date(event.start).toDateString() === dateStr)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    };

    // Format time for display
    const formatEventTime = (start: string, end: string) => {
        const startTime = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${startTime} - ${endTime}`;
    };

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleCreateMeeting = async () => {
        if (!title.trim() || !selectedDate) return;

        setIsCreating(true);

        // Build start and end times
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const start = new Date(selectedDate);
        start.setHours(startHour, startMin, 0, 0);

        const end = new Date(selectedDate);
        end.setHours(endHour, endMin, 0, 0);

        const selectedLead = leads.find(l => l.id === selectedLeadId);
        const attendeeEmail = selectedLead?.email;

        const success = await createCalendarEvent(
            title,
            description,
            start,
            end,
            selectedLeadId || undefined,
            attendeeEmail
        );

        setIsCreating(false);

        if (success) {
            // Reset form
            setTitle('');
            setDescription('');
            setSelectedLeadId('');
            setStartTime('09:00');
            setEndTime('10:00');
            setShowCreateModal(false);
            // Refresh events
            fetchEvents();
        }
    };

    // Event click handler for timeline
    const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedEvent(event);
        setEditTitle(event.summary);
        setEditDescription(event.description || '');
        // Extract time from event
        const startDate = new Date(event.start);
        const endDate = new Date(event.end);
        setEditStartTime(`${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`);
        setEditEndTime(`${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`);
        setShowEditModal(true);
    };

    // Update event handler
    const handleUpdateEvent = async () => {
        if (!selectedEvent || !editTitle.trim()) return;

        setIsUpdating(true);

        const eventDate = new Date(selectedEvent.start);
        const [startHour, startMin] = editStartTime.split(':').map(Number);
        const [endHour, endMin] = editEndTime.split(':').map(Number);

        const newStart = new Date(eventDate);
        newStart.setHours(startHour, startMin, 0, 0);

        const newEnd = new Date(eventDate);
        newEnd.setHours(endHour, endMin, 0, 0);

        const success = await updateCalendarEvent(
            selectedEvent.id,
            editTitle,
            editDescription,
            newStart,
            newEnd
        );

        setIsUpdating(false);

        if (success) {
            setShowEditModal(false);
            setSelectedEvent(null);
            fetchEvents();
        }
    };

    // Delete event handler
    const handleDeleteEvent = async () => {
        if (!selectedEvent) return;

        setIsDeleting(true);
        const success = await deleteCalendarEvent(selectedEvent.id);
        setIsDeleting(false);

        if (success) {
            setShowDeleteConfirm(false);
            setShowEditModal(false);
            setSelectedEvent(null);
            fetchEvents();
        }
    };

    const today = new Date();
    const isToday = (day: number) => {
        return day === today.getDate() &&
            currentDate.getMonth() === today.getMonth() &&
            currentDate.getFullYear() === today.getFullYear();
    };

    // Get upcoming meetings
    const upcomingMeetings = [...meetings]
        .filter(m => new Date(m.start_time) >= new Date())
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 5);

    // Calculate lead activity scores for "Hot Leads" section
    const hotLeads = useMemo((): LeadActivity[] => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        return leads
            .map(lead => {
                const leadMessages = messages.filter(m => m.lead_id === lead.id);
                const recentMessages = leadMessages.filter(m => new Date(m.timestamp) >= sevenDaysAgo);

                // Find most recent message
                const sortedMessages = [...leadMessages].sort(
                    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );
                const lastActivity = sortedMessages.length > 0 ? new Date(sortedMessages[0].timestamp) : null;

                // Calculate activity score:
                // - Recent messages (last 7 days) weighted heavily (x3)
                // - Total messages add base score
                // - Recency bonus (messages in last 24h get extra weight)
                const last24h = leadMessages.filter(m =>
                    new Date(m.timestamp) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
                ).length;

                const activityScore =
                    (recentMessages.length * 3) +
                    (leadMessages.length * 0.5) +
                    (last24h * 5);

                return {
                    lead,
                    messageCount: leadMessages.length,
                    lastActivity,
                    recentMessages: recentMessages.length,
                    activityScore
                };
            })
            .filter(la => la.messageCount > 0) // Only leads with some activity
            .sort((a, b) => b.activityScore - a.activityScore)
            .slice(0, 5);
    }, [leads, messages]);

    // Quick schedule handler for hot leads
    const handleQuickSchedule = (lead: Lead) => {
        setSelectedDate(new Date());
        setSelectedLeadId(lead.id);
        setTitle(`Meeting with ${lead.first_name} ${lead.last_name}`);
        setShowCreateModal(true);
    };

    // Format relative time
    const formatRelativeTime = (date: Date | null): string => {
        if (!date) return 'No activity';

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <div className="h-full flex gap-6 animate-fade-in">
            <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-3xl font-serif font-bold text-black mb-2">Schedule</h2>
                        <p className="text-gray-500">Manage your meetings and events.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {isLoadingEvents && (
                            <Loader2 size={20} className="animate-spin text-gray-400" />
                        )}
                        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                            <button
                                onClick={handlePrevMonth}
                                className="p-1 hover:bg-gray-100 rounded-full cursor-pointer"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="font-semibold w-36 text-center">{currentMonth} {currentYear}</span>
                            <button
                                onClick={handleNextMonth}
                                className="p-1 hover:bg-gray-100 rounded-full cursor-pointer"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="glass-card flex-1 rounded-3xl p-6 overflow-hidden flex flex-col">
                    <div className="grid grid-cols-7 mb-4">
                        {days.map(d => (
                            <div key={d} className="text-center text-sm font-medium text-gray-400 py-2">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 flex-1 gap-1 auto-rows-fr">
                        {generateCalendarDays().map((day, idx) => {
                            if (day === null) {
                                return <div key={`empty-${idx}`} className="p-2 opacity-30"></div>;
                            }

                            const dayEvents = getEventsForDay(day);
                            const hasEvents = dayEvents.length > 0;
                            const todayClass = isToday(day);

                            return (
                                <div
                                    key={day}
                                    onClick={() => handleDayClick(day)}
                                    className={`
                                        relative p-2 rounded-xl border border-transparent transition-all duration-200 cursor-pointer
                                        ${todayClass ? 'bg-black text-white shadow-lg' : 'hover:bg-white hover:shadow-sm hover:border-gray-100'}
                                        ${hasEvents && !todayClass ? 'bg-accent-beige/20' : ''}
                                    `}
                                >
                                    <span className={`text-sm font-semibold ${todayClass ? 'text-white' : 'text-gray-700'}`}>
                                        {day}
                                    </span>
                                    {hasEvents && (
                                        <div className="mt-1">
                                            {/* Lead avatars row */}
                                            <div className="flex -space-x-1.5 mb-1">
                                                {dayEvents.slice(0, 3).map((event) => {
                                                    const lead = getLeadForEvent(event);
                                                    if (lead?.avatar_url) {
                                                        return (
                                                            <img
                                                                key={event.id}
                                                                src={lead.avatar_url}
                                                                alt=""
                                                                className={`w-6 h-6 rounded-full object-cover ring-2 ${todayClass ? 'ring-black' : 'ring-white'}`}
                                                            />
                                                        );
                                                    }
                                                    if (lead) {
                                                        return (
                                                            <div
                                                                key={event.id}
                                                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ${
                                                                    todayClass
                                                                        ? 'bg-white/30 text-white ring-black'
                                                                        : 'bg-accent-beige text-black ring-white'
                                                                }`}
                                                                title={`${lead.first_name} ${lead.last_name}`}
                                                            >
                                                                {lead.first_name[0]}{lead.last_name[0]}
                                                            </div>
                                                        );
                                                    }
                                                    // Event without a matching lead — show calendar dot
                                                    return (
                                                        <div
                                                            key={event.id}
                                                            className={`w-6 h-6 rounded-full flex items-center justify-center ring-2 ${
                                                                todayClass
                                                                    ? 'bg-white/20 ring-black'
                                                                    : 'bg-gray-200 ring-white'
                                                            }`}
                                                        >
                                                            <Calendar size={10} className={todayClass ? 'text-white' : 'text-gray-500'} />
                                                        </div>
                                                    );
                                                })}
                                                {dayEvents.length > 3 && (
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ${
                                                        todayClass ? 'bg-white/20 text-white ring-black' : 'bg-gray-100 text-gray-500 ring-white'
                                                    }`}>
                                                        +{dayEvents.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            {/* First event title */}
                                            <div className={`text-[10px] truncate px-0.5 ${todayClass ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {dayEvents[0].summary}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Sidebar Panels */}
            <div className="w-80 flex flex-col gap-4 overflow-y-auto">
                {/* Hot Leads Section */}
                {hotLeads.length > 0 && (
                    <div className="glass-card p-5 rounded-2xl">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-orange-100 rounded-lg">
                                <Zap size={16} className="text-orange-600" />
                            </div>
                            <h3 className="font-serif font-bold text-lg">Hot Leads</h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Most active conversations - ready to schedule</p>
                        <div className="space-y-3">
                            {hotLeads.map(({ lead, messageCount, lastActivity, recentMessages }) => (
                                <div
                                    key={lead.id}
                                    className="p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-gray-900 text-sm truncate">
                                                {lead.first_name} {lead.last_name}
                                            </h4>
                                            <p className="text-xs text-gray-500 truncate">{lead.company}</p>
                                        </div>
                                        <button
                                            onClick={() => handleQuickSchedule(lead)}
                                            disabled={!isAuthenticated}
                                            className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                        >
                                            Schedule
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <MessageSquare size={12} />
                                            <span>{messageCount} messages</span>
                                        </div>
                                        {recentMessages > 0 && (
                                            <div className="flex items-center gap-1 text-orange-600 font-medium">
                                                <TrendingUp size={12} />
                                                <span>{recentMessages} this week</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        Last: {formatRelativeTime(lastActivity)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upcoming Panel */}
                <div className="glass-card p-5 rounded-2xl flex-1">
                    <h3 className="font-serif font-bold text-lg mb-4">Upcoming</h3>
                    <div className="space-y-3">
                        {upcomingMeetings.length === 0 && calendarEvents.filter(e => new Date(e.start) >= new Date()).length === 0 ? (
                            <p className="text-gray-400 text-sm text-center py-6">No upcoming meetings</p>
                        ) : (
                            <>
                                {upcomingMeetings.slice(0, 3).map(meeting => (
                                    <div key={meeting.id} className="p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                        <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-accent-pink uppercase tracking-wide">
                                            {new Date(meeting.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                        <h4 className="font-bold text-gray-900 text-sm leading-tight">{meeting.title}</h4>
                                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                            <Clock size={12} />
                                            <span>
                                                {new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {calendarEvents
                                    .filter(e => new Date(e.start) >= new Date())
                                    .slice(0, 2)
                                    .map(event => (
                                        <div key={event.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 shadow-sm">
                                            <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                <Calendar size={12} />
                                                {new Date(event.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-sm leading-tight">{event.summary}</h4>
                                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                                <Clock size={12} />
                                                <span>
                                                    {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                            </>
                        )}

                        <button
                            onClick={() => {
                                setSelectedDate(new Date());
                                setShowDayViewModal(true);
                            }}
                            disabled={!isAuthenticated}
                            className="w-full p-3 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm hover:border-gray-400 hover:text-gray-600 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAuthenticated ? '+ Schedule Meeting' : 'Connect Google to schedule'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Day View Modal - Timeline */}
            {showDayViewModal && selectedDate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-serif font-bold text-xl">
                                {selectedDate.toLocaleDateString(undefined, {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </h3>
                            <button
                                onClick={() => setShowDayViewModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Timeline - single scrollable container */}
                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl">
                            <div className="flex min-h-full">
                                {/* Hour labels - no independent scroll */}
                                <div className="w-16 border-r border-gray-200 bg-gray-50 flex-shrink-0">
                                    {hours.map(hour => (
                                        <div key={hour} className="h-[60px] flex items-start justify-end pr-2 pt-1">
                                            <span className="text-xs text-gray-500 font-medium">
                                                {formatHour(hour)}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Timeline grid with events */}
                                <div
                                    className="flex-1 relative bg-white"
                                    onClick={(e) => {
                                        // Calculate time from click position
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const scrollTop = e.currentTarget.closest('.overflow-y-auto')?.scrollTop || 0;
                                        const clickY = e.clientY - rect.top + scrollTop;
                                        const clickedHour = Math.floor(clickY / HOUR_HEIGHT) + DAY_START_HOUR;
                                        const clickedMinutes = Math.round((clickY % HOUR_HEIGHT) / HOUR_HEIGHT * 60 / 15) * 15; // Round to nearest 15 min

                                        // Format times
                                        const startHourStr = String(Math.min(clickedHour, 23)).padStart(2, '0');
                                        const startMinStr = String(clickedMinutes % 60).padStart(2, '0');
                                        const endHour = clickedMinutes >= 60 ? clickedHour + 2 : clickedHour + 1;
                                        const endMinStr = startMinStr;

                                        setStartTime(`${startHourStr}:${startMinStr}`);
                                        setEndTime(`${String(Math.min(endHour, 23)).padStart(2, '0')}:${endMinStr}`);
                                        setShowDayViewModal(false);
                                        setShowCreateModal(true);
                                    }}
                                >
                                    {/* Grid lines */}
                                    {hours.map(hour => (
                                        <div key={hour} className="h-[60px] border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer" />
                                    ))}

                                    {/* Events positioned absolutely */}
                                    {getSelectedDateEvents().map(event => {
                                        const yPos = calculateYPosition(event.start);
                                        const height = calculateHeight(event.start, event.end);

                                        return (
                                            <div
                                                key={event.id}
                                                onClick={(e) => handleEventClick(event, e)}
                                                className="absolute left-1 right-1 bg-black text-white rounded-lg p-2 cursor-pointer hover:bg-gray-800 transition-colors shadow-md overflow-hidden"
                                                style={{
                                                    top: `${yPos}px`,
                                                    height: `${height}px`,
                                                    minHeight: '40px'
                                                }}
                                            >
                                                <div className="text-sm font-medium truncate">{event.summary}</div>
                                                <div className="text-xs opacity-75">{formatEventTime(event.start, event.end)}</div>
                                                {event.attendees && event.attendees.length > 0 && height > 60 && (
                                                    <div className="text-xs opacity-60 truncate mt-1">
                                                        {event.attendees.map(a => a.email).join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Empty state - click hint */}
                                    {getSelectedDateEvents().length === 0 && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                                            <Calendar size={40} className="mb-3 opacity-50" />
                                            <p className="text-sm">No meetings scheduled</p>
                                            <p className="text-xs mt-1">Click anywhere to schedule</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Schedule button */}
                        <button
                            onClick={handleScheduleFromDayView}
                            disabled={!isAuthenticated}
                            className="w-full py-3 mt-4 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2 font-medium"
                        >
                            <Calendar size={18} />
                            Schedule Meeting
                        </button>
                    </div>
                </div>
            )}

            {/* Edit Event Modal */}
            {showEditModal && selectedEvent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-serif font-bold text-xl">Edit Meeting</h3>
                            <button
                                onClick={() => {
                                    setShowEditModal(false);
                                    setSelectedEvent(null);
                                    setShowDeleteConfirm(false);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Date display */}
                            <div className="p-3 bg-gray-50 rounded-xl text-center">
                                <span className="font-semibold text-gray-700">
                                    {new Date(selectedEvent.start).toLocaleDateString(undefined, {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </span>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Meeting title"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                />
                            </div>

                            {/* Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                    <input
                                        type="time"
                                        value={editStartTime}
                                        onChange={(e) => setEditStartTime(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                    <input
                                        type="time"
                                        value={editEndTime}
                                        onChange={(e) => setEditEndTime(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Duration presets */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                                <div className="flex gap-2">
                                    {[15, 30, 45, 60].map(duration => {
                                        const [startH, startM] = editStartTime.split(':').map(Number);
                                        const [endH, endM] = editEndTime.split(':').map(Number);
                                        const currentDuration = (endH * 60 + endM) - (startH * 60 + startM);
                                        const isSelected = currentDuration === duration;

                                        return (
                                            <button
                                                key={duration}
                                                type="button"
                                                onClick={() => {
                                                    const [h, m] = editStartTime.split(':').map(Number);
                                                    const totalMinutes = h * 60 + m + duration;
                                                    const newEndHour = Math.floor(totalMinutes / 60);
                                                    const newEndMin = totalMinutes % 60;
                                                    setEditEndTime(`${String(Math.min(newEndHour, 23)).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`);
                                                }}
                                                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-black text-white'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {duration} min
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Meeting details..."
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none resize-none"
                                />
                            </div>

                            {/* Delete confirmation */}
                            {showDeleteConfirm ? (
                                <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                                    <p className="text-sm text-red-800 mb-3">Are you sure you want to cancel this meeting? This will notify all attendees.</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white transition-colors cursor-pointer"
                                        >
                                            Keep Meeting
                                        </button>
                                        <button
                                            onClick={handleDeleteEvent}
                                            disabled={isDeleting}
                                            className="flex-1 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            {isDeleting ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    Cancelling...
                                                </>
                                            ) : (
                                                <>
                                                    <Trash2 size={16} />
                                                    Cancel Meeting
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Actions */
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="py-2 px-4 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-2"
                                    >
                                        <Trash2 size={16} />
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowEditModal(false);
                                            setSelectedEvent(null);
                                        }}
                                        className="flex-1 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={handleUpdateEvent}
                                        disabled={!editTitle.trim() || isUpdating}
                                        className="flex-1 py-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        {isUpdating ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            'Save Changes'
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Meeting Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-serif font-bold text-xl">Schedule Meeting</h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Date display */}
                            <div className="p-3 bg-gray-50 rounded-xl text-center">
                                <span className="font-semibold text-gray-700">
                                    {selectedDate?.toLocaleDateString(undefined, {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </span>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Meeting title"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                />
                            </div>

                            {/* Lead selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <Users size={14} className="inline mr-1" />
                                    With Lead (optional)
                                </label>
                                <select
                                    value={selectedLeadId}
                                    onChange={(e) => setSelectedLeadId(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none bg-white"
                                >
                                    <option value="">Select a lead...</option>
                                    {leads.map(lead => (
                                        <option key={lead.id} value={lead.id}>
                                            {lead.first_name} {lead.last_name} - {lead.company}
                                        </option>
                                    ))}
                                </select>
                                {selectedLeadId && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Invite will be sent to {leads.find(l => l.id === selectedLeadId)?.email}
                                    </p>
                                )}
                            </div>

                            {/* Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                    <input
                                        type="time"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Duration presets */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                                <div className="flex gap-2">
                                    {[15, 30, 45, 60].map(duration => {
                                        // Calculate if this duration matches current selection
                                        const [startH, startM] = startTime.split(':').map(Number);
                                        const [endH, endM] = endTime.split(':').map(Number);
                                        const currentDuration = (endH * 60 + endM) - (startH * 60 + startM);
                                        const isSelected = currentDuration === duration;

                                        return (
                                            <button
                                                key={duration}
                                                type="button"
                                                onClick={() => {
                                                    const [h, m] = startTime.split(':').map(Number);
                                                    const totalMinutes = h * 60 + m + duration;
                                                    const newEndHour = Math.floor(totalMinutes / 60);
                                                    const newEndMin = totalMinutes % 60;
                                                    setEndTime(`${String(Math.min(newEndHour, 23)).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`);
                                                }}
                                                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-black text-white'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {duration} min
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Meeting details..."
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none resize-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateMeeting}
                                    disabled={!title.trim() || isCreating}
                                    className="flex-1 py-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isCreating ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        'Create Meeting'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarView;
