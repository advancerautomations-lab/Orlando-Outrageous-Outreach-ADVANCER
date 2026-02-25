import React, { useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { COMPANY_NAME, COMPANY_INITIAL } from '../lib/branding';
import { LayoutDashboard, Users, Calendar as CalendarIcon, Settings, BarChart3, LogOut, Mail, UsersRound } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const { isAdmin, hasPermission } = useUser();

  const menuItems = useMemo(() => {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'leads', label: 'Leads Pipeline', icon: Users },
      { id: 'contact', label: 'Communication', icon: Mail },
      { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    ];

    if (hasPermission('analytics')) {
      items.push({ id: 'analytics', label: 'Analytics', icon: BarChart3 });
    }

    if (isAdmin) {
      items.push({ id: 'team', label: 'Team', icon: UsersRound });
    }

    items.push({ id: 'settings', label: 'Settings', icon: Settings });

    return items;
  }, [isAdmin, hasPermission]);

  return (
    <aside className="fixed left-0 top-0 h-full w-64 glass-panel z-50 flex flex-col transition-all duration-300" role="navigation" aria-label="Main navigation">
      <div className="p-8 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#522B47] flex items-center justify-center" aria-hidden="true">
          <span className="text-white font-serif font-bold text-lg">{COMPANY_INITIAL}</span>
        </div>
        <h1 className="font-serif text-2xl font-bold text-primary tracking-tight">{COMPANY_NAME}</h1>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer
                ${isActive
                  ? 'bg-[#522B47] text-white shadow-lg shadow-black/20 translate-x-2'
                  : 'text-gray-600 hover:bg-accent-beige/30 hover:text-black'
                }`}
            >
              <Icon size={20} className={isActive ? 'text-accent-beige' : 'text-gray-400 group-hover:text-black'} aria-hidden="true" />
              <span className="font-medium text-sm tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200/50">
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
          aria-label="Sign out"
        >
          <LogOut size={20} aria-hidden="true" />
          <span className="font-medium text-sm">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;