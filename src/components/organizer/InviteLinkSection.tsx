'use client';

import { useState, useEffect } from 'react';

export function InviteLinkSection({ eventId }: { eventId: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/invite-link`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = inviteUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
        <div className="h-10 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!inviteUrl) return null;

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl px-4 py-3 shadow-sm mb-4 border border-green-100 flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-gray-900 truncate">🔗 Inbjudningslänk</span>
      <button
        onClick={handleCopy}
        className={`px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap shrink-0 ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {copied ? '✅ Kopierad!' : 'Kopiera'}
      </button>
    </div>
  );
}
