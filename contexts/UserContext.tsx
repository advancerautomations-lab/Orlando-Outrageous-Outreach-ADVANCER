import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../types';

interface UserContextType {
  currentUser: UserProfile | null;
  isAdmin: boolean;
  hasPermission: (perm: 'analytics' | 'prospects' | 'delete_leads') => boolean;
  teamMembers: UserProfile[];
  isLoading: boolean;
  refreshTeam: () => Promise<void>;
  completeSetup: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = currentUser?.role === 'admin';

  const hasPermission = useCallback(
    (perm: 'analytics' | 'prospects' | 'delete_leads'): boolean => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      switch (perm) {
        case 'analytics':
          return currentUser.can_view_analytics;
        case 'prospects':
          return currentUser.can_view_prospects;
        case 'delete_leads':
          return currentUser.can_delete_leads;
        default:
          return false;
      }
    },
    [currentUser]
  );

  const fetchCurrentUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCurrentUser(null);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      setCurrentUser(null);
    } else {
      setCurrentUser({
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role || 'sales_rep',
        can_view_analytics: data.can_view_analytics ?? false,
        can_view_prospects: data.can_view_prospects ?? false,
        can_delete_leads: data.can_delete_leads ?? false,
        setup_complete: data.setup_complete ?? true,
        linkedin_url: data.linkedin_url || undefined,
      });
    }
    setIsLoading(false);
  }, []);

  const refreshTeam = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('Error fetching team members:', error);
      return;
    }

    const mapped = (data || []).map((d: any) => ({
      id: d.id,
      email: d.email,
      full_name: d.full_name,
      role: d.role || 'sales_rep',
      can_view_analytics: d.can_view_analytics ?? false,
      can_view_prospects: d.can_view_prospects ?? false,
      can_delete_leads: d.can_delete_leads ?? false,
      setup_complete: d.setup_complete ?? true,
      linkedin_url: d.linkedin_url || undefined,
    }));

    setTeamMembers(mapped);

    // Also refresh currentUser from the fetched data
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = mapped.find((m) => m.id === prev.id);
      return updated || prev;
    });
  }, []);

  const completeSetup = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('users')
      .update({ setup_complete: true })
      .eq('id', user.id);

    await fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    fetchCurrentUser();
    refreshTeam();
  }, [fetchCurrentUser, refreshTeam]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchCurrentUser();
        refreshTeam();
      } else {
        setCurrentUser(null);
        setTeamMembers([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchCurrentUser, refreshTeam]);

  return (
    <UserContext.Provider
      value={{ currentUser, isAdmin, hasPermission, teamMembers, isLoading, refreshTeam, completeSetup }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
