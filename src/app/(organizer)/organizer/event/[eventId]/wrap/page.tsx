'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';
import { useTabParam } from '@/hooks/useTabParam';

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
  unique_streets: number;
  busiest_street: { name: string; couples: number } | null;
  top_meal_street: { name: string; servings: number } | null;
  event_radius_km: number;
  event_radius_pair: string[];
  event_area_km2: number;
  neighbor_pairs: Array<{ a: string; b: string; street: string }>;
  fun_facts_count: number;
  couples_with_routes: number;
  distance_source: string;
  last_guest_departure: string | null;
  wrap_approved_at: string | null;
  wrap_sent_at: string | null;
}

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

type Tab = 'stats' | 'preview' | 'edit' | 'send';

export default function WrapPageWrapper() {
  return <Suspense><WrapPage /></Suspense>;
}

function WrapPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [stats, setStats] = useState<WrapStats | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [couples, setCouples] = useState<Couple[]>([]);
  const [activeTab, setActiveTab] = useTabParam<Tab>('stats');
  const [previewPerson, setPreviewPerson] = useState('');
  const [lastDeparture, setLastDeparture] = useState('');
  const [previewChecked, setPreviewChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const eventSlug = event?.slug || '';

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap`);
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        setCouples(data.couples || []);
        if (data.event?.wrap_stats) {
          setStats(data.event.wrap_stats);
          setLastDeparture(data.event.wrap_stats.last_guest_departure || '');
        }
      }
    } catch { setMessage('Nätverksfel'); }
    finally { setLoading(false); }
  }

  async function calculateStats() {
    setCalculating(true); setMessage('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap/calculate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStats(data.stats);
        setMessage(`✅ Statistik beräknad! ${data.stats.couples_with_routes || 0} par med rutter.`);
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

  async function approveWrap() {
    if (!stats) return;
    const updated = { ...stats, wrap_approved_at: new Date().toISOString() };
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrap_stats: updated }),
      });
      if (res.ok) { setStats(updated as WrapStats); setMessage('✅ Utskick godkänt!'); }
      else { const d = await res.json(); setMessage(`❌ ${d.error}`); }
    } catch { setMessage('❌ Nätverksfel'); }
  }

  async function revokeApproval() {
    if (!stats) return;
    const updated = { ...stats, wrap_approved_at: null };
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/wrap`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrap_stats: updated }),
      });
      if (res.ok) { setStats(updated as WrapStats); setMessage('Godkännande ångrat.'); }
      else { const d = await res.json(); setMessage(`❌ ${d.error}`); }
    } catch { setMessage('❌ Nätverksfel'); }
  }

  async function sendWraps() {
    if (!stats?.wrap_approved_at) return;
    setSending(true);
    try {
      const res = await fetch('/api/notify/send-wraps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (res.ok) {
        const updated = { ...stats, wrap_sent_at: new Date().toISOString() };
        await fetch(`/api/organizer/events/${eventId}/wrap`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wrap_stats: updated }),
        });
        setStats(updated as WrapStats);
        setMessage(`✅ Wraps skickade till ${data.sent || stats.total_people} personer!`);
      } else {
        setMessage(`❌ ${data.error || 'Kunde inte skicka'}`);
      }
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setSending(false); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Laddar...</p></div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stats', label: '📊 Statistik' },
    { id: 'edit', label: '✏️ Komplettera' },
    { id: 'preview', label: '👀 Preview' },
    { id: 'send', label: '📧 Skicka' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="🎬 Wrap" parentView="after" />

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto flex overflow-x-auto overscroll-x-contain scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 font-medium whitespace-nowrap text-sm ${activeTab === tab.id ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {message && (
          <div className={`p-3 rounded-lg mb-4 text-sm ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : message.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {message}
          </div>
        )}

        {/* 📊 Statistik */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            {!stats && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700">
                ⚠️ Ingen statistik beräknad ännu. Statistik beräknas automatiskt vid matchning.
                <button onClick={calculateStats} disabled={calculating}
                  className="ml-3 bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                  {calculating ? '⏳ ...' : '🔄 Beräkna nu'}
                </button>
              </div>
            )}

            {stats && (
              <>
                {stats.total_distance_km === 0 && (
                  <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm">
                    ⚠️ Avstånd = 0 — kör matchning först eller kontrollera att adresser har koordinater.
                  </div>
                )}

                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold">Kvällens siffror</h2>
                    <button onClick={calculateStats} disabled={calculating}
                      className="text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50">
                      {calculating ? '⏳' : '🔄 Uppdatera'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Stat label="🚴 Total cykling" value={stats.total_distance_km > 0 ? `${stats.total_distance_km} km` : '—'} />
                    <Stat label="✏️ Snitt per person" value={stats.avg_distance_km > 0 ? `${stats.avg_distance_km} km` : '—'} />
                    <Stat label="👥 Antal par" value={stats.total_couples} />
                    <Stat label="👤 Antal personer" value={stats.total_people} />
                    <Stat label="🍽️ Portioner" value={stats.total_portions} />
                    <Stat label="⚡ Kortaste rutt" value={stats.shortest_ride_km > 0 ? `${stats.shortest_ride_km} km` : '—'} sub={stats.shortest_ride_couple || undefined} />
                    <Stat label="🏔️ Längsta rutt" value={stats.longest_ride_km > 0 ? `${stats.longest_ride_km} km` : '—'} sub={stats.longest_ride_couple || undefined} />
                    <Stat label="🎂 Åldersspan" value={stats.age_youngest && stats.age_oldest ? `${stats.age_youngest}–${stats.age_oldest} år` : 'Saknar födelseår'} />
                  </div>
                </div>

                <div className="bg-white rounded-lg border p-4">
                  <h2 className="font-bold mb-4">Geografi & mat</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Stat label="🏘️ Antal gator" value={stats.unique_streets || '—'} />
                    <Stat label="🏠 Flest boende" value={stats.busiest_street?.name || '—'} sub={stats.busiest_street ? `${stats.busiest_street.couples} ekipage` : undefined} />
                    <Stat label="🍳 Flest rätter" value={stats.top_meal_street?.name || '—'} sub={stats.top_meal_street ? `${stats.top_meal_street.servings} kuvert` : undefined} />
                    <Stat label="🗺️ Eventets radie" value={stats.event_radius_km > 0 ? `${stats.event_radius_km} km` : '—'} />
                    <Stat label="📐 Eventets yta" value={stats.event_area_km2 > 0 ? `${stats.event_area_km2} km²` : '—'} />
                    <Stat label="🌳 Grannpar missade" value={stats.neighbor_pairs?.length ?? '—'} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 👀 Preview */}
        {activeTab === 'preview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-2">Förhandsgranska som gäst</h2>
              <p className="text-sm text-gray-600 mb-3">Välj en person för att se deras personliga wrap.</p>
              <select
                value={previewPerson}
                onChange={(e) => setPreviewPerson(e.target.value)}
                className="w-full p-3 border rounded-lg bg-white"
              >
                <option value="">Välj person...</option>
                {couples.map(c => (
                  <optgroup key={c.id} label={c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : '')}>
                    <option value={`${c.id}:invited`}>{c.invited_name}</option>
                    {c.partner_name && <option value={`${c.id}:partner`}>{c.partner_name}</option>}
                  </optgroup>
                ))}
              </select>
            </div>

            {previewPerson && eventSlug && (
              <div className="bg-white rounded-lg border overflow-hidden" style={{ height: '700px' }}>
                <iframe
                  key={previewPerson}
                  src={`/e/${eventSlug}/wrap?coupleId=${previewPerson.split(':')[0]}&person=${previewPerson.split(':')[1]}`}
                  className="w-full h-full border-0"
                  title="Wrap Preview"
                />
              </div>
            )}

            {!previewPerson && (
              <div className="bg-gray-50 rounded-lg border p-8 text-center text-gray-500">
                <span className="text-4xl block mb-3">🎬</span>
                Välj en person ovan för att förhandsgranska deras wrap
              </div>
            )}
          </div>
        )}

        {/* ✏️ Komplettera */}
        {activeTab === 'edit' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-1">Komplettera med uppgifter</h2>
              <p className="text-sm text-gray-500 mb-4">Lägg till information som inte kan beräknas automatiskt.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">🌙 Sista gästen lämnade efterfesten</label>
                  <input type="time" value={lastDeparture} onChange={(e) => setLastDeparture(e.target.value)}
                    className="border rounded-lg px-3 py-2 w-full max-w-xs" />
                  <p className="text-xs text-gray-400 mt-1">Visas i wrappen som &quot;Sista gästen gick hem kl XX:XX&quot;</p>
                </div>

                {/* Placeholder for future fields */}
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-gray-400 italic">Fler fält kan läggas till här — t.ex. &quot;Bästa citat under kvällen&quot;, &quot;Antal krossade glas&quot; 🍷</p>
                </div>
              </div>

              <button onClick={saveManualFields} disabled={!stats}
                className="mt-4 bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-900 disabled:opacity-50">
                💾 Spara
              </button>
            </div>
          </div>
        )}

        {/* 📧 Skicka */}
        {activeTab === 'send' && (() => {
          const hasStats = !!stats && stats.total_distance_km > 0;
          const isApproved = !!stats?.wrap_approved_at;
          const isSent = !!stats?.wrap_sent_at;
          const allChecked = hasStats && previewChecked;

          return (
            <div className="space-y-4">
              {/* Already sent */}
              {isSent && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                  <span className="text-4xl block mb-2">✅</span>
                  <p className="text-green-700 font-bold text-lg">Wraps skickade!</p>
                  <p className="text-green-600 text-sm mt-1">
                    {new Date(stats!.wrap_sent_at!).toLocaleString('sv-SE')}
                  </p>
                </div>
              )}

              {!isSent && (
                <>
                  {/* Step 1: Förbered */}
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${allChecked ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>1</span>
                      <h2 className="font-bold">Förbered</h2>
                    </div>
                    
                    <div className="space-y-3 ml-9">
                      <CheckItem checked={hasStats} label="Statistik beräknad" sub={hasStats ? `${stats!.total_distance_km} km, ${stats!.total_people} personer` : 'Gå till Statistik-tabben'} />
                      <CheckItem checked={previewChecked} label="Jag har förhandsgranskat wrappen" onClick={() => setPreviewChecked(!previewChecked)} interactive />
                    </div>
                  </div>

                  {/* Step 2: Godkänn */}
                  <div className={`bg-white rounded-lg border p-4 ${!allChecked ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${isApproved ? 'bg-green-500 text-white' : allChecked ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'}`}>2</span>
                      <h2 className="font-bold">Godkänn utskick</h2>
                    </div>

                    <div className="ml-9">
                      {isApproved ? (
                        <div className="flex items-center justify-between">
                          <p className="text-green-600 text-sm">✅ Godkänt {new Date(stats!.wrap_approved_at!).toLocaleString('sv-SE')}</p>
                          <button onClick={revokeApproval} className="text-sm text-gray-400 hover:text-red-500">Ångra</button>
                        </div>
                      ) : (
                        <button onClick={approveWrap} disabled={!allChecked}
                          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          🔒 Godkänn utskick till {stats?.total_people || '?'} personer
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Skicka */}
                  <div className={`bg-white rounded-lg border p-4 ${!isApproved ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${isSent ? 'bg-green-500 text-white' : isApproved ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'}`}>3</span>
                      <h2 className="font-bold">Skicka</h2>
                    </div>

                    <div className="ml-9">
                      <p className="text-sm text-gray-500 mb-3">
                        Varje gäst får ett mail med en personlig länk till sin wrap.
                      </p>
                      <button onClick={sendWraps} disabled={!isApproved || sending}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                        {sending ? '⏳ Skickar...' : '📧 Skicka wraps till alla gäster'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function CheckItem({ checked, label, sub, interactive, onClick }: { checked: boolean; label: string; sub?: string; interactive?: boolean; onClick?: () => void }) {
  return (
    <div
      className={`flex items-start gap-3 ${interactive ? 'cursor-pointer' : ''}`}
      onClick={interactive ? onClick : undefined}
    >
      <div className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border-2 ${checked ? 'bg-green-500 border-green-500 text-white' : interactive ? 'border-gray-300 hover:border-indigo-400' : 'border-gray-200'}`}>
        {checked && <span className="text-xs">✓</span>}
      </div>
      <div>
        <p className={`text-sm font-medium ${checked ? 'text-green-700' : 'text-gray-700'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
