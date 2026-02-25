import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useGmail } from '../contexts/GmailContext';
import { userService } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import {
  User, Lock, Mail, Calendar, Linkedin, Moon, Sun, Eye, EyeOff,
  Loader2, Check, ExternalLink
} from 'lucide-react';

const SettingsView: React.FC = () => {
  const { currentUser, refreshTeam } = useUser();
  const { isAuthenticated: gmailConnected, login: connectGmail, userEmail, isLoading: gmailLoading } = useGmail();

  // Profile state
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [linkedinUrl, setLinkedinUrl] = useState(currentUser?.linkedin_url || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Dark mode
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  // Sync profile fields when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.full_name || '');
      setLinkedinUrl(currentUser.linkedin_url || '');
    }
  }, [currentUser]);

  const profileChanged = fullName !== (currentUser?.full_name || '') ||
    linkedinUrl !== (currentUser?.linkedin_url || '');

  const passwordValid = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword;
  const canChangePassword = passwordValid && passwordsMatch && !isChangingPassword;

  const handleSaveProfile = async () => {
    if (!currentUser || !profileChanged) return;
    setIsSavingProfile(true);
    try {
      await userService.updateProfile(currentUser.id, {
        full_name: fullName.trim(),
        linkedin_url: linkedinUrl.trim() || undefined,
      });
      await refreshTeam();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    }
    setIsSavingProfile(false);
  };

  const handleChangePassword = async () => {
    if (!canChangePassword) return;
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    }
    setIsChangingPassword(false);
  };

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in pb-2">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-black leading-tight">Settings</h2>
        <p className="text-gray-500 text-sm">Manage your account, preferences, and integrations</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">

        {/* ===== PROFILE ===== */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
              <User size={20} className="text-gray-600" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-black">Profile</h3>
              <p className="text-xs text-gray-500">Your personal information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-2.5 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email</label>
              <input
                value={currentUser?.email || ''}
                disabled
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-[10px] text-gray-400 mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">LinkedIn Profile URL</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Linkedin size={16} className="text-gray-400" />
                </div>
                <input
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/your-profile"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Used for deep research on leads</p>
            </div>

            {profileChanged && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || !fullName.trim()}
                  className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[#3D1F35] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSavingProfile ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : profileSaved ? (
                    <Check size={14} />
                  ) : null}
                  {profileSaved ? 'Saved' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===== SECURITY ===== */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
              <Lock size={20} className="text-gray-600" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-black">Security</h3>
              <p className="text-xs text-gray-500">Update your password</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-4 pr-11 py-2.5 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-4 py-2.5 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-black/10"
              />
            </div>

            {/* Validation hints */}
            {newPassword.length > 0 && (
              <div className="space-y-1.5 px-1">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValid ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                    {passwordValid && <Check size={10} className="text-emerald-600" />}
                  </div>
                  <span className={`text-xs ${passwordValid ? 'text-emerald-600' : 'text-gray-400'}`}>At least 8 characters</span>
                </div>
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordsMatch ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      {passwordsMatch && <Check size={10} className="text-emerald-600" />}
                    </div>
                    <span className={`text-xs ${passwordsMatch ? 'text-emerald-600' : 'text-gray-400'}`}>Passwords match</span>
                  </div>
                )}
              </div>
            )}

            {newPassword.length > 0 && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleChangePassword}
                  disabled={!canChangePassword}
                  className="flex items-center gap-2 bg-[#522B47] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[#3D1F35] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isChangingPassword ? <Loader2 size={14} className="animate-spin" /> : null}
                  Change Password
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===== CONNECTED ACCOUNTS ===== */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
              <Mail size={20} className="text-gray-600" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-black">Connected Accounts</h3>
              <p className="text-xs text-gray-500">Manage your integrations</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-white/30 border border-gray-100 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-700">Gmail & Calendar</p>
                  {gmailConnected ? (
                    <p className="text-xs text-emerald-600">{userEmail}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Not connected</p>
                  )}
                </div>
              </div>
            </div>

            {gmailConnected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <Mail size={12} /> <Calendar size={12} />
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-full">Connected</span>
              </div>
            ) : (
              <button
                onClick={connectGmail}
                disabled={gmailLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[#522B47] text-white rounded-full text-xs font-medium hover:bg-[#3D1F35] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {gmailLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                Connect
              </button>
            )}
          </div>
        </div>

        {/* ===== APPEARANCE ===== */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
              {isDark ? <Moon size={20} className="text-gray-600" /> : <Sun size={20} className="text-gray-600" />}
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-black">Appearance</h3>
              <p className="text-xs text-gray-500">Customize how the app looks</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-white/30 border border-gray-100 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-700">Dark Mode</p>
              <p className="text-xs text-gray-400">Switch between light and dark themes</p>
            </div>
            <button
              onClick={toggleDarkMode}
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 cursor-pointer ${
                isDark ? 'bg-[#522B47]' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={isDark}
              aria-label="Toggle dark mode"
            >
              <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center transition-transform duration-300 ${
                isDark ? 'translate-x-7.5 left-0' : 'left-0.5'
              }`}
              style={{ transform: isDark ? 'translateX(1.75rem)' : 'translateX(0)' }}
              >
                {isDark ? <Moon size={12} className="text-gray-700" /> : <Sun size={12} className="text-yellow-500" />}
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsView;
