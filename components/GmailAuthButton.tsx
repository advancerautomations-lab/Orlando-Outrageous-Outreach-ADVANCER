import React, { useState } from 'react';
import { useGmail } from '../contexts/GmailContext';
import { Mail, Check, Loader2, X } from 'lucide-react';

export const GmailAuthButton = () => {
    const { isAuthenticated, isLoading, login, userEmail, disconnectGmail } = useGmail();
    const [showDisconnect, setShowDisconnect] = useState(false);

    if (isLoading) {
        return (
            <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl cursor-not-allowed">
                <Loader2 size={18} className="animate-spin" />
                <span>Connecting...</span>
            </button>
        );
    }

    if (isAuthenticated) {
        return (
            <div
                className="relative"
                onMouseEnter={() => setShowDisconnect(true)}
                onMouseLeave={() => setShowDisconnect(false)}
            >
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-xl cursor-pointer">
                    <Check size={18} />
                    <span className="text-sm font-medium">Connected as {userEmail}</span>
                </div>
                {showDisconnect && (
                    <button
                        onClick={disconnectGmail}
                        className="absolute top-full left-0 right-0 mt-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl transition-colors text-sm font-medium"
                    >
                        <X size={16} />
                        Disconnect Gmail
                    </button>
                )}
            </div>
        );
    }

    return (
        <button
            onClick={() => login()}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border hover:shadow-md transition-all rounded-xl text-gray-700 dark:text-gray-200"
        >
            <Mail size={18} className="text-red-500" />
            <span className="text-sm font-medium">Connect Gmail</span>
        </button>
    );
};
