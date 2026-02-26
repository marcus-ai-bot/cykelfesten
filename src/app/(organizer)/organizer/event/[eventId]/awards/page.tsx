'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';
import { AWARDS } from '@/lib/awards/calculate';
import { useTabParam } from '@/hooks/useTabParam';

const SENSITIVE_AWARDS = ['oldest', 'youngest', 'most_allergies', 'only_vegetarian', 'least_fun_facts', 'average_age'];

export default function AwardsPageWrapper() {
  return <Suspense><AwardsPage /></Suspense>;
}

function AwardsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [enabledAwards, setEnabledAwards] = useState<Set<string>>(new Set());
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useTabParam<'settings' | 'assignments' | 'preview' | 'send'>('settings');
  const [previewPerson, setPreviewPerson] = useState('');
  const [previewChecked, setPreviewChecked] = useState(false);
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

  // wrap_stats holds award_approved_at and award_sent_at
  const wrapStats = event?.wrap_stats || {};
  const awardApprovedAt = wrapStats.award_approved_at || null;
  const awardSentAt = wrapStats.award_sent_at || null;

  async function approveAwards() {
    setSaving(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/awards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_awards: Array.from(enabledAwards), thank_you_message: thankYouMessage, award_approved_at: new Date().toISOString() }),
      });
      if (res.ok) { await loadData(); setSuccess('Utskick godkänt!'); }
      else { const d = await res.json(); setError(d.error || 'Fel'); }
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  async function revokeAwardApproval() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/awards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_awards: Array.from(enabledAwards), thank_you_message: thankYouMessage, award_approved_at: null }),
      });
      if (res.ok) { await loadData(); setSuccess('Godkännande ångrat.'); }
    } catch { setError('Nätverksfel'); }
  }

  async function markAwardsSent() {
    setSaving(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/awards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_awards: Array.from(enabledAwards), thank_you_message: thankYouMessage, award_sent_at: new Date().toISOString() }),
      });
      if (res.ok) { await loadData(); setSuccess('Awards markerade som skickade!'); }
      else { const d = await res.json(); setError(d.error || 'Fel'); }
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
      <SubPageHeader eventId={eventId} title="🏆 Awards" parentView="after" />

      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto flex overflow-x-auto overscroll-x-contain scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {(['settings', 'assignments', 'preview', 'send'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 font-medium whitespace-nowrap text-sm ${activeTab === tab ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500'}`}>
              {tab === 'settings' ? '⚙️ Inställningar' : tab === 'assignments' ? `👥 Tilldelning (${assignments.length})` : tab === 'preview' ? '👀 Preview' : '📧 Skicka'}
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
              <AwardPreviewIframe
                eventId={eventId}
                eventSlug={eventSlug}
                coupleId={previewPerson.split(':')[0]}
                person={previewPerson.split(':')[1] as 'invited' | 'partner'}
              />
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

        {activeTab === 'send' && (() => {
          const hasAwards = assignments.length > 0;
          const isApproved = !!awardApprovedAt;
          const isSent = !!awardSentAt;
          const allChecked = hasAwards && previewChecked;

          return (
            <div className="space-y-4">
              {isSent && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                  <span className="text-4xl block mb-2">✅</span>
                  <p className="text-green-700 font-bold text-lg">Awards skickade!</p>
                  <p className="text-green-600 text-sm mt-1">{new Date(awardSentAt).toLocaleString('sv-SE')}</p>
                </div>
              )}

              {!isSent && (
                <>
                  {/* Step 1 */}
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${allChecked ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>1</span>
                      <h2 className="font-bold">Förbered</h2>
                    </div>
                    <div className="space-y-3 ml-9">
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border-2 ${hasAwards ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200'}`}>
                          {hasAwards && <span className="text-xs">✓</span>}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${hasAwards ? 'text-green-700' : 'text-gray-700'}`}>Awards beräknade</p>
                          <p className="text-xs text-gray-400">{hasAwards ? `${assignments.length} awards tilldelade` : 'Gå till Inställningar och kör Beräkna'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 cursor-pointer" onClick={() => setPreviewChecked(!previewChecked)}>
                        <div className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border-2 ${previewChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-indigo-400'}`}>
                          {previewChecked && <span className="text-xs">✓</span>}
                        </div>
                        <p className={`text-sm font-medium ${previewChecked ? 'text-green-700' : 'text-gray-700'}`}>Jag har förhandsgranskat awards</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className={`bg-white rounded-lg border p-4 ${!allChecked ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${isApproved ? 'bg-green-500 text-white' : allChecked ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'}`}>2</span>
                      <h2 className="font-bold">Godkänn utskick</h2>
                    </div>
                    <div className="ml-9">
                      {isApproved ? (
                        <div className="flex items-center justify-between">
                          <p className="text-green-600 text-sm">✅ Godkänt {new Date(awardApprovedAt).toLocaleString('sv-SE')}</p>
                          <button onClick={revokeAwardApproval} className="text-sm text-gray-400 hover:text-red-500">Ångra</button>
                        </div>
                      ) : (
                        <button onClick={approveAwards} disabled={!allChecked || saving}
                          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          🔒 Godkänn utskick
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className={`bg-white rounded-lg border p-4 ${!isApproved ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${isApproved ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'}`}>3</span>
                      <h2 className="font-bold">Skicka</h2>
                    </div>
                    <div className="ml-9">
                      <p className="text-sm text-gray-500 mb-3">Varje gäst får ett mail med en personlig länk till sin award.</p>
                      <button onClick={markAwardsSent} disabled={!isApproved || saving}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                        {saving ? '⏳ Skickar...' : '📧 Skicka awards till alla gäster'}
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-2">Automatiskt e-postutskick kommer snart.</p>
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

function AwardPreviewIframe({ eventId, eventSlug, coupleId, person }: {
  eventId: string; eventSlug: string; coupleId: string; person: 'invited' | 'partner';
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setToken(null);
    setError(false);
    fetch(`/api/organizer/events/${eventId}/wrap/preview-token?coupleId=${coupleId}&person=${person}`)
      .then(r => r.json())
      .then(data => {
        if (data.token) setToken(data.token);
        else setError(true);
      })
      .catch(() => setError(true));
  }, [eventId, coupleId, person]);

  if (error) return <div className="bg-red-50 rounded-lg border p-8 text-center text-red-600">Kunde inte generera preview-token</div>;
  if (!token) return <div className="bg-gray-50 rounded-lg border p-8 text-center text-gray-500">Laddar preview...</div>;

  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ height: '700px' }}>
      <iframe
        key={`${coupleId}:${person}`}
        src={`/e/${eventSlug}/award?token=${encodeURIComponent(token)}`}
        className="w-full h-full border-0"
        title="Award Preview"
      />
    </div>
  );
}
