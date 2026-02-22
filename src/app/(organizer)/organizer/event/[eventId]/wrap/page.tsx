'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface WrapStats {
  total_distance_km: number;
  avg_distance_km: number;
  total_couples: number;
  total_people: number;
  total_portions: number;
  shortest_ride_km: number;
  shortest_ride_couple: string;
  longest_ride_km: number;
  longest_ride_couple: string;
  age_youngest: number | null;
  age_oldest: number | null;
  districts_count: number;
  fun_facts_count: number;
  couples_with_routes: number;
  distance_source: string;
  last_guest_departure: string | null;
  wrap1_sent_at: string | null;
  wrap2_sent_at: string | null;
}

export default function WrapPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [stats, setStats] = useState<WrapStats | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [lastDeparture, setLastDeparture] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap`);
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        if (data.event?.wrap_stats) {
          setStats(data.event.wrap_stats);
          setLastDeparture(data.event.wrap_stats.last_guest_departure || '');
        }
      } else {
        setMessage(data.error || 'Kunde inte ladda');
      }
    } catch { setMessage('Nätverksfel'); }
    finally { setLoading(false); }
  }

  async function calculateStats() {
    setCalculating(true); setMessage('Beräknar...');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap/calculate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStats(data.stats);
        setMessage(data.stats.total_distance_km > 0
          ? `✅ Statistik beräknad! ${data.stats.couples_with_routes || 0} par med rutter.`
          : '⚠️ Statistik beräknad men avstånd saknas — kontrollera matchning och adresser.');
      }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setCalculating(false); }
  }

  async function saveManualFields() {
    if (!stats) return;
    const updated = { ...stats, last_guest_departure: lastDeparture || null };
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrap_stats: updated }),
      });
      if (res.ok) { setStats(updated); setMessage('✅ Sparat!'); }
      else { const d = await res.json(); setMessage(`❌ ${d.error}`); }
    } catch { setMessage('❌ Nätverksfel'); }
  }

  async function markWrapSent(wrapNumber: 1 | 2) {
    if (!stats) return;
    const updated = { ...stats, [`wrap${wrapNumber}_sent_at`]: new Date().toISOString() };
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrap_stats: updated }),
      });
      if (res.ok) { setStats(updated as WrapStats); setMessage(`✅ Wrap ${wrapNumber} markerad som skickad!`); }
      else { const d = await res.json(); setMessage(`❌ ${d.error}`); }
    } catch { setMessage('❌ Nätverksfel'); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 p-8"><p className="text-gray-500">Laddar...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href={`/organizer/event/${eventId}`} className="text-indigo-600 hover:text-indigo-700">← {event?.name || 'Tillbaka'}</Link>
          <h1 className="text-2xl font-bold">🎬 Wrap</h1>
        </div>

        {message && <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">{message}</div>}

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📊 Beräkna statistik</h2>
          <p className="text-gray-600 mb-4">Beräknar alla wrap-stats från eventdata.</p>
          <button onClick={calculateStats} disabled={calculating}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {calculating ? '⏳ Beräknar...' : '🔄 Beräkna stats'}
          </button>
        </div>

        {stats && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📈 Statistik</h2>
            {stats.total_distance_km === 0 && (
              <div className="bg-amber-50 text-amber-700 p-3 rounded-lg mb-4 text-sm">
                ⚠️ Avstånd = 0 — kör matchning först eller kontrollera att adresser har koordinater.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="🚴 Total cykling" value={stats.total_distance_km > 0 ? `${stats.total_distance_km} km` : '—'} />
              <Stat label="✏️ Snitt per person" value={stats.avg_distance_km > 0 ? `${stats.avg_distance_km} km` : '—'} />
              <Stat label="👥 Antal par" value={stats.total_couples} />
              <Stat label="👤 Antal personer" value={stats.total_people} />
              <Stat label="🍽️ Portioner" value={stats.total_portions} />
              <Stat label="⚡ Kortaste rutt" value={stats.shortest_ride_km > 0 ? `${stats.shortest_ride_km} km` : '—'} sub={stats.shortest_ride_couple || undefined} />
              <Stat label="🏔️ Längsta rutt" value={stats.longest_ride_km > 0 ? `${stats.longest_ride_km} km` : '—'} sub={stats.longest_ride_couple || undefined} />
              <Stat label="🎂 Åldersspan" value={stats.age_youngest && stats.age_oldest ? `${stats.age_youngest}–${stats.age_oldest} år` : 'Saknar födelseår'} />
              <Stat label="🏘️ Stadsdelar" value={stats.districts_count || '—'} />
              <Stat label="✨ Fun facts" value={stats.fun_facts_count} />
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">✏️ Manuella fält</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sista gästen lämnade</label>
            <input type="time" value={lastDeparture} onChange={(e) => setLastDeparture(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full max-w-xs" />
          </div>
          <button onClick={saveManualFields} className="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-900">💾 Spara</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">📧 Skicka Wraps</h2>
          <p className="text-gray-500 text-sm mb-4">Markera wraps som skickade efter att du delat dem med gästerna (via mail, SMS eller annat).</p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-1">🎬 Wrap 1 — Statistik</h3>
              <p className="text-sm text-gray-500 mb-4">Personlig + kollektiv statistik per gäst.</p>
              {stats?.wrap1_sent_at ? (
                <p className="text-green-600 text-sm">✅ Markerad skickad {new Date(stats.wrap1_sent_at).toLocaleString('sv-SE')}</p>
              ) : (
                <button onClick={() => markWrapSent(1)} disabled={!stats}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm w-full">✅ Markera som skickad</button>
              )}
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-1">🏆 Wrap 2 — Award</h3>
              <p className="text-sm text-gray-500 mb-4">Personlig utmärkelse per gäst.</p>
              {stats?.wrap2_sent_at ? (
                <p className="text-green-600 text-sm">✅ Markerad skickad {new Date(stats.wrap2_sent_at).toLocaleString('sv-SE')}</p>
              ) : (
                <button onClick={() => markWrapSent(2)} disabled={!stats}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm w-full">✅ Markera som skickad</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
