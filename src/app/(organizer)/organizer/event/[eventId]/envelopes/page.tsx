'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';

/* ── Tab type ─────────────────────────────── */
type Tab = 'tider' | 'texter' | 'skicka';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tider', label: 'Tider', icon: '🕐' },
  { id: 'texter', label: 'Texter', icon: '💬' },
  { id: 'skicka', label: 'Skicka', icon: '📤' },
];

export default function EnvelopesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null;
    return t && TABS.some(tab => tab.id === t) ? t : 'tider';
  });

  function changeTab(tab: Tab) {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'tider') params.delete('tab');
    else params.set('tab', tab);
    const query = params.toString();
    window.history.pushState(null, '', `${window.location.pathname}${query ? '?' + query : ''}`);
  }

  useEffect(() => {
    function onPopState() {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      setActiveTab(t && TABS.some(tab => tab.id === t) ? t : 'tider');
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="✉️ Kuvert & Timing" parentView="matching" />

      {/* Chrome-style tabs */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4">
          <nav className="flex gap-0 overflow-x-auto scrollbar-hide">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {activeTab === 'tider' && <TiderTab eventId={eventId} />}
        {activeTab === 'texter' && <TexterTab eventId={eventId} />}
        {activeTab === 'skicka' && <SkickaTab eventId={eventId} />}
      </main>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 1: Tider — Course times with ±5 min
   ══════════════════════════════════════════════ */

function TiderTab({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<any>(null);
  const [timing, setTiming] = useState<TimingSettings | null>(null);
  const [courseOffsets, setCourseOffsets] = useState<Record<string, Record<string, number>>>({});
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/organizer/events/${eventId}/settings`).then(r => r.json()),
      fetch(`/api/organizer/events/${eventId}/timing`).then(r => r.json()),
    ]).then(([settingsData, timingData]) => {
      if (settingsData.event) {
        setEvent(settingsData.event);
        setCourseOffsets(settingsData.event.course_timing_offsets || {});
      }
      if (timingData.timing) setTiming(timingData.timing);
      setLoading(false);
    }).catch(() => { setError('Nätverksfel'); setLoading(false); });
  }, [eventId]);

  async function saveTime(field: string, value: string) {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event);
        await fetch('/api/admin/recalc-envelope-times', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId }),
        });
        setSuccess('Sparat + kuverttider uppdaterade');
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  async function saveTiming() {
    if (!timing) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      // Save per-course offsets to event settings
      await fetch(`/api/organizer/events/${eventId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_timing_offsets: courseOffsets }),
      });

      const res = await fetch(`/api/organizer/events/${eventId}/timing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teasing_minutes_before: timing.teasing_minutes_before,
          clue_1_minutes_before: timing.clue_1_minutes_before,
          clue_2_minutes_before: timing.clue_2_minutes_before,
          street_minutes_before: timing.street_minutes_before,
          number_minutes_before: timing.number_minutes_before,
          during_meal_clue_interval_minutes: timing.during_meal_clue_interval_minutes,
          distance_adjustment_enabled: timing.distance_adjustment_enabled,
        }),
      });
      if (res.ok) {
        await fetch('/api/admin/recalc-envelope-times', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId }),
        });
        setSuccess('Sparat!');
        setTimeout(() => setSuccess(''), 2000);
      } else { const d = await res.json(); setError(d.error); }
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  function handleTimingChange(field: keyof TimingSettings, value: number | boolean) {
    if (!timing) return;
    setTiming({ ...timing, [field]: value });
  }

  if (loading) return <LoadingPlaceholder />;

  const courses = [
    { label: 'Förrätt', icon: '🥗', field: 'starter_time', value: event?.starter_time },
    { label: 'Huvudrätt', icon: '🍖', field: 'main_time', value: event?.main_time },
    { label: 'Dessert', icon: '🍰', field: 'dessert_time', value: event?.dessert_time },
  ];

  return (
    <div className="space-y-4">
      <Feedback success={success} error={error} onClearError={() => setError('')} />

      {/* Course times */}
      <div className="bg-white rounded-xl shadow-sm p-5 border">
        <h2 className="font-semibold text-gray-900 mb-1">🕐 Starttider per rätt</h2>
        <p className="text-sm text-gray-500 mb-4">Kuverttider räknas automatiskt utifrån dessa.</p>
        {courses.map(({ label, icon, field, value }) => {
          const time = value?.slice(0, 5) || '00:00';
          const adjustTime = (minutes: number) => {
            const [h, m] = time.split(':').map(Number);
            const total = h * 60 + m + minutes;
            const newH = Math.floor(((total % 1440) + 1440) % 1440 / 60);
            const newM = ((total % 60) + 60) % 60;
            saveTime(field, `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`);
          };
          return (
            <div key={field} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700 font-medium">{icon} {label}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustTime(-5)} disabled={saving}
                  className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-50 text-sm font-bold">−</button>
                <button onClick={() => {
                  const val = prompt(`Ny tid för ${label}:`, time);
                  if (val) saveTime(field, val + ':00');
                }}
                  className="text-sm font-mono font-semibold text-gray-900 hover:text-indigo-600 cursor-pointer min-w-[3rem] text-center">
                  {time}
                </button>
                <button onClick={() => adjustTime(5)} disabled={saving}
                  className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 text-sm font-bold">+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reveal settings */}
      {timing && (
        <>
          <div className="bg-white rounded-xl p-5 shadow-sm border">
            <h2 className="font-semibold text-gray-900 mb-4">📬 Kuvert-reveals (innan rätt startar)</h2>
            <div className="space-y-4">
              <TimingRow label="🤫 Nyfiken? (teasing)" value={timing.teasing_minutes_before} onChange={(v) => handleTimingChange('teasing_minutes_before', v)} options={[180,240,300,360,420,480]} />
              <TimingRow label="🔮 Ledtråd 1" value={timing.clue_1_minutes_before} onChange={(v) => handleTimingChange('clue_1_minutes_before', v)} options={[60,90,120,150,180]} />
              <TimingRow label="🔮 Ledtråd 2" value={timing.clue_2_minutes_before} onChange={(v) => handleTimingChange('clue_2_minutes_before', v)} options={[15,20,30,45,60]} />
              <TimingRow label="📍 Gatunamn" value={timing.street_minutes_before} onChange={(v) => handleTimingChange('street_minutes_before', v)} options={[10,15,20,25,30]} />
              <TimingRow label="🔢 Husnummer" value={timing.number_minutes_before} onChange={(v) => handleTimingChange('number_minutes_before', v)} options={[3,5,8,10,15]} />
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border">
            <h2 className="font-semibold text-gray-900 mb-4">🍽️ Under måltiden</h2>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-700 text-sm">Max ledtrådar per måltid</span>
              <select value={timing.during_meal_clue_interval_minutes} onChange={(e) => handleTimingChange('during_meal_clue_interval_minutes', parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {[1,2,3,4].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border">
            <h2 className="font-semibold text-gray-900 mb-4">🚴 Avståndsanpassning</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={timing.distance_adjustment_enabled} onChange={(e) => handleTimingChange('distance_adjustment_enabled', e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-500" />
              <div>
                <span className="text-gray-800 font-medium text-sm">Auto-justera för cykelavstånd</span>
                <p className="text-gray-500 text-xs">Längre avstånd → tidigare gatunamn/nummer</p>
              </div>
            </label>
          </div>

          {/* Per-course reveal offsets */}
          <div className="bg-white rounded-xl shadow-sm border">
            <button onClick={() => setExpandedCourse(expandedCourse ? null : 'all')}
              className="w-full flex items-center justify-between p-5">
              <div>
                <h2 className="font-semibold text-gray-900 text-left">🎯 Per-rätt reveal-justering</h2>
                <p className="text-sm text-gray-500 text-left">Avvikelser från globala inställningarna ovan</p>
              </div>
              <span className="text-gray-400 text-lg">{expandedCourse ? '▲' : '▼'}</span>
            </button>
            {expandedCourse && (
              <div className="px-5 pb-5 space-y-4 border-t pt-4">
                {[
                  { key: 'starter', label: '🥗 Förrätt', time: event?.starter_time?.slice(0, 5) },
                  { key: 'main', label: '🍖 Varmrätt', time: event?.main_time?.slice(0, 5) },
                  { key: 'dessert', label: '🍰 Dessert', time: event?.dessert_time?.slice(0, 5) },
                ].map(({ key, label, time }) => {
                  const offsets = courseOffsets[key] || {};
                  const hasOffsets = Object.keys(offsets).length > 0;
                  const fields = [
                    { field: 'teasing_minutes_before', label: '🤫 Teasing', global: timing?.teasing_minutes_before },
                    { field: 'clue_1_minutes_before', label: '🔮 Ledtråd 1', global: timing?.clue_1_minutes_before },
                    { field: 'clue_2_minutes_before', label: '🔮 Ledtråd 2', global: timing?.clue_2_minutes_before },
                    { field: 'street_minutes_before', label: '📍 Gata', global: timing?.street_minutes_before },
                    { field: 'number_minutes_before', label: '🔢 Nummer', global: timing?.number_minutes_before },
                  ];

                  return (
                    <div key={key} className="border border-gray-100 rounded-lg">
                      <button onClick={() => setExpandedCourse(expandedCourse === key ? 'all' : key)}
                        className="w-full flex items-center justify-between p-3 hover:bg-gray-50">
                        <span className="text-sm font-medium">{label} <span className="text-gray-400">({time || '?'})</span></span>
                        <span className="text-xs text-gray-400">
                          {hasOffsets ? `${Object.keys(offsets).length} ändring${Object.keys(offsets).length > 1 ? 'ar' : ''}` : 'Standard'}
                          {expandedCourse === key ? ' ▲' : ' ▼'}
                        </span>
                      </button>
                      {expandedCourse === key && (
                        <div className="px-3 pb-3 space-y-2 border-t">
                          {fields.map(({ field, label: fLabel, global: globalVal }) => {
                            const override = offsets[field];
                            const isOverridden = override != null;
                            return (
                              <div key={field} className="flex items-center justify-between py-1.5">
                                <span className={`text-xs ${isOverridden ? 'text-indigo-700 font-medium' : 'text-gray-500'}`}>
                                  {fLabel} <span className="text-gray-300">({globalVal} min)</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => {
                                    const val = (override ?? globalVal ?? 15) - 5;
                                    if (val < 0) return;
                                    const next = { ...courseOffsets, [key]: { ...offsets, [field]: val } };
                                    setCourseOffsets(next);
                                  }} className="w-7 h-7 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs font-bold">−</button>
                                  <span className={`text-xs font-mono min-w-[2.5rem] text-center ${isOverridden ? 'text-indigo-700 font-bold' : 'text-gray-400'}`}>
                                    {override ?? globalVal ?? '?'} min
                                  </span>
                                  <button onClick={() => {
                                    const val = (override ?? globalVal ?? 15) + 5;
                                    const next = { ...courseOffsets, [key]: { ...offsets, [field]: val } };
                                    setCourseOffsets(next);
                                  }} className="w-7 h-7 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold">+</button>
                                  {isOverridden && (
                                    <button onClick={() => {
                                      const { [field]: _, ...rest } = offsets;
                                      const next = Object.keys(rest).length ? { ...courseOffsets, [key]: rest } : (() => { const { [key]: __, ...r } = courseOffsets; return r; })();
                                      setCourseOffsets(next);
                                    }} className="w-7 h-7 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 text-xs" title="Återställ">↩</button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live timeline preview from DB */}
          <LiveTimeline eventId={eventId} />

          <button onClick={saveTiming} disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 rounded-xl transition-colors">
            {saving ? 'Sparar...' : '💾 Spara reveal-inställningar'}
          </button>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 2: Reveal-inställningar (from timing page)
   ══════════════════════════════════════════════ */

interface TimingSettings {
  id: string;
  event_id: string;
  teasing_minutes_before: number;
  clue_1_minutes_before: number;
  clue_2_minutes_before: number;
  street_minutes_before: number;
  number_minutes_before: number;
  during_meal_clue_interval_minutes: number;
  distance_adjustment_enabled: boolean;
}

/* ── Types for Texter tab ──────────────────── */

interface Message { emoji: string; text: string; }
interface MessagesData {
  host_self_messages: Message[];
  lips_sealed_messages: Message[];
  mystery_host_messages: Message[];
}

const DEFAULT_MESSAGES: MessagesData = {
  host_self_messages: [
    { emoji: '👑', text: 'Psst... värden är faktiskt ganska fantastisk. (Det är du!)' },
    { emoji: '🪞', text: 'Ledtråd: Värden tittar på dig i spegeln varje morgon.' },
    { emoji: '🦸', text: 'Breaking news: Kvällens värd är en hjälte i förklädnad!' },
  ],
  lips_sealed_messages: [
    { emoji: '🤫', text: 'Our lips are sealed — avslöjar vi en ledtråd kan ni gissa vem!' },
    { emoji: '🤐', text: 'Tyst som en mus — vi kan inte säga mer utan att avslöja!' },
  ],
  mystery_host_messages: [
    { emoji: '🎭', text: 'Dina värdar är ett mysterium! Vem kan det vara?' },
    { emoji: '✨', text: 'Överraskning väntar — vi avslöjar inget!' },
  ],
};

function TexterTab({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<MessagesData>(DEFAULT_MESSAGES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadMessages(); }, [eventId]);

  async function loadMessages() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/messages`);
      const data = await res.json();
      if (res.ok) {
        setMessages({
          host_self_messages: data.host_self_messages?.length ? data.host_self_messages : DEFAULT_MESSAGES.host_self_messages,
          lips_sealed_messages: data.lips_sealed_messages?.length ? data.lips_sealed_messages : DEFAULT_MESSAGES.lips_sealed_messages,
          mystery_host_messages: data.mystery_host_messages?.length ? data.mystery_host_messages : DEFAULT_MESSAGES.mystery_host_messages,
        });
      }
    } catch { setError('Nätverksfel'); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/messages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      if (res.ok) { setSuccess('Sparat!'); setTimeout(() => setSuccess(''), 2000); }
      else { const d = await res.json(); setError(d.error); }
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  function updateMessage(category: keyof MessagesData, index: number, field: 'emoji' | 'text', value: string) {
    setMessages(prev => ({ ...prev, [category]: prev[category].map((msg, i) => i === index ? { ...msg, [field]: value } : msg) }));
  }
  function addMessage(category: keyof MessagesData) {
    setMessages(prev => ({ ...prev, [category]: [...prev[category], { emoji: '✨', text: 'Nytt meddelande...' }] }));
  }
  function removeMessage(category: keyof MessagesData, index: number) {
    setMessages(prev => ({ ...prev, [category]: prev[category].filter((_, i) => i !== index) }));
  }

  if (loading) return <LoadingPlaceholder />;

  const categories: { key: keyof MessagesData; title: string; desc: string; color: 'amber' | 'purple' | 'indigo' }[] = [
    { key: 'host_self_messages', title: '👑 Du är värden!', desc: 'Visas när gästen själv är värd', color: 'amber' },
    { key: 'lips_sealed_messages', title: '🤫 Lips Sealed', desc: 'Visas när vi inte kan avslöja fler ledtrådar', color: 'purple' },
    { key: 'mystery_host_messages', title: '🎭 Mystisk värd', desc: 'Visas när värden saknar fun facts', color: 'indigo' },
  ];

  return (
    <div className="space-y-6">
      <Feedback success={success} error={error} onClearError={() => setError('')} />

      {categories.map(({ key, title, desc, color }) => {
        const bg = { amber: 'bg-amber-50 border-amber-200', purple: 'bg-purple-50 border-purple-200', indigo: 'bg-indigo-50 border-indigo-200' };
        const btn = { amber: 'bg-amber-100 hover:bg-amber-200 text-amber-700', purple: 'bg-purple-100 hover:bg-purple-200 text-purple-700', indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' };
        return (
          <div key={key} className={`rounded-xl p-5 border ${bg[color]}`}>
            <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
            <p className="text-sm text-gray-600 mb-3">{desc}</p>
            <div className="space-y-2">
              {messages[key].map((msg, i) => (
                <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
                  <input type="text" value={msg.emoji} onChange={(e) => updateMessage(key, i, 'emoji', e.target.value)} className="w-10 text-center text-lg p-1 border border-gray-200 rounded" />
                  <textarea value={msg.text} onChange={(e) => updateMessage(key, i, 'text', e.target.value)} className="flex-1 p-2 border border-gray-200 rounded text-sm resize-none" rows={2} />
                  <button onClick={() => removeMessage(key, i)} className="text-red-400 hover:text-red-600 p-1">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => addMessage(key)} className={`mt-2 px-3 py-1.5 rounded-lg text-sm font-medium ${btn[color]}`}>+ Lägg till</button>
          </div>
        );
      })}

      <button onClick={handleSave} disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 rounded-xl transition-colors">
        {saving ? 'Sparar...' : '💾 Spara meddelanden'}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 4: Skicka ut kuvertlänkar
   ══════════════════════════════════════════════ */

function SkickaTab({ eventId }: { eventId: string }) {
  const [couples, setCouples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/guests`)
      .then(r => r.json())
      .then(data => {
        setCouples((data.couples || []).filter((c: any) => !c.cancelled && c.confirmed));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId]);

  async function sendAll() {
    if (!confirm(`Skicka kuvertlänk till ${couples.length} par via email?`)) return;
    setSending(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/send-envelopes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couple_ids: couples.map(c => c.id) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSent(new Set(couples.map(c => c.id)));
        setSuccess(`✅ Kuvertlänkar skickade till ${data.sent || couples.length} par!`);
      } else {
        setError(data.error || 'Kunde inte skicka');
      }
    } catch { setError('Nätverksfel'); }
    finally { setSending(false); }
  }

  if (loading) return <LoadingPlaceholder />;

  const withEmail = couples.filter(c => c.invited_email);
  const withoutEmail = couples.filter(c => !c.invited_email);

  return (
    <div className="space-y-4">
      <Feedback success={success} error={error} onClearError={() => setError('')} />

      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h2 className="font-semibold text-gray-900 mb-2">📤 Skicka kuvertlänkar</h2>
        <p className="text-sm text-gray-500 mb-4">
          Varje par får en personlig länk till sitt digitala kuvert via email.
          Kuvertet avslöjar steg för steg vart de ska under kvällen.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Par med email</span>
            <span className="font-medium text-gray-900">{withEmail.length}</span>
          </div>
          {withoutEmail.length > 0 && (
            <div className="flex justify-between text-amber-600">
              <span>Par utan email</span>
              <span className="font-medium">{withoutEmail.length} (kan inte skickas)</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="text-gray-600 font-medium">Totalt att skicka</span>
            <span className="font-bold text-gray-900">{withEmail.length} st</span>
          </div>
        </div>

        <button
          onClick={sendAll}
          disabled={sending || withEmail.length === 0 || sent.size > 0}
          className={`w-full py-3 rounded-xl font-semibold transition-colors ${
            sent.size > 0
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white'
          }`}
        >
          {sent.size > 0
            ? '✅ Kuvertlänkar skickade!'
            : sending
            ? 'Skickar...'
            : `📤 Skicka till ${withEmail.length} par`}
        </button>
      </div>

      {/* Preview of what gets sent */}
      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h3 className="font-medium text-gray-900 mb-3 text-sm">Förhandsvisning av email</h3>
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
          <p><strong>Ämne:</strong> 📬 Ditt kuvert är redo!</p>
          <p><strong>Innehåll:</strong> Hej [namn]! Kvällen närmar sig. Klicka på länken nedan för att öppna ditt personliga kuvert som steg för steg avslöjar vart du ska ikväll.</p>
          <p className="text-indigo-600 underline">https://cykelfesten.vercel.app/e/[slug]/live?coupleId=[id]</p>
        </div>
      </div>
    </div>
  );
}

/* ── Shared components ──────────────────────── */

/* ── Live Timeline: shows actual envelope times from DB ── */
function LiveTimeline({ eventId }: { eventId: string }) {
  const [couples, setCouples] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCouple, setSelectedCouple] = useState('');
  const [times, setTimes] = useState<Array<{ label: string; display: string; course: string; state: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/couples`)
      .then(r => r.json())
      .then(data => {
        const list = (data.couples || [])
          .filter((c: any) => !c.cancelled)
          .map((c: any) => ({ id: c.id, name: c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : '') }));
        setCouples(list);
        if (list.length && !selectedCouple) setSelectedCouple(list[0].id);
      });
  }, [eventId]);

  useEffect(() => {
    if (!selectedCouple) return;
    setLoading(true);
    fetch(`/api/organizer/events/${eventId}/envelope-times?coupleId=${selectedCouple}`)
      .then(r => r.json())
      .then(data => { setTimes(data.times || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [eventId, selectedCouple]);

  const courseColors: Record<string, string> = {
    starter: 'text-green-700',
    main: 'text-orange-700',
    dessert: 'text-pink-700',
    afterparty: 'text-purple-700',
    '': 'text-gray-400',
  };
  const courseIcons: Record<string, string> = { starter: '🥗', main: '🍖', dessert: '🍰', afterparty: '🎉' };

  const [open, setOpen] = useState(false);

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-indigo-100/50 rounded-xl transition-colors"
      >
        <span className="text-sm text-indigo-600 font-medium">🔍 Felsökning: Visa kuverttider (live från DB)</span>
        <span className={`text-indigo-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <select value={selectedCouple} onChange={e => setSelectedCouple(e.target.value)}
            className="w-full mb-3 px-3 py-2 border border-indigo-200 rounded-lg text-sm bg-white">
            {couples.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {loading ? (
            <p className="text-sm text-indigo-400">Laddar...</p>
          ) : times.length === 0 ? (
            <p className="text-sm text-indigo-400">Inga kuvert — kör matchning först</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-mono text-indigo-800 w-12 text-right">{t.display}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span className={`${courseColors[t.course] || 'text-gray-600'}`}>
                    {courseIcons[t.course] ? `${courseIcons[t.course]} ` : ''}{t.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimingRow({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: number[] }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-700 text-sm">{label}</span>
      <select value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
        {options.map(opt => <option key={opt} value={opt}>{opt < 60 ? `${opt} min` : `${Math.floor(opt/60)}h${opt%60 ? ` ${opt%60}m` : ''}`}</option>)}
      </select>
    </div>
  );
}

function TimelineItem({ time, label, highlight = false }: { time: string; label: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${highlight ? 'font-semibold text-indigo-800' : 'text-indigo-700'}`}>
      <span className="font-mono w-14 text-sm">{time}</span>
      <span className="flex-1 border-t border-indigo-200 border-dashed" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function fmtTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

function LoadingPlaceholder() {
  return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3" /><div className="h-40 bg-gray-200 rounded" /></div>;
}

function Feedback({ success, error, onClearError }: { success: string; error: string; onClearError: () => void }) {
  return (
    <>
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
          {error}
          <button onClick={onClearError} className="text-red-400">✕</button>
        </div>
      )}
    </>
  );
}
