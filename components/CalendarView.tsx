import React, { useState, useEffect, useMemo, useRef } from 'react';
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

    // Live clock for the "now" marker in the week timeline
    const [nowTime, setNowTime] = useState(new Date());

    // Loading screen: show for at least 2s while calendar data arrives
    const [showLoader, setShowLoader] = useState(true);

    // Drag-to-reschedule state
    const dragEventRef = useRef<{ event: CalendarEvent } | null>(null);
    const [dragOverDay, setDragOverDay] = useState<string | null>(null);

    // Upcoming panel tab
    const [upcomingTab, setUpcomingTab] = useState<'today' | 'leads' | 'potential'>('today');

    // Create modal attendee mode
    const [attendeeMode, setAttendeeMode] = useState<'lead' | 'custom'>('lead');
    const [customEmail, setCustomEmail] = useState('');

    // Drag-to-create state for day view timeline
    const newEventDragRef = useRef<{ startY: number; scrollParent: Element | null } | null>(null);
    const [newEventDragSel, setNewEventDragSel] = useState<{ top: number; height: number } | null>(null);

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

    // Convert a pixel Y position in the timeline to a snapped "HH:MM" string
    const snapToQuarterHour = (pixelY: number): string => {
        const maxY = hours.length * HOUR_HEIGHT;
        const clamped = Math.max(0, Math.min(pixelY, maxY));
        const totalMins = (clamped / HOUR_HEIGHT) * 60;
        const snapped = Math.round(totalMins / 15) * 15;
        const h = Math.floor(snapped / 60) + DAY_START_HOUR;
        const m = snapped % 60;
        return `${String(Math.min(h, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentYear = currentDate.getFullYear();

    // Fetch calendar events when month changes
    useEffect(() => {
        if (isAuthenticated) {
            fetchEvents();
        }
    }, [currentDate, isAuthenticated]);

    // Tick the "now" marker every minute
    useEffect(() => {
        const interval = setInterval(() => setNowTime(new Date()), 60_000);
        return () => clearInterval(interval);
    }, []);

    // Show loader for at least 2s, then hide once data has also arrived
    useEffect(() => {
        const timer = setTimeout(() => setShowLoader(false), 2000);
        return () => clearTimeout(timer);
    }, []);

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

    // --- Week timeline helpers ---
    const getWeekStart = (): Date => {
        const d = new Date();
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    };

    const getWeekDays = (): Date[] => {
        const monday = getWeekStart();
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d;
        });
    };

    const getEventsForDate = (date: Date): CalendarEvent[] => {
        const dateStr = date.toDateString();
        return calendarEvents
            .filter(e => new Date(e.start).toDateString() === dateStr)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
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
        const attendeeEmail = attendeeMode === 'custom'
            ? (customEmail.trim() || undefined)
            : selectedLead?.email;

        const success = await createCalendarEvent(
            title,
            description,
            start,
            end,
            attendeeMode === 'lead' ? (selectedLeadId || undefined) : undefined,
            attendeeEmail
        );

        setIsCreating(false);

        if (success) {
            // Reset form
            setTitle('');
            setDescription('');
            setSelectedLeadId('');
            setCustomEmail('');
            setAttendeeMode('lead');
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

    // --- Drag-to-reschedule handlers ---
    const handleDragStart = (ev: CalendarEvent) => {
        dragEventRef.current = { event: ev };
    };

    const handleDragOver = (e: React.DragEvent, dateKey: string) => {
        e.preventDefault();
        setDragOverDay(dateKey);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Only clear if leaving the column entirely (not just a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverDay(null);
        }
    };

    const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
        e.preventDefault();
        setDragOverDay(null);
        const dragged = dragEventRef.current;
        if (!dragged) return;
        dragEventRef.current = null;

        const ev = dragged.event;
        const origStart = new Date(ev.start);
        const origEnd = new Date(ev.end);
        const durationMs = origEnd.getTime() - origStart.getTime();

        const newStart = new Date(targetDate);
        newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
        const newEnd = new Date(newStart.getTime() + durationMs);

        await updateCalendarEvent(ev.id, ev.summary, ev.description || '', newStart, newEnd);
        fetchEvents();
    };

    if (showLoader || isLoadingEvents) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-6 animate-fade-in">
                {/* Animated calendar icon */}
                <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-[#522B47] flex items-center justify-center shadow-xl">
                        <Calendar size={28} className="text-[#FBEA74]" />
                    </div>
                    {/* Pulse ring */}
                    <div className="absolute inset-0 rounded-2xl bg-[#522B47] animate-ping opacity-20" />
                </div>

                {/* Text */}
                <div className="text-center">
                    <p className="text-base font-semibold text-gray-700">Loading your schedule</p>
                    <p className="text-sm text-gray-400 mt-1">Syncing with Google Calendar…</p>
                </div>

                {/* Animated dots */}
                <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                        <div
                            key={i}
                            className="w-2 h-2 rounded-full bg-[#522B47]"
                            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                        />
                    ))}
                </div>

                <style>{`
                    @keyframes bounce {
                        0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
                        40% { transform: translateY(-8px); opacity: 1; }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="flex gap-6 animate-fade-in">
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
                                        ${todayClass ? 'bg-[#522B47] text-white shadow-lg' : 'hover:bg-white hover:shadow-sm hover:border-gray-100'}
                                        ${hasEvents && !todayClass ? 'bg-accent-beige/20' : ''}
                                    `}
                                >
                                    <span className={`text-sm font-semibold ${todayClass ? 'text-white' : 'text-gray-700'}`}>
                                        {day}
                                    </span>
                                    {hasEvents && (
                                        <div className="mt-1 flex flex-col gap-0.5">
                                            {[...dayEvents]
                                                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                                                .slice(0, 3)
                                                .map((event) => (
                                                    <div
                                                        key={event.id}
                                                        className={`flex items-center gap-1 rounded-md px-1 py-0.5 ${
                                                            todayClass ? 'bg-white/15' : 'bg-white/70'
                                                        }`}
                                                    >
                                                        <span className={`text-[9px] font-semibold shrink-0 ${
                                                            todayClass ? 'text-[#FBEA74]' : 'text-[#522B47]'
                                                        }`}>
                                                            {new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                        </span>
                                                        <span className={`text-[9px] truncate ${
                                                            todayClass ? 'text-white/80' : 'text-gray-600'
                                                        }`}>
                                                            {event.summary}
                                                        </span>
                                                    </div>
                                                ))
                                            }
                                            {dayEvents.length > 3 && (
                                                <div className={`text-[9px] font-medium px-1 ${
                                                    todayClass ? 'text-white/50' : 'text-gray-400'
                                                }`}>
                                                    +{dayEvents.length - 3} more
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Sidebar — Tabbed Upcoming Panel */}
            <div className="w-80 flex flex-col gap-4 overflow-y-auto">
                <div className="glass-card p-5 rounded-2xl flex-1 flex flex-col">
                    {/* Header with tabs */}
                    <div className="flex items-center justify-between mb-4 gap-2">
                        <h3 className="font-serif font-bold text-lg shrink-0">Upcoming</h3>
                        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                            {(['today', 'leads', 'potential'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setUpcomingTab(tab)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer capitalize ${
                                        upcomingTab === tab
                                            ? 'bg-[#522B47] text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {tab === 'potential' ? '⚡ Potential' : tab === 'leads' ? '👤 Leads' : '📅 Today'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 flex flex-col gap-3 min-h-0">
                        {/* TODAY TAB */}
                        {upcomingTab === 'today' && (() => {
                            const todayStr = new Date().toDateString();
                            const now = new Date();
                            const todayEvents = calendarEvents
                                .filter(e => new Date(e.start).toDateString() === todayStr && new Date(e.start) >= now)
                                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
                            const todayMeetings = upcomingMeetings.filter(m =>
                                new Date(m.start_time).toDateString() === todayStr
                            );

                            if (todayEvents.length === 0 && todayMeetings.length === 0) {
                                return (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                                        <Calendar size={28} className="text-gray-200 mb-2" />
                                        <p className="text-gray-400 text-sm font-medium">No more meetings today</p>
                                        <p className="text-gray-300 text-xs mt-1">Enjoy the rest of your day!</p>
                                    </div>
                                );
                            }

                            return (
                                <>
                                    {todayMeetings.map(meeting => (
                                        <div key={meeting.id} className="p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-[#522B47] uppercase tracking-wide">
                                                <Clock size={10} />
                                                {new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-sm leading-tight">{meeting.title}</h4>
                                        </div>
                                    ))}
                                    {todayEvents.map(event => (
                                        <div key={event.id} className="p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-[#522B47] uppercase tracking-wide">
                                                <Clock size={10} />
                                                {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {' – '}
                                                {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-sm leading-tight">{event.summary}</h4>
                                        </div>
                                    ))}
                                </>
                            );
                        })()}

                        {/* LEADS TAB */}
                        {upcomingTab === 'leads' && (() => {
                            const now = new Date();
                            const leadEvents = calendarEvents
                                .filter(e => new Date(e.start) >= now && getLeadForEvent(e) !== null)
                                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                            if (leadEvents.length === 0) {
                                return (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                                        <Users size={28} className="text-gray-200 mb-2" />
                                        <p className="text-gray-400 text-sm font-medium">No upcoming lead meetings</p>
                                        <p className="text-gray-300 text-xs mt-1">Schedule a meeting with a lead to see it here</p>
                                    </div>
                                );
                            }

                            return (
                                <>
                                    {leadEvents.map(event => {
                                        const lead = getLeadForEvent(event)!;
                                        const isToday = new Date(event.start).toDateString() === new Date().toDateString();
                                        return (
                                            <div key={event.id} className="p-3 rounded-xl bg-blue-50 border border-blue-100 shadow-sm hover:shadow-md transition-all">
                                                <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-blue-600 uppercase tracking-wide">
                                                    <Clock size={10} />
                                                    {isToday ? 'Today' : new Date(event.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    {' · '}
                                                    {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <h4 className="font-bold text-gray-900 text-sm leading-tight">{event.summary}</h4>
                                                <div className="flex items-center gap-1 mt-1.5 text-xs text-blue-600 font-medium">
                                                    <Users size={10} />
                                                    <span>{lead.first_name} {lead.last_name}</span>
                                                    {lead.company && <span className="text-blue-400">· {lead.company}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            );
                        })()}

                        {/* POTENTIAL TAB */}
                        {upcomingTab === 'potential' && (() => {
                            if (hotLeads.length === 0) {
                                return (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                                        <Zap size={28} className="text-gray-200 mb-2" />
                                        <p className="text-gray-400 text-sm font-medium">No active leads yet</p>
                                        <p className="text-gray-300 text-xs mt-1">Leads with recent messages will appear here</p>
                                    </div>
                                );
                            }

                            return (
                                <>
                                    <p className="text-xs text-gray-400 -mt-1 mb-1">Sorted by engagement — most likely to book</p>
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
                                                    className="px-2.5 py-1 bg-[#522B47] text-white text-[11px] font-medium rounded-lg hover:bg-[#3D1F35] transition-colors cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                                >
                                                    Schedule
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                                <div className="flex items-center gap-1">
                                                    <MessageSquare size={11} />
                                                    <span>{messageCount} msgs</span>
                                                </div>
                                                {recentMessages > 0 && (
                                                    <div className="flex items-center gap-1 text-orange-600 font-medium">
                                                        <TrendingUp size={11} />
                                                        <span>{recentMessages} this week</span>
                                                    </div>
                                                )}
                                                <span className="text-gray-300 ml-auto">{formatRelativeTime(lastActivity)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            );
                        })()}
                    </div>

                    {/* Schedule button — always visible */}
                    <button
                        onClick={() => {
                            setSelectedDate(new Date());
                            setShowDayViewModal(true);
                        }}
                        disabled={!isAuthenticated}
                        className="w-full p-3 mt-4 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm hover:border-gray-400 hover:text-gray-600 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAuthenticated ? '+ Schedule Meeting' : 'Connect Google to schedule'}
                    </button>
                </div>
            </div>
            </div>{/* end flex gap-6 top row */}

            {/* ── Week Timeline ──────────────────────────────────────── */}
            {(() => {
                const weekDays = getWeekDays();
                const todayStr = new Date().toDateString();
                const weekStart = weekDays[0];
                const weekEnd = weekDays[6];
                const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

                return (
                    <div className="glass-card rounded-2xl p-6 animate-fade-in">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-4 mb-5 border-b border-gray-100">
                            <div>
                                <h3 className="font-serif font-bold text-xl text-black">This Week</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{fmt(weekStart)} – {fmt(weekEnd)}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#FBEA74] border border-[#e8d455] inline-block" />
                                    Now
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#522B47]/20 border border-[#522B47]/30 inline-block" />
                                    Click to add
                                </div>
                            </div>
                        </div>

                        {/* 7-column grid */}
                        <div className="grid grid-cols-7 gap-3">
                            {weekDays.map((date, i) => {
                                const isToday = date.toDateString() === todayStr;
                                const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
                                const dateKey = date.toISOString();
                                const isDragOver = dragOverDay === dateKey;
                                const events = getEventsForDate(date);

                                // Build items: sorted events interleaved with "now" marker for today
                                type TimelineItem =
                                    | { type: 'event'; event: CalendarEvent }
                                    | { type: 'now' };

                                let items: TimelineItem[] = [];
                                if (isToday) {
                                    let nowInserted = false;
                                    for (const event of events) {
                                        if (!nowInserted && new Date(event.start) >= nowTime) {
                                            items.push({ type: 'now' });
                                            nowInserted = true;
                                        }
                                        items.push({ type: 'event', event });
                                    }
                                    if (!nowInserted) items.push({ type: 'now' });
                                } else {
                                    items = events.map(e => ({ type: 'event', event: e }));
                                }

                                return (
                                    <div
                                        key={dateKey}
                                        className={`flex flex-col min-h-[200px] rounded-xl transition-all duration-150 ${
                                            i < weekDays.length - 1 ? 'border-r border-gray-100 pr-3' : ''
                                        } ${isDragOver ? 'bg-[#522B47]/5 ring-2 ring-[#522B47]/25 ring-inset' : ''}`}
                                        onDragOver={(e) => handleDragOver(e, dateKey)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, date)}
                                    >
                                        {/* Day header */}
                                        <div className={`rounded-xl px-2 py-2.5 mb-3 text-center transition-all ${
                                            isToday
                                                ? 'bg-[#522B47] shadow-lg ring-1 ring-[#522B47]/20'
                                                : isPast
                                                    ? 'bg-gray-50'
                                                    : 'bg-white/70 border border-gray-100 shadow-sm'
                                        }`}>
                                            <div className={`text-[10px] font-bold tracking-widest uppercase ${
                                                isToday ? 'text-[#FBEA74]' : isPast ? 'text-gray-300' : 'text-gray-400'
                                            }`}>
                                                {DAY_NAMES[i]}
                                            </div>
                                            <div className={`text-lg font-bold leading-tight mt-0.5 ${
                                                isToday ? 'text-white' : isPast ? 'text-gray-300' : 'text-gray-800'
                                            }`}>
                                                {date.getDate()}
                                            </div>
                                        </div>

                                        {/* Events area — click empty space to create */}
                                        <div
                                            className="flex flex-col gap-1.5 flex-1 group/col rounded-lg p-1 cursor-pointer hover:bg-[#522B47]/[0.03] transition-colors"
                                            onClick={() => {
                                                if (!isAuthenticated) return;
                                                setSelectedDate(date);
                                                setTitle('');
                                                setDescription('');
                                                setSelectedLeadId('');
                                                setStartTime('09:00');
                                                setEndTime('10:00');
                                                setShowCreateModal(true);
                                            }}
                                        >
                                            {/* Empty state with add hint */}
                                            {items.length === 0 && (
                                                <div className="flex flex-col items-center justify-center flex-1 gap-1 pt-4 pb-2">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all opacity-0 group-hover/col:opacity-100 ${
                                                        isToday ? 'bg-white/20' : 'bg-[#522B47]/10'
                                                    }`}>
                                                        <span className={`text-sm font-light leading-none ${isToday ? 'text-white/60' : 'text-[#522B47]/50'}`}>+</span>
                                                    </div>
                                                    <p className={`text-[10px] text-center italic ${isPast ? 'text-gray-300' : 'text-gray-300'}`}>
                                                        No events
                                                    </p>
                                                </div>
                                            )}

                                            {items.map((item) => {
                                                if (item.type === 'now') {
                                                    return (
                                                        <div
                                                            key="now-marker"
                                                            className="flex items-center gap-1.5 my-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div className="w-2 h-2 rounded-full bg-[#FBEA74] border border-[#e8d455] shrink-0" />
                                                            <div className="flex-1 h-[2px] bg-[#FBEA74] rounded-full" />
                                                            <span className="text-[9px] font-bold text-[#FBEA74] shrink-0">NOW</span>
                                                        </div>
                                                    );
                                                }

                                                const ev = item.event;
                                                const evStartTime = new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                                const isPastEvent = new Date(ev.end) < nowTime;
                                                const isOwner = ev.organizerSelf === true;

                                                return (
                                                    <div
                                                        key={ev.id}
                                                        draggable={isOwner}
                                                        onDragStart={isOwner ? () => handleDragStart(ev) : undefined}
                                                        onDragEnd={isOwner ? () => { dragEventRef.current = null; } : undefined}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEventClick(ev, e);
                                                        }}
                                                        title={isOwner ? 'Drag to reschedule' : 'You were invited to this event'}
                                                        className={`rounded-lg px-2 py-1.5 transition-all duration-150 select-none ${
                                                            isOwner ? 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'
                                                        } ${
                                                            isToday
                                                                ? isPastEvent
                                                                    ? 'bg-[#522B47]/25 opacity-50'
                                                                    : 'bg-[#522B47] shadow-md hover:bg-[#3D1F35] week-event-card-today'
                                                                : isPast
                                                                    ? 'bg-gray-50 opacity-60'
                                                                    : 'bg-white border border-gray-100 shadow-sm hover:border-gray-200 hover:shadow-md'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-1 mb-0.5">
                                                            <span className={`text-[9px] font-bold ${isToday ? 'text-[#FBEA74]' : 'text-[#522B47]'}`}>
                                                                {evStartTime}
                                                            </span>
                                                            {!isOwner && (
                                                                <span className={`text-[8px] ${isToday ? 'text-white/40' : 'text-gray-300'}`} title="Invited">●</span>
                                                            )}
                                                        </div>
                                                        <div className={`text-[10px] leading-tight truncate font-medium ${
                                                            isToday ? 'text-white/90' : isPast ? 'text-gray-400' : 'text-gray-700'
                                                        }`}>
                                                            {ev.summary}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* "Add event" ghost hint when column has events but user hovers */}
                                            {items.length > 0 && (
                                                <div className="opacity-0 group-hover/col:opacity-100 transition-opacity mt-1 text-center">
                                                    <span className={`text-[9px] ${isToday ? 'text-white/30' : 'text-[#522B47]/30'}`}>+ add</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

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
                                    className={`flex-1 relative bg-white select-none ${newEventDragSel ? 'cursor-ns-resize' : 'cursor-crosshair'}`}
                                    style={{ minHeight: `${hours.length * HOUR_HEIGHT}px` }}
                                    onMouseDown={(e) => {
                                        if ((e.target as Element).closest('[data-event-id]')) return;
                                        e.preventDefault();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const scrollParent = e.currentTarget.closest('.overflow-y-auto');
                                        const scrollTop = scrollParent?.scrollTop || 0;
                                        const y = Math.max(0, e.clientY - rect.top + scrollTop);
                                        newEventDragRef.current = { startY: y, scrollParent: scrollParent || null };
                                        setNewEventDragSel({ top: y, height: 0 });
                                    }}
                                    onMouseMove={(e) => {
                                        if (!newEventDragRef.current) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const scrollTop = newEventDragRef.current.scrollParent?.scrollTop || 0;
                                        const y = Math.max(0, e.clientY - rect.top + scrollTop);
                                        const top = Math.min(newEventDragRef.current.startY, y);
                                        const height = Math.abs(y - newEventDragRef.current.startY);
                                        setNewEventDragSel({ top, height });
                                    }}
                                    onMouseUp={(e) => {
                                        if (!newEventDragRef.current) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const scrollTop = newEventDragRef.current.scrollParent?.scrollTop || 0;
                                        const endY = Math.max(0, e.clientY - rect.top + scrollTop);
                                        const { startY } = newEventDragRef.current;
                                        newEventDragRef.current = null;
                                        setNewEventDragSel(null);

                                        const minY = Math.min(startY, endY);
                                        const maxY = Math.max(startY, endY);
                                        const isDrag = maxY - minY > 15;

                                        setStartTime(snapToQuarterHour(minY));
                                        setEndTime(isDrag ? snapToQuarterHour(maxY) : snapToQuarterHour(minY + HOUR_HEIGHT));
                                        setShowDayViewModal(false);
                                        setShowCreateModal(true);
                                    }}
                                    onMouseLeave={() => {
                                        newEventDragRef.current = null;
                                        setNewEventDragSel(null);
                                    }}
                                >
                                    {/* Grid lines */}
                                    {hours.map(hour => (
                                        <div key={hour} className="h-[60px] border-b border-gray-100 hover:bg-gray-50/40" />
                                    ))}

                                    {/* Drag-to-create selection overlay */}
                                    {newEventDragSel && newEventDragSel.height > 4 && (
                                        <div
                                            className="absolute left-0 right-0 bg-[#522B47]/20 border-2 border-[#522B47]/50 rounded-lg pointer-events-none z-20"
                                            style={{ top: `${newEventDragSel.top}px`, height: `${newEventDragSel.height}px` }}
                                        >
                                            {newEventDragSel.height > 24 && (
                                                <div className="px-2 py-1 text-[10px] font-semibold text-[#522B47]">
                                                    {snapToQuarterHour(newEventDragSel.top)} – {snapToQuarterHour(newEventDragSel.top + newEventDragSel.height)}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* NOW indicator line (today only) */}
                                    {(() => {
                                        const now = new Date();
                                        if (selectedDate?.toDateString() !== now.toDateString()) return null;
                                        const nowHrs = now.getHours();
                                        const nowMins = now.getMinutes();
                                        const nowY = ((nowHrs - DAY_START_HOUR) * HOUR_HEIGHT) + (nowMins / 60 * HOUR_HEIGHT);
                                        if (nowY < 0 || nowY > hours.length * HOUR_HEIGHT) return null;
                                        return (
                                            <div
                                                className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
                                                style={{ top: `${nowY}px` }}
                                            >
                                                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow shrink-0 -ml-1.5" />
                                                <div className="flex-1 h-[2px] bg-red-400" />
                                            </div>
                                        );
                                    })()}

                                    {/* Events positioned absolutely with correct overlap resolution */}
                                    {(() => {
                                        const dayEvents = getSelectedDateEvents();

                                        type LayoutEvent = {
                                            event: CalendarEvent;
                                            top: number;
                                            height: number;
                                            col: number;
                                            totalCols: number;
                                            startMs: number;
                                            endMs: number;
                                        };

                                        const layouts: LayoutEvent[] = [];
                                        // Track where each column visually ends (in pixels, not time)
                                        // This accounts for minHeight clamping that makes short events taller
                                        const colEndPixels: number[] = [];

                                        // Pass 1: greedily assign each event to the first column
                                        // where it doesn't VISUALLY overlap (pixel-based, not time-based)
                                        for (const event of dayEvents) {
                                            const rawTop = calculateYPosition(event.start);
                                            const top = Math.max(0, rawTop);
                                            const height = calculateHeight(event.start, event.end);
                                            const startMs = new Date(event.start).getTime();
                                            const endMs = new Date(event.end).getTime();

                                            let col = 0;
                                            while (col < colEndPixels.length && colEndPixels[col] > top) col++;
                                            colEndPixels[col] = top + height;

                                            layouts.push({ event, top, height, col, totalCols: 1, startMs, endMs });
                                        }

                                        // Pass 2: find each event's VISUAL overlap group and set uniform totalCols
                                        for (const layout of layouts) {
                                            const group = layouts.filter(o =>
                                                o.top < layout.top + layout.height && o.top + o.height > layout.top
                                            );
                                            const maxCol = Math.max(...group.map(o => o.col));
                                            const tc = maxCol + 1;
                                            for (const o of group) {
                                                if (tc > o.totalCols) o.totalCols = tc;
                                            }
                                        }

                                        return layouts.map(({ event, top, height, col, totalCols }) => {
                                            const lead = getLeadForEvent(event);
                                            const isLeadEvent = lead !== null;
                                            // Each column gets an equal share of 100% width, with 3px gap between columns
                                            const GUTTER = 3;
                                            const slotWidthPct = 100 / totalCols;
                                            // left offset in % + any left gutter
                                            const leftPct = col * slotWidthPct;
                                            // width = slot% minus gutters on each side
                                            const leftGutter = col > 0 ? GUTTER : 0;
                                            const rightGutter = col < totalCols - 1 ? GUTTER : 0;

                                            return (
                                                <div
                                                    key={event.id}
                                                    data-event-id={event.id}
                                                    onClick={(e) => handleEventClick(event, e)}
                                                    className={`absolute rounded-lg p-2 cursor-pointer transition-colors overflow-hidden shadow-md ${
                                                        isLeadEvent
                                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                            : 'bg-[#522B47] hover:bg-[#3D1F35] text-white'
                                                    }`}
                                                    style={{
                                                        top: `${top}px`,
                                                        height: `${height}px`,
                                                        minHeight: '36px',
                                                        left: `calc(${leftPct}% + ${leftGutter}px)`,
                                                        width: `calc(${slotWidthPct}% - ${leftGutter + rightGutter}px)`,
                                                    }}
                                                >
                                                    {/* Time range */}
                                                    <div className="text-[10px] font-semibold opacity-75 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                                                        {formatEventTime(event.start, event.end)}
                                                    </div>
                                                    {/* Title */}
                                                    <div className="text-xs font-semibold leading-tight mt-0.5 line-clamp-2">
                                                        {event.summary}
                                                    </div>
                                                    {/* Lead badge */}
                                                    {isLeadEvent && height > 52 && (
                                                        <div className="mt-1 flex items-center gap-1 text-[10px] font-medium bg-white/20 rounded px-1.5 py-0.5 w-fit max-w-full">
                                                            <Users size={9} className="shrink-0" />
                                                            <span className="truncate">{lead!.first_name} {lead!.last_name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}

                                    {/* Empty state */}
                                    {getSelectedDateEvents().length === 0 && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                                            <Calendar size={40} className="mb-3 opacity-30" />
                                            <p className="text-sm font-medium">No events scheduled</p>
                                            <p className="text-xs mt-1 opacity-70">Click any time slot to create one</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Schedule button */}
                        <button
                            onClick={handleScheduleFromDayView}
                            disabled={!isAuthenticated}
                            className="w-full py-3 mt-4 bg-[#522B47] text-white rounded-xl hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2 font-medium"
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
                                                        ? 'bg-[#522B47] text-white'
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
                                        className="flex-1 py-2 bg-[#522B47] text-white rounded-xl hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
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

                            {/* Attendee selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Users size={14} className="inline mr-1" />
                                    Invite (optional)
                                </label>
                                {/* Mode toggle */}
                                <div className="flex gap-0.5 mb-2 bg-gray-100 rounded-lg p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setAttendeeMode('lead')}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                            attendeeMode === 'lead' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        From Leads
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAttendeeMode('custom')}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                            attendeeMode === 'custom' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        Custom Email
                                    </button>
                                </div>
                                {attendeeMode === 'lead' ? (
                                    <>
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
                                    </>
                                ) : (
                                    <input
                                        type="email"
                                        value={customEmail}
                                        onChange={(e) => setCustomEmail(e.target.value)}
                                        placeholder="attendee@example.com"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 focus:border-black/20 outline-none"
                                    />
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
                                                        ? 'bg-[#522B47] text-white'
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
                                    className="flex-1 py-2 bg-[#522B47] text-white rounded-xl hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
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
