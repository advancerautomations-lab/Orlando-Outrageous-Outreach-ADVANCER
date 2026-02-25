import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { COMPANY_INITIAL } from '../lib/branding';
import { toast } from 'react-hot-toast';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';

export const AuthenticationView: React.FC = () => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                        },
                    },
                });

                if (error) throw error;

                // Securely ensure user exists in public table for foreign key constraints
                if (data.user) {
                    const { error: profileError } = await supabase
                        .from('users')
                        .upsert({
                            id: data.user.id,
                            email: email,
                            full_name: fullName,
                            role: 'sales_rep',
                            updated_at: new Date().toISOString()
                        });

                    if (profileError) console.error('Error creating profile:', profileError);
                }

                toast.success('Account created! Please check your email.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;
                toast.success('Welcome back!');
            }
        } catch (error: any) {
            toast.error(error.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center relative overflow-hidden bg-[#FDFBE1] text-gray-900 font-sans">
            {/* Accessing existing background blobs via global styles or recreating them here for consistency */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-beige rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
            <div className="fixed top-[-10%] right-[-10%] w-[35%] h-[35%] bg-accent-pink rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            <div className="fixed bottom-[-10%] left-[20%] w-[45%] h-[45%] bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

            <div className="relative z-10 w-full max-w-md p-8">
                <div className="backdrop-blur-xl bg-white/40 border border-white/50 shadow-2xl rounded-3xl p-8 transition-all duration-300 hover:shadow-white/50 hover:bg-white/50">

                    <div className="text-center mb-8">
                        <div className="w-12 h-12 bg-[#522B47] rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                            <span className="text-white font-serif italic text-xl">{COMPANY_INITIAL}</span>
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                            {isSignUp ? 'Create Account' : 'Welcome Back'}
                        </h2>
                        <p className="mt-2 text-sm text-gray-500">
                            {isSignUp ? 'Join the lead management platform' : 'Enter your credentials to access your workspace'}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-6">
                        {isSignUp && (
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-500 group-focus-within:text-black transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required={isSignUp}
                                    className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 focus:ring-0 transition-all placeholder:text-gray-400 outline-none text-gray-900"
                                />
                            </div>
                        )}

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className="h-5 w-5 text-gray-500 group-focus-within:text-black transition-colors" />
                            </div>
                            <input
                                type="email"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 focus:ring-0 transition-all placeholder:text-gray-400 outline-none text-gray-900"
                            />
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-black transition-colors" />
                            </div>
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 focus:ring-0 transition-all placeholder:text-gray-400 outline-none text-gray-900"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-[#522B47] text-white py-3.5 px-4 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg disabled:opacity-70 disabled:hover:scale-100"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    {isSignUp ? 'Create Account' : 'Sign In'}
                                    <ArrowRight className="h-5 w-5" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <button
                            type="button"
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
                        >
                            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
