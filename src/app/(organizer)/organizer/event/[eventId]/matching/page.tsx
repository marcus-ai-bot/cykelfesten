'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  person_count: number;
  address: string;
  invited_allergies: string[] | null;
  partner_allergies: string[] | null;
}

interface Pairing {
  course: string;
  host_couple_id: string;
  guest_couple_id: string;
}

export default function MatchingPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<any>(null);
  const [couples, setCouples] = useState<Couple[]>([]);
  const [matchPlan, setMatchPlan] = useState<any>(null);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<'overview' | 'starter' | 'main' | 'dessert'>('overview');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/matching`);
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        setCouples(data.couples || []);
        setMatchPlan(data.matchPlan);
        setPairings(data.pairings || []);
      } else {
        setError(data.error || 'Kunde inte ladda data');
      }
    } catch {
      setError('Nätverksfel');
    } finally {
      setLoading(false);
    }
  }

  async function runMatching() {
    if (!confirm('Köra ny matchning? Skapar ny version av matchplanen.')) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Matchning klar! Version ${data.version}, ${data.stats.couples_matched} par matchade.`);
        await loadData();
      } else {
        setError('Matchning misslyckades: ' + data.error);
      }
    } catch {
      setError('Nätverksfel');
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Laddar...</p></div>;

  const coupleMap = new Map(couples.map(c => [c.id, c]));

  const courseData = ['starter', 'main', 'dessert'].map(course => {
    const coursePairings = pairings.filter(p => p.course === course);
    const hosts = [...new Set(coursePairings.map(p => p.host_couple_id))];
    return {
      course,
      label: course === 'starter' ? '🥗 Förrätt' : course === 'main' ? '🍖 Huvudrätt' : '🍰 Efterrätt',
      hosts: hosts.map(hostId => ({
        host: coupleMap.get(hostId),
        guests: coursePairings
          .filter(p => p.host_couple_id === hostId)
          .map(p => coupleMap.get(p.guest_couple_id))
          .filter(Boolean) as Couple[],
      })),
    };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-500 hover:text-gray-700">
            ← {event?.name || 'Tillbaka'}
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔀 Matchning</h1>
            <p className="text-gray-500 mt-1">{couples.length} par anmälda</p>
          </div>
          <button
            onClick={runMatching}
            disabled={running || couples.length < 3}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? '⏳ Kör matchning...' : '▶️ Kör matchning'}
          </button>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4">{success}</div>}

        {couples.length < 3 && (
          <div className="bg-amber-50 text-amber-700 p-4 rounded-lg mb-6">
            ⚠️ Det behövs minst 3 par för att köra matchning. Just nu: {couples.length} par.
          </div>
        )}

        {/* Match Plan Stats */}
        {matchPlan?.stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-3xl font-bold text-indigo-600">{matchPlan.stats.couples_matched}</div>
              <div className="text-gray-500 text-sm">Par matchade</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-3xl font-bold text-green-600">
                {Math.round(matchPlan.stats.preference_satisfaction * 100)}%
              </div>
              <div className="text-gray-500 text-sm">Preferenser uppfyllda</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-3xl font-bold text-purple-600">v{matchPlan.version}</div>
              <div className="text-gray-500 text-sm">Matchplan</div>
            </div>
          </div>
        )}

        {/* View tabs */}
        {pairings.length > 0 && (
          <>
            <div className="flex gap-2 mb-6">
              {(['overview', 'starter', 'main', 'dessert'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    view === v ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {v === 'overview' ? '📊 Översikt' : v === 'starter' ? '🥗 Förrätt' : v === 'main' ? '🍖 Huvudrätt' : '🍰 Efterrätt'}
                </button>
              ))}
            </div>

            {/* Overview */}
            {view === 'overview' && (
              <div className="space-y-6">
                {courseData.map(({ course, label, hosts }) => (
                  <div key={course} className="bg-white rounded-xl p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">{label}</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {hosts.map(({ host, guests }) => host && (
                        <div key={host.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="font-medium text-gray-900 mb-2">
                            🏠 {host.invited_name}{host.partner_name && ` & ${host.partner_name}`}
                          </div>
                          <div className="text-sm text-gray-500 mb-3">{host.address}</div>
                          <div className="space-y-1">
                            {guests.map(guest => (
                              <div key={guest.id} className="text-sm text-gray-700 flex items-center gap-2">
                                <span className="w-2 h-2 bg-indigo-400 rounded-full" />
                                {guest.invited_name}{guest.partner_name && ` & ${guest.partner_name}`}
                                <span className="text-gray-400">({guest.person_count}p)</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t text-xs text-gray-400">
                            {guests.reduce((sum, g) => sum + g.person_count, 0)} gäster
                          </div>
                        </div>
                      ))}
                      {hosts.length === 0 && <p className="text-gray-400 text-sm">Inga matchningar ännu</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Course detail view */}
            {view !== 'overview' && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Värd</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Adress</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Gäster</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Allergier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {courseData.find(c => c.course === view)?.hosts.map(({ host, guests }) => host && (
                      <tr key={host.id}>
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">
                            {host.invited_name}{host.partner_name && ` & ${host.partner_name}`}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-600">{host.address}</td>
                        <td className="px-4 py-4">
                          {guests.map(g => (
                            <div key={g.id} className="text-sm">{g.invited_name}{g.partner_name && ` & ${g.partner_name}`}</div>
                          ))}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {guests.flatMap(g => [
                            ...(g.invited_allergies || []).map(a => `${g.invited_name}: ${a}`),
                            ...(g.partner_allergies || []).map(a => `${g.partner_name}: ${a}`),
                          ]).map((allergy, i) => (
                            <div key={i} className="text-orange-600">{allergy}</div>
                          ))}
                          {guests.every(g => !g.invited_allergies?.length && !g.partner_allergies?.length) && (
                            <span className="text-gray-400">Inga</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* No match plan yet */}
        {!matchPlan && couples.length >= 3 && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <div className="text-5xl mb-4">🔀</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ingen matchning körd ännu</h3>
            <p className="text-gray-500">Klicka &quot;Kör matchning&quot; ovan för att matcha gäster med värdar.</p>
          </div>
        )}
      </main>
    </div>
  );
}
