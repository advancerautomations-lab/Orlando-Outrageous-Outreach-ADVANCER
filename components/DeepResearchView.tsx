import React, { useState } from 'react';
import { FileSearch, Loader2, Linkedin, Mail } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import toast from 'react-hot-toast';

const DeepResearchView: React.FC = () => {
  const { currentUser } = useUser();
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [isResearching, setIsResearching] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!linkedinUrl.trim()) {
      toast.error('Please enter the prospect\'s LinkedIn URL.');
      return;
    }
    if (!linkedinUrl.includes('linkedin.com')) {
      toast.error('Please enter a valid LinkedIn URL.');
      return;
    }
    if (!email.trim()) {
      toast.error('Please enter an email to send the report to.');
      return;
    }
    if (!currentUser?.linkedin_url) {
      toast.error('Your LinkedIn URL is not set. Add it in your profile settings.');
      return;
    }

    const webhookUrl = import.meta.env.VITE_DEEP_RESEARCH_WEBHOOK_URL;
    if (!webhookUrl) {
      toast.error('Deep research webhook URL is not configured.');
      return;
    }

    setIsResearching(true);
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_linkedin_url: linkedinUrl.trim(),
          user_linkedin_url: currentUser.linkedin_url,
          user_email: email.trim(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Deep research started! The report will be sent to your email.');
      setLinkedinUrl('');
    } catch (err: any) {
      toast.error('Failed to trigger deep research. Try again later.');
    }
    setIsResearching(false);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-primary tracking-tight">Deep Research</h1>
        <p className="text-gray-500 mt-2">
          Generate an AI-powered research report on any prospect. Enter their LinkedIn profile and we'll send the report to your email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-8 space-y-6">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Linkedin size={16} className="text-[#522B47]" />
            Prospect LinkedIn URL
          </label>
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/prospect-name"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#522B47]/30 focus:border-[#522B47] transition-all text-sm"
            disabled={isResearching}
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Mail size={16} className="text-[#522B47]" />
            Send report to
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#522B47]/30 focus:border-[#522B47] transition-all text-sm"
            disabled={isResearching}
          />
        </div>

        <button
          type="submit"
          disabled={isResearching}
          className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3.5 px-6 rounded-xl hover:bg-[#3D1F35] active:scale-[0.98] transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer text-sm font-medium"
        >
          {isResearching ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <FileSearch size={18} />
          )}
          {isResearching ? 'Researching...' : 'Confirm Research Report'}
        </button>

        {!currentUser?.linkedin_url && (
          <p className="text-xs text-amber-600 text-center">
            You need to add your LinkedIn URL in Settings before using Deep Research.
          </p>
        )}
      </form>
    </div>
  );
};

export default DeepResearchView;
