import React, { createContext, useContext, useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';

type WatchStatus = 'active' | 'expired' | 'none';

interface Attachment {
    filename: string;
    mimeType: string;
    content: string; // base64
}

export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
    attendees?: { email: string; responseStatus: string }[];
    htmlLink?: string;
    organizerSelf?: boolean;
}

interface GmailContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    login: () => void;
    sendEmail: (to: string, subject: string, body: string, leadId?: string, files?: File[], threadId?: string) => Promise<boolean>;
    checkAuthStatus: () => Promise<void>;
    userEmail: string | null;
    watchStatus: WatchStatus;
    setupWatch: () => Promise<boolean>;
    stopWatch: () => Promise<boolean>;
    disconnectGmail: () => Promise<void>;
    getCalendarEvents: (startDate: Date, endDate: Date) => Promise<CalendarEvent[]>;
    createCalendarEvent: (title: string, description: string, startTime: Date, endTime: Date, leadId?: string, attendeeEmail?: string) => Promise<boolean>;
    updateCalendarEvent: (eventId: string, title: string, description: string, startTime: Date, endTime: Date, attendeeEmail?: string) => Promise<boolean>;
    deleteCalendarEvent: (eventId: string) => Promise<boolean>;
}

const GmailContext = createContext<GmailContextType | undefined>(undefined);

