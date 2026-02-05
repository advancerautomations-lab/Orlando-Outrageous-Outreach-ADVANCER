import { Lead, Meeting, Activity, Message } from '../types';
import { MOCK_LEADS, MOCK_MEETINGS, MOCK_ACTIVITIES, MOCK_MESSAGES } from '../constants';

// NOTE: In a real application, you would initialize the Supabase client here.
// import { createClient } from '@supabase/supabase-js';
// const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// For this demo, we simulate async calls to a backend.

export const leadService = {
  getLeads: async (): Promise<Lead[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve([...MOCK_LEADS]), 600);
    });
  },

  updateLead: async (lead: Lead): Promise<Lead> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(lead), 400);
    });
  },

  createLead: async (lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead> => {
    return new Promise((resolve) => {
        const newLead = {
            ...lead,
            id: Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString()
        }
      setTimeout(() => resolve(newLead), 400);
    });
  }
};

export const meetingService = {
  getMeetings: async (): Promise<Meeting[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve([...MOCK_MEETINGS]), 500);
    });
  }
};

export const activityService = {
  getActivities: async (): Promise<Activity[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve([...MOCK_ACTIVITIES]), 500);
    });
  },
  
  addActivity: async (activity: Omit<Activity, 'id' | 'created_at'>): Promise<Activity> => {
       return new Promise((resolve) => {
        const newActivity = {
            ...activity,
            id: Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString()
        }
      setTimeout(() => resolve(newActivity), 300);
    });
  }
};

export const messageService = {
  getMessages: async (): Promise<Message[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve([...MOCK_MESSAGES]), 450);
    });
  },

  sendMessage: async (message: Omit<Message, 'id' | 'timestamp' | 'is_read'>): Promise<Message> => {
    return new Promise((resolve) => {
      const newMessage: Message = {
        ...message,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        is_read: true
      };
      setTimeout(() => resolve(newMessage), 300);
    });
  }
};