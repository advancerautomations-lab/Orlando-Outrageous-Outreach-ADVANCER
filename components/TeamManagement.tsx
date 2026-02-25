import React, { useState } from 'react';
import { UserProfile } from '../types';
import { useUser } from '../contexts/UserContext';
import { userService } from '../services/supabaseService';
import { supabase, supabaseUrl } from '../lib/supabaseClient';
import {
  Users, Plus, X, Loader2, Shield, ShieldCheck, Mail, Crown,
  BarChart3, UserSearch, Trash2, Check
} from 'lucide-react';
import toast from 'react-hot-toast';

const PERMISSIONS = [
  { key: 'can_view_analytics' as const, label: 'Analytics', desc: 'View reports & charts', icon: BarChart3 },
  { key: 'can_view_prospects' as const, label: 'Prospects', desc: 'Access cold prospects', icon: UserSearch },
  { key: 'can_delete_leads' as const, label: 'Delete Leads', desc: 'Remove leads permanently', icon: Trash2 },
];

const TeamManagement: React.FC = () => {
  const { currentUser, isAdmin, teamMembers, refreshTeam } = useUser();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', full_name: '', role: 'sales_rep' as 'admin' | 'sales_rep' });
  const [isCreating, setIsCreating] = useState(false);
  // Track which permission toggles are currently loading: "userId:field"
  const [togglingPerms, setTogglingPerms] = useState<Set<string>>(new Set());

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>You don't have access to this page.</p>
      </div>
    );
  }

  const handleTogglePermission = async (
    userId: string,
    field: 'can_view_analytics' | 'can_view_prospects' | 'can_delete_leads',
    currentValue: boolean
  ) => {
    const key = `${userId}:${field}`;
    setTogglingPerms(prev => new Set(prev).add(key));
    try {
      await userService.updateUserPermissions(userId, { [field]: !currentValue });
      await refreshTeam();
      toast.success('Permission updated');
    } catch (err: any) {
      console.error('Permission update failed:', err);
      toast.error(err?.message || 'Failed to update permission');
    }
    setTogglingPerms(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleCreateUser = async () => {
    if (!addForm.email.trim() || !addForm.full_name.trim()) return;
    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(addForm),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create user');

      toast.success(`User created! Password reset email sent to ${addForm.email}`);
      setShowAddForm(false);
      setAddForm({ email: '', full_name: '', role: 'sales_rep' });
      await refreshTeam();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
    setIsCreating(false);
  };

  const otherMembers = teamMembers.filter(m => m.id !== currentUser?.id);

  return (
    <div className="h-full flex flex-col animate-fade-in pb-2">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-serif font-bold text-black leading-tight">Team</h2>
          <p className="text-gray-500 text-sm">{teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} &middot; Manage roles & permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-full hover:bg-[#3D1F35] shadow-lg shadow-black/20 transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={16} />
          <span className="font-medium text-sm">Add Member</span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {/* Current User (You) */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#522B47] text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
              {currentUser?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base truncate">{currentUser?.full_name}</h3>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-semibold rounded-full flex items-center gap-1 flex-shrink-0">
                  <Crown size={10} />
                  Admin
                </span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">(You)</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {PERMISSIONS.map(p => (
                <div key={p.key} className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center" title={p.label}>
                  <p.icon size={13} className="text-emerald-600" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Team Members */}
        {otherMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users size={48} className="opacity-30 mb-4" />
            <p className="font-medium">No team members yet</p>
            <p className="text-sm mt-1">Add your first team member to get started</p>
          </div>
        ) : (
          otherMembers.map(member => (
            <MemberCard
              key={member.id}
              member={member}
              togglingPerms={togglingPerms}
              onToggle={handleTogglePermission}
            />
          ))
        )}
      </div>

      {/* Add Member Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddForm(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 mx-4 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif font-bold text-2xl text-black">Add Team Member</h3>
              <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Full Name *</label>
                <input
                  value={addForm.full_name}
                  onChange={(e) => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="John Smith"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email *</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Role</label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm(f => ({ ...f, role: e.target.value as 'admin' | 'sales_rep' }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20 bg-white"
                >
                  <option value="sales_rep">Sales Rep</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="bg-blue-50 rounded-xl p-3">
                <div className="flex items-center gap-2 text-blue-600 text-xs">
                  <Mail size={14} />
                  <span>A password reset email will be sent so they can set their password.</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={!addForm.email.trim() || !addForm.full_name.trim() || isCreating}
                className="flex-1 py-3 bg-[#522B47] text-white rounded-xl text-sm font-medium hover:bg-[#3D1F35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Member Card ─── */
const MemberCard: React.FC<{
  member: UserProfile;
  togglingPerms: Set<string>;
  onToggle: (userId: string, field: 'can_view_analytics' | 'can_view_prospects' | 'can_delete_leads', current: boolean) => void;
}> = ({ member, togglingPerms, onToggle }) => {
  const initials = member.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
  const isAdmin = member.role === 'admin';

  return (
    <div className="glass-card rounded-2xl p-5">
      {/* Header row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 rounded-full bg-accent-beige flex items-center justify-center font-bold text-sm text-black/70 flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm truncate">{member.full_name}</h4>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full flex items-center gap-1 flex-shrink-0 ${
              isAdmin
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {isAdmin ? <Crown size={10} /> : <Shield size={10} />}
              {isAdmin ? 'Admin' : 'Sales Rep'}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{member.email}</p>
        </div>
      </div>

      {/* Permission Toggles */}
      <div className="grid grid-cols-3 gap-2.5">
        {PERMISSIONS.map(perm => {
          const enabled = member[perm.key];
          const isLoading = togglingPerms.has(`${member.id}:${perm.key}`);
          const Icon = perm.icon;

          return (
            <button
              key={perm.key}
              onClick={() => !isLoading && onToggle(member.id, perm.key, enabled)}
              disabled={isLoading}
              className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-medium border transition-all cursor-pointer disabled:cursor-wait ${
                enabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 hover:border-gray-300'
              }`}
              title={perm.desc}
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : enabled ? (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Icon size={13} className="text-emerald-600" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                  <Icon size={13} className="text-gray-400" />
                </div>
              )}
              <span className="leading-tight">{perm.label}</span>
              {!isLoading && (
                <span className={`text-[9px] font-normal ${enabled ? 'text-emerald-500' : 'text-gray-400'}`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              )}
              {isLoading && (
                <span className="text-[9px] font-normal text-gray-400">Updating...</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TeamManagement;
