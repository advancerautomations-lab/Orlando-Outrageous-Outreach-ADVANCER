import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useGmail } from '../contexts/GmailContext';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { Lock, Mail, Check, ArrowRight, Loader2, Eye, EyeOff, Calendar, Linkedin } from 'lucide-react';

type WizardStep = 'welcome' | 'password' | 'gmail' | 'linkedin' | 'done';

const STEPS: WizardStep[] = ['welcome', 'password', 'gmail', 'linkedin', 'done'];

interface SetupWizardProps {
  isRecoverySession: boolean;
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ isRecoverySession, onComplete }) => {
  const { currentUser, completeSetup } = useUser();
  const { isAuthenticated: gmailConnected, login: connectGmail, userEmail, isLoading: gmailLoading } = useGmail();

  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [gmailSkipped, setGmailSkipped] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [linkedinSaved, setLinkedinSaved] = useState(false);
  const [isSavingLinkedin, setIsSavingLinkedin] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const stepIndex = STEPS.indexOf(currentStep);

  const passwordValid = password.length >= 8;
  const passwordsMatch = password === confirmPassword;
  const canSetPassword = passwordValid && passwordsMatch && !isUpdatingPassword;

  const handleSetPassword = async () => {
    if (!canSetPassword) return;
    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPasswordSet(true);
      toast.success('Password set successfully!');
      setCurrentStep('gmail');
    } catch (err: any) {
      toast.error(err.message || 'Failed to set password');
    }
    setIsUpdatingPassword(false);
  };

  const handleSkipGmail = () => {
    setGmailSkipped(true);
    setCurrentStep('linkedin');
  };

  const handleConnectGmail = () => {
    connectGmail();
  };

  const handleSaveLinkedin = async () => {
    if (!linkedinUrl.trim()) return;
    setIsSavingLinkedin(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('users')
        .update({ linkedin_url: linkedinUrl.trim() })
        .eq('id', user.id);
      if (error) throw error;
      setLinkedinSaved(true);
      toast.success('LinkedIn profile saved!');
      setCurrentStep('done');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save LinkedIn URL');
    }
    setIsSavingLinkedin(false);
  };

  // Watch for gmail connection to auto-advance
  React.useEffect(() => {
    if (currentStep === 'gmail' && gmailConnected && !gmailSkipped) {
      setCurrentStep('linkedin');
    }
  }, [gmailConnected, currentStep, gmailSkipped]);

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      await completeSetup();
      onComplete();
    } catch (err: any) {
      toast.error('Something went wrong. Please try again.');
    }
    setIsFinishing(false);
  };

  const firstName = currentUser?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="flex min-h-screen items-center justify-center relative overflow-hidden bg-[#FDFBE1] text-gray-900 font-sans">
      {/* Background blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-beige rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob" />
      <div className="fixed top-[-10%] right-[-10%] w-[35%] h-[35%] bg-accent-pink rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
      <div className="fixed bottom-[-10%] left-[20%] w-[45%] h-[45%] bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />

      <div className="relative z-10 w-full max-w-md p-8">
        <div className="backdrop-blur-xl bg-white/40 border border-white/50 shadow-2xl rounded-3xl p-8 transition-all duration-300">

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={`h-2 rounded-full transition-all duration-500 ${
                  i <= stepIndex ? 'bg-[#522B47] w-8' : 'bg-gray-200 w-2'
                }`}
              />
            ))}
          </div>

          {/* Step: Welcome */}
          {currentStep === 'welcome' && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-[#522B47] rounded-full mx-auto mb-5 flex items-center justify-center shadow-lg">
                  <span className="text-white font-serif italic text-2xl">S</span>
                </div>
                <h2 className="text-3xl font-serif font-bold tracking-tight text-gray-900 mb-3">
                  Welcome, {firstName}!
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                  Let's get your account set up. This will only take a minute.
                </p>
              </div>

              <div className="space-y-3 mb-8">
                <StepPreview icon={<Lock size={16} />} label="Set your password" />
                <StepPreview icon={<Mail size={16} />} label="Connect Gmail & Calendar" />
                <StepPreview icon={<Linkedin size={16} />} label="Add your LinkedIn profile" />
              </div>

              <button
                onClick={() => setCurrentStep('password')}
                className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3.5 px-4 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg cursor-pointer"
              >
                Get Started
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Step: Set Password */}
          {currentStep === 'password' && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Lock size={22} className="text-gray-700" />
                </div>
                <h2 className="text-2xl font-serif font-bold tracking-tight text-gray-900 mb-2">
                  Set Your Password
                </h2>
                <p className="text-sm text-gray-500">
                  Choose a secure password for your account.
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-11 pr-12 py-3 bg-white/50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 focus:ring-0 transition-all placeholder:text-gray-400 outline-none text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 focus:ring-0 transition-all placeholder:text-gray-400 outline-none text-gray-900"
                  />
                </div>

                {/* Validation hints */}
                <div className="space-y-1.5 px-1">
                  <ValidationHint passed={password.length >= 8} label="At least 8 characters" />
                  {confirmPassword.length > 0 && (
                    <ValidationHint passed={passwordsMatch} label="Passwords match" />
                  )}
                </div>
              </div>

              <button
                onClick={handleSetPassword}
                disabled={!canSetPassword}
                className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3.5 px-4 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
              >
                {isUpdatingPassword ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Set Password
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step: Connect Gmail */}
          {currentStep === 'gmail' && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Mail size={22} className="text-gray-700" />
                </div>
                <h2 className="text-2xl font-serif font-bold tracking-tight text-gray-900 mb-2">
                  Connect Gmail & Calendar
                </h2>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Send and receive emails directly from the CRM. We'll also sync your calendar for scheduling.
                </p>
              </div>

              {gmailConnected ? (
                <div className="mb-6">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check size={16} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">Gmail Connected</p>
                      <p className="text-xs text-emerald-600">{userEmail}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mb-6">
                  <button
                    onClick={handleConnectGmail}
                    disabled={gmailLoading}
                    className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-gray-300 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {gmailLoading ? (
                      <Loader2 size={18} className="animate-spin text-gray-500" />
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Connect with Google</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-3 px-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                      <Mail size={12} /> Gmail
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                      <Calendar size={12} /> Calendar
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={gmailConnected ? () => setCurrentStep('linkedin') : handleSkipGmail}
                className={`w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl transition-all duration-200 cursor-pointer ${
                  gmailConnected
                    ? 'bg-[#522B47] text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg'
                    : 'bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {gmailConnected ? (
                  <>
                    Continue
                    <ArrowRight size={18} />
                  </>
                ) : (
                  'Skip for now'
                )}
              </button>
            </div>
          )}

          {/* Step: LinkedIn */}
          {currentStep === 'linkedin' && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Linkedin size={22} className="text-gray-700" />
                </div>
                <h2 className="text-2xl font-serif font-bold tracking-tight text-gray-900 mb-2">
                  Your LinkedIn Profile
                </h2>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Used for deep research on your leads. We'll compare your profile with theirs to find common ground.
                </p>
              </div>

              <div className="mb-6">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Linkedin className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                  </div>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/your-profile"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 focus:ring-0 transition-all placeholder:text-gray-400 outline-none text-gray-900"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleSaveLinkedin}
                  disabled={!linkedinUrl.trim() || isSavingLinkedin}
                  className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3.5 px-4 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSavingLinkedin ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      Save & Continue
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setCurrentStep('done')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {currentStep === 'done' && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-emerald-100 rounded-full mx-auto mb-5 flex items-center justify-center">
                  <Check size={28} className="text-emerald-600" />
                </div>
                <h2 className="text-3xl font-serif font-bold tracking-tight text-gray-900 mb-3">
                  You're All Set!
                </h2>
                <p className="text-sm text-gray-500">
                  Your account is ready. Let's get to work.
                </p>
              </div>

              {/* Summary */}
              <div className="space-y-3 mb-8">
                <SummaryItem
                  label="Password"
                  done={passwordSet}
                  doneText="Secured"
                  pendingText="Using temporary"
                />
                <SummaryItem
                  label="Gmail & Calendar"
                  done={gmailConnected}
                  doneText={`Connected as ${userEmail}`}
                  pendingText="Skipped — connect later in settings"
                />
                <SummaryItem
                  label="LinkedIn"
                  done={linkedinSaved}
                  doneText="Profile saved"
                  pendingText="Skipped — add later in settings"
                />
              </div>

              <button
                onClick={handleFinish}
                disabled={isFinishing}
                className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3.5 px-4 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg disabled:opacity-70 cursor-pointer"
              >
                {isFinishing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Enter Workspace
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- Small helper components ---------- */

const StepPreview: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-white/30 rounded-xl border border-white/40">
    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
      {icon}
    </div>
    <span className="text-sm text-gray-600">{label}</span>
  </div>
);

const ValidationHint: React.FC<{ passed: boolean; label: string }> = ({ passed, label }) => (
  <div className="flex items-center gap-2">
    <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
      passed ? 'bg-emerald-100' : 'bg-gray-100'
    }`}>
      {passed && <Check size={10} className="text-emerald-600" />}
    </div>
    <span className={`text-xs transition-colors ${passed ? 'text-emerald-600' : 'text-gray-400'}`}>
      {label}
    </span>
  </div>
);

const SummaryItem: React.FC<{
  label: string;
  done: boolean;
  doneText: string;
  pendingText: string;
}> = ({ label, done, doneText, pendingText }) => (
  <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
    done ? 'bg-emerald-50/50 border-emerald-200' : 'bg-gray-50/50 border-gray-200'
  }`}>
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
        done ? 'bg-emerald-100' : 'bg-gray-200'
      }`}>
        {done ? <Check size={12} className="text-emerald-600" /> : <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />}
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
    <span className={`text-xs ${done ? 'text-emerald-600' : 'text-gray-400'}`}>
      {done ? doneText : pendingText}
    </span>
  </div>
);

export default SetupWizard;
