'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [eventName, setEventName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function accept() {
      try {
        const res = await fetch('/api/organizer/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setEventName(data.event_name || '');
          setStatus('success');
          // Redirect to dashboard after 2s
          setTimeout(() => router.push('/organizer'), 2000);
        } else {
          setErrorMsg(data.error || 'Kunde inte acceptera inbjudan');
          setStatus('error');
        }
      } catch {
        setErrorMsg('Nätverksfel — försök igen');
        setStatus('error');
      }
    }
    accept();
  }, [token, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4 animate-pulse">⏳</div>
          <h1 className="text-xl font-bold text-gray-900">Accepterar inbjudan...</h1>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Något gick fel</h1>
          <p className="text-gray-600 mb-6">{errorMsg}</p>
          <a href="/organizer" className="text-indigo-600 hover:text-indigo-700">
            Gå till dashboard →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Välkommen som medarrangör!</h1>
        {eventName && <p className="text-gray-600 mb-4">Du är nu med i <strong>{eventName}</strong></p>}
        <p className="text-gray-500 text-sm">Skickar dig till dashboarden...</p>
      </div>
    </div>
  );
}
