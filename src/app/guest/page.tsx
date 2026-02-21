'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';

type GuestEvent = {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  status: string;
};

const statusMeta: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Ej öppet', classes: 'bg-gray-100 text-gray-700' },
  open: { label: 'Anmälan öppen', classes: 'bg-green-100 text-green-700' },
  matched: { label: 'Matchning klar', classes: 'bg-blue-100 text-blue-700' },
  locked: { label: 'Kuvert låsta', classes: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'Pågår', classes: 'bg-orange-100 text-orange-700' },
  completed: { label: 'Avslutat', classes: 'bg-gray-100 text-gray-600' },
};

export default function GuestPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'checking' | 'unauth' | 'authed'>('checking');
  const [events, setEvents] = useState<GuestEvent[]>([]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch('/api/guest/events');
        if (res.status === 401) {
          setMode('unauth');
          return;
        }
        const data = await res.json();
        setEvents(data.events || []);
        setMode('authed');
      } catch {
        setMode('unauth');
      }
    }
    loadEvents();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/guest-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kunde inte skicka länk');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-white">
      <LandingNav />

      <section className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl shadow-lg p-8 border border-amber-100">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">✉️</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-amber-900">Gästportal</h1>
            <p className="text-amber-700 mt-2">Se dina event och öppna dina kuvert.</p>
          </div>

          {mode === 'checking' && (
            <div className="text-center text-amber-600">Laddar...</div>
          )}

          {mode === 'unauth' && (
            <div>
              {sent ? (
                <div className="text-center">
                  <div className="text-4xl mb-3">📧</div>
                  <h2 className="text-xl font-semibold text-amber-900">Kolla din mail!</h2>
                  <p className="text-amber-700 mt-2">
                    Vi har skickat en magisk länk till <strong>{email}</strong>
                  </p>
                  <p className="text-sm text-amber-600 mt-4">Länken är giltig i 7 dagar.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                  <label className="block text-sm font-medium text-amber-900">
                    Din e-postadress
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="namn@example.com"
                    className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-500 text-white py-3 rounded-xl font-semibold hover:bg-amber-600 disabled:opacity-60"
                  >
                    {loading ? 'Skickar länk...' : 'Skicka inloggningslänk'}
                  </button>
                  <p className="text-center text-sm text-amber-600">
                    Inga lösenord behövs — vi skickar en säker länk.
                  </p>
                </form>
              )}
            </div>
          )}

          {mode === 'authed' && (
            <div>
              <h2 className="text-xl font-semibold text-amber-900 mb-4">Dina event</h2>
              {events.length === 0 ? (
                <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm">
                  Du har inte blivit inbjuden till något event ännu. Fråga din arrangör!
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((event) => {
                    const meta = statusMeta[event.status] || statusMeta.draft;
                    const actionHref = event.status === 'open'
                      ? `/e/${event.slug}/register`
                      : `/e/${event.slug}/live`;
                    const actionLabel = event.status === 'open' ? 'Anmäl dig' : 'Visa kuvert';

                    return (
                      <div key={event.id} className="border border-amber-100 rounded-2xl p-5 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-amber-900">{event.name}</h3>
                            <p className="text-amber-700 text-sm">
                              {new Date(event.event_date).toLocaleDateString('sv-SE')}
                            </p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${meta.classes}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-4">
                          <Link
                            href={actionHref}
                            className="inline-flex items-center text-sm font-semibold text-amber-700 hover:text-amber-900"
                          >
                            {actionLabel} →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
