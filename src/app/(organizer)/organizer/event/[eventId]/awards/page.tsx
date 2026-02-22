'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AWARDS } from '@/lib/awards/calculate';

const SENSITIVE_AWARDS = ['oldest', 'youngest', 'most_allergies', 'only_vegetarian', 'least_fun_facts', 'average_age'];

export default function AwardsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [enabledAwards, setEnabledAwards] = useState<Set<string>>(new Set());
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'assignments' | 'preview'>('settings');
  const [previewPerson, setPreviewPerson] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/awards`);
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        setAssignments(data.assignments || []);
        if (data.event.enabled_awards) {
          setEnabledAwards(new Set(data.event.enabled_awards));
        } else {
          setEnabledAwards(new Set(AWARDS.filter(a => !SENSITIVE_AWARDS.includes(a.id)).map(a => a.id)));
        }
        setThankYouMessage(data.event.thank_you_message || '');
      } else {
        setError(data.error || 'Kunde inte ladda');
      }
    } catch { setError('Nätverksfel'); }
    finally { setLoading(false); }
  }

  function toggleAward(id: string) {
    const next = new Set(enabledAwards);
    next.has(id) ? next.delete(id) : next.add(id);
    setEnabledAwards(next);
  }

  async function saveSettings() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/awards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_awards: Array.from(enabledAwards), thank_you_message: thankYouMessage || null }),
      });
      if (res.ok) { setSuccess('Sparat!'); setTimeout(() => setSuccess(''), 3000); }
      else { const d = await res.json(); setError(d.error || 'Kunde inte spara'); }
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  async function recalculateAwards() {
    if (!confirm('Beräkna om alla awards? Ersätter befintliga tilldelningar.')) return;
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/calculate-awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(data.message || 'Klart!'); await loadData(); setActiveTab('assignments'); }
      else setError(data.error || 'Misslyckades');
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  const eventSlug = event?.slug || '';

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Laddar...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <Link href={`/organizer/event/${eventId}/settings`} className="text-indigo-600 hover:underline text-sm">← Inställningar</Link>
          <h1 className="text-2xl font-bold mt-2">🏆 Awards</h1>
          <p className="text-gray-600">{event?.name}</p>
        </div>
      </div>

      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto flex">
          {(['settings', 'assignments', 'preview'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium ${activeTab === tab ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500'}`}>
              {tab === 'settings' ? '⚙️ Inställningar' : tab === 'assignments' ? `👥 Tilldelning (${assignments.length})` : '👀 Preview'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4">{success}</div>}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">Snabbval</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setEnabledAwards(new Set(AWARDS.map(a => a.id)))} className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">✅ Alla</button>
                <button onClick={() => setEnabledAwards(new Set(AWARDS.filter(a => !SENSITIVE_AWARDS.includes(a.id)).map(a => a.id)))} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">🛡️ Säkra</button>
                <button onClick={() => setEnabledAwards(new Set())} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">❌ Inga</button>
              </div>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">Tillgängliga Awards</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {AWARDS.map(award => {
                  const on = enabledAwards.has(award.id);
                  const sensitive = SENSITIVE_AWARDS.includes(award.id);
                  return (
                    <div key={award.id} onClick={() => toggleAward(award.id)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${on ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-200 opacity-60'} ${sensitive && !on ? 'border-red-300' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{award.emoji}</span>
                        <div className="flex-1">
                          <div className="font-bold flex items-center gap-2">{award.title}
                            {sensitive && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">⚠️ Känslig</span>}
                          </div>
                          <div className="text-sm text-gray-600">{award.subtitle}</div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${on ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                          {on && '✓'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500 mt-4">{enabledAwards.size} av {AWARDS.length} aktiverade</p>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">💬 Tack-meddelande</h2>
              <textarea value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value)}
                placeholder="Tack för en fantastisk kväll! 🎉" className="w-full p-3 border rounded-lg h-32 resize-none" />
            </div>

            <div className="flex gap-3">
              <button onClick={saveSettings} disabled={saving} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Sparar...' : '💾 Spara'}
              </button>
              <button onClick={recalculateAwards} disabled={saving} className="px-6 bg-purple-100 text-purple-700 py-3 rounded-lg font-bold hover:bg-purple-200 disabled:opacity-50">
                🔄 Beräkna
              </button>
            </div>
          </div>
        )}

        {activeTab === 'assignments' && (
          <div className="bg-white rounded-lg border p-4">
            <h2 className="font-bold mb-3">Tilldelade Awards</h2>
            {assignments.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">Inga awards tilldelade ännu. Använd &quot;Beräkna&quot; i Inställningar.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a: any) => {
                  const award = AWARDS.find(aw => aw.id === a.award_id);
                  const name = a.person_type === 'partner' ? a.couples?.partner_name : a.couples?.invited_name;
                  return (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-2xl">{award?.emoji || '🎁'}</span>
                      <div className="flex-1">
                        <div className="font-medium">{name}</div>
                        <div className="text-sm text-gray-600">{award?.title || a.award_id}{a.value && ` — ${a.value}`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">👀 Förhandsgranska som gäst</h2>
              <p className="text-sm text-gray-600 mb-3">Välj en person för att se exakt hur deras award ser ut.</p>
              <select
                value={previewPerson}
                onChange={(e) => setPreviewPerson(e.target.value)}
                className="w-full p-3 border rounded-lg bg-white"
              >
                <option value="">Välj person...</option>
                {assignments.map((a: any) => {
                  const award = AWARDS.find(aw => aw.id === a.award_id);
                  const name = a.person_type === 'partner' ? a.couples?.partner_name : a.couples?.invited_name;
                  return (
                    <option key={a.id} value={`${a.couple_id}:${a.person_type}`}>
                      {name} — {award?.emoji} {award?.title || a.award_id}
                    </option>
                  );
                })}
              </select>
            </div>

            {previewPerson && (
              <div className="bg-white rounded-lg border overflow-hidden" style={{ height: '700px' }}>
                <iframe
                  key={previewPerson}
                  src={`/e/${eventSlug}/award?coupleId=${previewPerson.split(':')[0]}&person=${previewPerson.split(':')[1]}`}
                  className="w-full h-full border-0"
                  title="Award Preview"
                />
              </div>
            )}

            {!previewPerson && assignments.length > 0 && (
              <div className="bg-gray-50 rounded-lg border p-8 text-center text-gray-500">
                <span className="text-4xl block mb-3">🏆</span>
                Välj en person ovan för att förhandsgranska deras award
              </div>
            )}

            {assignments.length === 0 && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 text-amber-700">
                ⚠️ Inga awards tilldelade. Kör &quot;Beräkna&quot; i Inställningar först.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