export function GmailProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [watchStatus, setWatchStatus] = useState<WatchStatus>('none');

    // Check if user has valid token stored and watch status
    const checkAuthStatus = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('gmail_tokens')
                .select('gmail_email, watch_expiration')
                .eq('user_id', user.id)
                .single();

            if (data && !error) {
                setIsAuthenticated(true);
                setUserEmail(data.gmail_email);

                // Check watch status
                if (data.watch_expiration) {
                    const expiry = new Date(data.watch_expiration);
                    const hoursUntilExpiry = (expiry.getTime() - Date.now()) / (1000 * 60 * 60);

                    if (hoursUntilExpiry > 24) {
                        setWatchStatus('active');
                    } else if (hoursUntilExpiry > 0) {
                        // Expiring within 24 hours - auto-renew
                        setWatchStatus('expired');
                        console.log('Watch expiring soon, will auto-renew');
                    } else {
                        setWatchStatus('expired');
                    }
                } else {
                    setWatchStatus('none');
                }
            } else {
                setIsAuthenticated(false);
                setUserEmail(null);
                setWatchStatus('none');
            }
        } catch (error) {
            console.error('Error checking Gmail auth status:', error);
        }
    };

    // Setup Gmail watch for real-time notifications
    const setupWatch = async (): Promise<boolean> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error('Session expired. Please log in again.');
                return false;
            }

            const { data, error } = await supabase.functions.invoke('gmail-watch', {
                body: { userId: session.user.id, action: 'start' }
            });

            if (error) throw error;

            setWatchStatus('active');
            toast.success('Email notifications enabled!');
            console.log('Watch setup successful:', data);
            return true;
        } catch (error) {
            console.error('Watch setup error:', error);
            toast.error('Failed to enable email notifications');
            return false;
        }
    };

    // Stop Gmail watch
    const stopWatch = async (): Promise<boolean> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return false;

            const { error } = await supabase.functions.invoke('gmail-watch', {
                body: { userId: session.user.id, action: 'stop' }
            });

            if (error) throw error;

            setWatchStatus('none');
            toast.success('Email notifications disabled');
            return true;
        } catch (error) {
            console.error('Stop watch error:', error);
            return false;
        }
    };

    // Disconnect Gmail - removes tokens so user can re-authenticate
    const disconnectGmail = async (): Promise<void> => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Stop watch first if active
            if (watchStatus !== 'none') {
                await stopWatch();
            }

            // Delete tokens from database
            const { error } = await supabase
                .from('gmail_tokens')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;

            // Reset state
            setIsAuthenticated(false);
            setUserEmail(null);
            setWatchStatus('none');
            toast.success('Gmail disconnected');
        } catch (error) {
            console.error('Disconnect Gmail error:', error);
            toast.error('Failed to disconnect Gmail');
        }
    };

    useEffect(() => {
        checkAuthStatus();
    }, []);

    // Auto-renew watch if expired or expiring soon
    useEffect(() => {
        if (isAuthenticated && watchStatus === 'expired') {
            console.log('Auto-renewing expired watch...');
            setupWatch();
        }
    }, [isAuthenticated, watchStatus]);

    const login = useGoogleLogin({
        flow: 'auth-code',
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar',
        onSuccess: async (codeResponse) => {
            setIsLoading(true);
            try {
                // Refresh session to ensure valid JWT for edge function
                const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !session) {
                    throw new Error('Session expired. Please log in again.');
                }

                // Exchange code for tokens via Edge Function
                const { data, error } = await supabase.functions.invoke('gmail-auth', {
                    body: {
                        code: codeResponse.code,
                        userId: session.user.id,
                        redirectUrl: 'postmessage'
                    }
                });

                if (error) throw error;

                toast.success('Gmail connected successfully!');
                setIsAuthenticated(true);
                setUserEmail(data.email);

                // Auto-setup watch for real-time notifications
                setTimeout(async () => {
                    console.log('Setting up Gmail watch for real-time notifications...');
                    const watchSuccess = await setupWatch();
                    if (!watchSuccess) {
                        console.warn('Failed to setup watch, notifications may not work');
                    }
                }, 1000);
            } catch (error) {
                console.error('Gmail auth error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                toast.error(`Connection failed: ${errorMessage}`);
            } finally {
                setIsLoading(false);
            }
        },
        onError: () => {
            toast.error('Google login failed');
        }
    });

    // Helper to convert File to base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const sendEmail = async (to: string, subject: string, body: string, leadId?: string, files?: File[], threadId?: string): Promise<boolean> => {
        try {
            // Get current session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                toast.error('Session expired. Please log in again.');
                return false;
            }

            // Convert files to base64 attachments
            let attachments: Attachment[] = [];
            if (files && files.length > 0) {
                attachments = await Promise.all(
                    files.map(async (file) => ({
                        filename: file.name,
                        mimeType: file.type || 'application/octet-stream',
                        content: await fileToBase64(file)
                    }))
                );
            }

            const { error } = await supabase.functions.invoke('gmail-send', {
                body: {
                    userId: session.user.id,
                    leadId: leadId || undefined,
                    to,
                    subject,
                    body,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    threadId: threadId || undefined
                },
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
            });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Send email error:', error);
            toast.error('Failed to send email');
            return false;
        }
    };

    const getCalendarEvents = async (startDate: Date, endDate: Date): Promise<CalendarEvent[]> => {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                console.error('Session error for calendar events');
                return [];
            }

            const { data, error } = await supabase.functions.invoke('calendar-events', {
                body: {
                    userId: session.user.id,
                    timeMin: startDate.toISOString(),
                    timeMax: endDate.toISOString()
                }
            });

            if (error) throw error;
            return data?.events || [];
        } catch (error) {
            console.error('Get calendar events error:', error);
            return [];
        }
    };

    const createCalendarEvent = async (
        title: string,
        description: string,
        startTime: Date,
        endTime: Date,
        leadId?: string,
        attendeeEmail?: string
    ): Promise<boolean> => {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                toast.error('Session expired. Please log in again.');
                return false;
            }

            const { data, error } = await supabase.functions.invoke('calendar-create', {
                body: {
                    userId: session.user.id,
                    leadId: leadId || null,
                    title,
                    description,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    attendeeEmail: attendeeEmail || null
                }
            });

            if (error) throw error;

            toast.success('Meeting scheduled!');
            return true;
        } catch (error) {
            console.error('Create calendar event error:', error);
            toast.error('Failed to create meeting');
            return false;
        }
    };

    const updateCalendarEvent = async (
        eventId: string,
        title: string,
        description: string,
        startTime: Date,
        endTime: Date,
        attendeeEmail?: string
    ): Promise<boolean> => {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                toast.error('Session expired. Please log in again.');
                return false;
            }

            const { error } = await supabase.functions.invoke('calendar-update', {
                body: {
                    userId: session.user.id,
                    eventId,
                    title,
                    description,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    attendeeEmail: attendeeEmail || null
                }
            });

            if (error) throw error;

            toast.success('Meeting updated!');
            return true;
        } catch (error) {
            console.error('Update calendar event error:', error);
            toast.error('Failed to update meeting');
            return false;
        }
    };

    const deleteCalendarEvent = async (eventId: string): Promise<boolean> => {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                toast.error('Session expired. Please log in again.');
                return false;
            }

            const { error } = await supabase.functions.invoke('calendar-delete', {
                body: {
                    userId: session.user.id,
                    eventId
                }
            });

            if (error) throw error;

            toast.success('Meeting cancelled');
            return true;
        } catch (error) {
            console.error('Delete calendar event error:', error);
            toast.error('Failed to cancel meeting');
            return false;
        }
    };

    return (
        <GmailContext.Provider value={{
            isAuthenticated,
            isLoading,
            login,
            sendEmail,
            checkAuthStatus,
            userEmail,
            watchStatus,
            setupWatch,
            stopWatch,
            disconnectGmail,
            getCalendarEvents,
            createCalendarEvent,
            updateCalendarEvent,
            deleteCalendarEvent
        }}>
            {children}
        </GmailContext.Provider>
    );
}

export function useGmail() {
    const context = useContext(GmailContext);
    if (context === undefined) {
        throw new Error('useGmail must be used within a GmailProvider');
    }
    return context;
}
