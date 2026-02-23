'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InviteLinkSection } from '@/components/organizer/InviteLinkSection';
import { InlineGuestList } from '@/components/organizer/InlineGuestList';
import AddressAutocomplete from '@/components/AddressAutocomplete';

interface Props {
  phase: string;
  eventId: string;
  eventSlug: string;
  eventStatus: string;
  couplesCount: number;
  hasMatching: boolean;
  isPast: boolean;
}

export function PhaseContent({ phase, eventId, eventSlug, eventStatus, couplesCount, hasMatching, isPast }: Props) {
  const isEventLocked = eventStatus === 'locked' || eventStatus === 'active' || eventStatus === 'completed';
  const isInviteOpen = eventStatus === 'draft' || eventStatus === 'open';

  switch (phase) {
    case 'invite':
      return (
        <div className="space-y-6">
          {(eventStatus === 'matched' || eventStatus === 'locked') && (
            <InviteLockedBanner eventId={eventId} />
          )}
          {isInviteOpen && <InviteLinkSection eventId={eventId} />}
          <InlineGuestList eventId={eventId} />
        </div>
      );

    case 'matching': {
      // Pre-event preparation: Matchning → Karta → Kuvert & Timing → Efterfesten
      const matchingStatus: StepStatus = hasMatching ? 'done' : isEventLocked ? 'locked' : 'active';
      const envelopeStatus: StepStatus = hasMatching ? 'active' : 'todo';

      return (
        <div className="space-y-4">
          <ActionCard
            href={`/organizer/event/${eventId}/matching`}
            title={isEventLocked ? 'Matchning 🔒' : 'Matchning'}
            description={isEventLocked ? 'Ändra status för att låsa upp' : 'Koppla ihop gäster med värdar'}
            icon="🔀"
            disabled={isEventLocked}
            step={matchingStatus}
          />
          <ActionCard
            href={`/organizer/event/${eventId}/map`}
            title="Karta"
            description="Registrerade adresser och matchade rutter"
            icon="🗺️"
            disabled={!hasMatching}
          />
          <ActionCard
            href={`/organizer/event/${eventId}/envelopes`}
            title="Kuvert & Timing"
            description="Reveal-tider, texter och utskick"
            icon="✉️"
            disabled={!hasMatching}
            step={envelopeStatus}
          />
          <AfterPartyEditCard eventId={eventId} />
        </div>
      );
    }

    case 'live': {
      const isActive = eventStatus === 'active';

      return (
        <div className="space-y-4">
          {!isActive && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              ⏳ Live-vyn aktiveras automatiskt när eventet sätts till &quot;Pågår&quot;.
            </div>
          )}
          <LiveControlPanel eventId={eventId} isActive={isActive} />
          <UnplacedCouplesPanel eventId={eventId} />
          <GuestMessagePanel eventId={eventId} isActive={isActive} />
          <ActionCard
            href={`/organizer/event/${eventId}/map`}
            title="Live-karta"
            description="Följ middagen i realtid"
            icon="🗺️"
            disabled={!hasMatching}
          />
          <ActionCard
            href={`/organizer/event/${eventId}/help-guest`}
            title="Hjälp ett par"
            description="Se kuvertet som gästen ser det — välj par och tid"
            icon="🔍"
          />
        </div>
      );
    }

    case 'after':
      return (
        <div className="space-y-6">
          {!isPast && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              ⏳ Dessa funktioner blir tillgängliga efter eventet. Du kan förbereda redan nu.
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-6">
            <ActionCard
              href={`/organizer/event/${eventId}/wrap`}
              title="Wraps"
              description="Statistik, preview och utskick"
              icon="🎬"
            />
            <ActionCard
              href={`/organizer/event/${eventId}/awards`}
              title="Awards"
              description="Skapa och dela ut priser"
              icon="🏆"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

/* ── AfterPartyEditCard ────────────────────────────────── */

function AfterPartyEditCard({ eventId }: { eventId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    afterparty_title: '',
    afterparty_location: '',
    afterparty_time: '',
    afterparty_description: '',
    afterparty_coordinates: null as { lat: number; lng: number } | null,
  });

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/settings`);
      const data = await res.json();
      if (res.ok && data.event) {
        setForm({
          afterparty_title: data.event.afterparty_title || '',
          afterparty_location: data.event.afterparty_location || '',
          afterparty_time: data.event.afterparty_time?.slice(0, 5) || '',
          afterparty_description: data.event.afterparty_description || '',
          afterparty_coordinates: null,
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSave() {
    setSaving(true); setMessage('');
    try {
      const body: Record<string, any> = { ...form };
      if (body.afterparty_time) body.afterparty_time = body.afterparty_time + ':00';
      const res = await fetch(`/api/organizer/events/${eventId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMessage('✅ Sparat');
        // Auto-recalc wrap stats if coordinates changed
        if (form.afterparty_coordinates || form.afterparty_location) {
          fetch(`/api/organizer/events/${eventId}/wrap/calculate`, { method: 'POST' })
            .then(() => setMessage('✅ Sparat + avstånd omräknade'))
            .catch(() => {});
        }
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessage('❌ Kunde inte spara');
      }
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 p-5 w-full text-left hover:bg-gray-50/50 transition"
      >
        <span className="text-2xl">🎉</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">Efterfesten</h3>
          <p className="text-xs text-gray-500">Rubrik, plats, tid och beskrivning</p>
        </div>
        <span className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {loading ? (
            <p className="text-sm text-gray-400">Laddar...</p>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-500 font-medium">Rubrik</label>
                <input
                  type="text"
                  value={form.afterparty_title}
                  onChange={e => setForm(f => ({ ...f, afterparty_title: e.target.value }))}
                  placeholder="t.ex. Efterfest på Lalloos!"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Plats</label>
                <div className="mt-1">
                  <AddressAutocomplete
                    value={form.afterparty_location}
                    onChange={(address, coordinates) => setForm(f => ({
                      ...f,
                      afterparty_location: address,
                      ...(coordinates ? { afterparty_coordinates: coordinates } : {}),
                    }))}
                    placeholder="t.ex. Garvargatan 2, Piteå"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Tid</label>
                <input
                  type="time"
                  value={form.afterparty_time}
                  onChange={e => setForm(f => ({ ...f, afterparty_time: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Beskrivning</label>
                <textarea
                  value={form.afterparty_description}
                  onChange={e => setForm(f => ({ ...f, afterparty_description: e.target.value }))}
                  placeholder="Berätta vad som händer på efterfesten..."
                  rows={3}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>
              {message && (
                <div className={`text-sm p-2 rounded-lg ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {message}
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition text-sm"
              >
                {saving ? 'Sparar...' : '💾 Spara efterfest-info'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── LiveControlPanel ──────────────────────────────────── */

function LiveControlPanel({ eventId, isActive }: { eventId: string; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [timing, setTiming] = useState<any>(null);
  const [courseOffsets, setCourseOffsets] = useState<Record<string, Record<string, number>>>({});
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delaying, setDelaying] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [afterpartyStatus, setAfterpartyStatus] = useState<{ teasing: boolean; revealed: boolean }>({ teasing: false, revealed: false });
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [settingsRes, timingRes] = await Promise.all([
        fetch(`/api/organizer/events/${eventId}/settings`),
        fetch(`/api/organizer/events/${eventId}/timing`),
      ]);
      const settingsData = await settingsRes.json();
      const timingData = await timingRes.json();
      if (settingsRes.ok && settingsData.event) {
        setEvent(settingsData.event);
        setCourseOffsets(settingsData.event.course_timing_offsets || {});
        setAfterpartyStatus({
          teasing: !!settingsData.event.afterparty_teasing_at,
          revealed: !!settingsData.event.afterparty_revealed_at,
        });
      }
      if (timingRes.ok && timingData.timing) setTiming(timingData.timing);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveTime(field: string, value: string, oldTime: string) {
    const label = field === 'starter_time' ? 'Förrätt' : field === 'main_time' ? 'Huvudrätt' : field === 'afterparty_time' ? 'Efterfest' : 'Dessert';
    const newTime = value.slice(0, 5);
    setSaving(true); setMessage('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event);
        if (field !== 'afterparty_time') {
          const recalcRes = await fetch('/api/admin/recalc-envelope-times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId }),
          });
          const recalcData = await recalcRes.json().catch(() => ({}));
          const count = recalcData.updated || '';
          setMessage(`✅ ${label}: ${oldTime} → ${newTime}${count ? ` (${count} kuverttider uppdaterade)` : ''}`);
        } else {
          setMessage(`✅ ${label}: ${oldTime} → ${newTime}`);
        }
        setTimeout(() => setMessage(''), 4000);
      }
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setSaving(false); }
  }

  async function adjustAllTimes(minutes: number) {
    setDelaying(true); setMessage('');
    try {
      const res = await fetch('/api/admin/delay-envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, delay_minutes: minutes }),
      });
      if (res.ok) {
        await loadData();
        const dir = minutes > 0 ? 'fram' : 'tillbaka';
        setMessage(`✅ Alla kuverttider ${dir} ${Math.abs(minutes)} min`);
        setTimeout(() => setMessage(''), 3000);
      } else setMessage('❌ Kunde inte justera');
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setDelaying(false); }
  }

  async function activateCourse(course: string) {
    const label = course === 'starter' ? 'förrätt' : course === 'main' ? 'huvudrätt' : 'dessert';
    if (!confirm(`Aktivera kuvert för ${label} nu?`)) return;
    setActivating(course); setMessage('');
    try {
      const res = await fetch('/api/admin/activate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, course }),
      });
      if (res.ok) {
        setMessage(`✅ Kuvert för ${label} aktiverade!`);
        setTimeout(() => setMessage(''), 3000);
      } else setMessage('❌ Kunde inte aktivera');
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setActivating(null); }
  }

  const courses = [
    { label: 'Förrätt', icon: '🥗', field: 'starter_time', value: event?.starter_time },
    { label: 'Huvudrätt', icon: '🍖', field: 'main_time', value: event?.main_time },
    { label: 'Dessert', icon: '🍰', field: 'dessert_time', value: event?.dessert_time },
  ];

  return (
    <div className={`rounded-xl shadow-sm border overflow-hidden ${
      isActive ? 'bg-white border-2 border-orange-200' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 p-5 w-full text-left hover:bg-gray-50/50 transition"
      >
        <span className="text-2xl">🎛️</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">Live control</h3>
          <p className="text-xs text-gray-500">Kuverttider • Aktivera manuellt</p>
        </div>
        <span className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {message && (
        <div className={`text-sm px-5 py-2 mx-5 rounded-lg ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      {/* Expandable content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">
          {/* Course times with ±5 min */}
          {!loading && event && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">🕐 Tider</p>
              <div className="space-y-1">
                {courses.map(({ label, icon, field, value }) => {
                  const time = value?.slice(0, 5) || '00:00';
                  const courseKey = field.replace('_time', ''); // starter, main, dessert
                  const adjust = (min: number) => {
                    const [h, m] = time.split(':').map(Number);
                    const total = h * 60 + m + min;
                    const newH = Math.floor(((total % 1440) + 1440) % 1440 / 60);
                    const newM = ((total % 60) + 60) % 60;
                    const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`;
                    saveTime(field, newTime, time);
                  };
                  const isExpanded = expandedCourse === courseKey;
                  const offsets = courseOffsets[courseKey] || {};
                  const revealFields = [
                    { key: 'teasing_minutes_before', label: '🤫 Nyfiken', defaultVal: timing?.teasing_minutes_before ?? 360 },
                    { key: 'clue_1_minutes_before', label: '🔮 Ledtråd 1', defaultVal: timing?.clue_1_minutes_before ?? 120 },
                    { key: 'clue_2_minutes_before', label: '🔮 Ledtråd 2', defaultVal: timing?.clue_2_minutes_before ?? 30 },
                    { key: 'street_minutes_before', label: '📍 Gata', defaultVal: timing?.street_minutes_before ?? 15 },
                    { key: 'number_minutes_before', label: '🔢 Nummer', defaultVal: timing?.number_minutes_before ?? 5 },
                  ];
                  const fmtRevealTime = (minBefore: number) => {
                    const [h, m] = time.split(':').map(Number);
                    const total = h * 60 + m - minBefore;
                    const rH = Math.floor(((total % 1440) + 1440) % 1440 / 60);
                    const rM = ((total % 60) + 60) % 60;
                    return `${String(rH).padStart(2, '0')}:${String(rM).padStart(2, '0')}`;
                  };
                  return (
                    <div key={field}>
                      <div className="flex items-center justify-between py-2">
                        <button onClick={() => setExpandedCourse(isExpanded ? null : courseKey)}
                          className="text-sm text-gray-700 hover:text-indigo-600 flex items-center gap-1">
                          {icon} {label}
                          <span className="text-[10px] text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => adjust(-5)} disabled={saving}
                            className="w-7 h-7 rounded-lg bg-orange-50 text-orange-500 hover:bg-orange-100 disabled:opacity-40 text-xs font-bold flex items-center justify-center">−</button>
                          <span className="text-sm font-mono font-semibold text-gray-900 min-w-[3rem] text-center">{time}</span>
                          <button onClick={() => adjust(5)} disabled={saving}
                            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 disabled:opacity-40 text-xs font-bold flex items-center justify-center">+</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="ml-4 mb-3 pl-3 border-l-2 border-indigo-100 space-y-1.5">
                          {revealFields.map(({ key, label: rLabel, defaultVal }) => {
                            const val = offsets[key] ?? defaultVal;
                            const adjustReveal = async (delta: number) => {
                              const newVal = Math.max(0, val + delta);
                              const newOffsets = { ...courseOffsets, [courseKey]: { ...offsets, [key]: newVal } };
                              setCourseOffsets(newOffsets);
                              setSaving(true);
                              try {
                                await fetch(`/api/organizer/events/${eventId}/settings`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ course_timing_offsets: newOffsets }),
                                });
                                await fetch('/api/admin/recalc-envelope-times', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ event_id: eventId }),
                                });
                                setMessage(`✅ ${rLabel} → ${fmtRevealTime(newVal)}`);
                                setTimeout(() => setMessage(''), 2000);
                              } catch { setMessage('❌ Nätverksfel'); }
                              finally { setSaving(false); }
                            };
                            const isOverridden = offsets[key] != null;
                            return (
                              <div key={key} className="flex items-center justify-between">
                                <span className={`text-xs ${isOverridden ? 'text-indigo-700 font-medium' : 'text-gray-500'}`}>
                                  {rLabel}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => adjustReveal(-5)} disabled={saving}
                                    className="w-6 h-6 rounded bg-orange-50 text-orange-500 hover:bg-orange-100 disabled:opacity-40 text-[10px] font-bold">−</button>
                                  <span className={`text-xs font-mono min-w-[3rem] text-center ${isOverridden ? 'text-indigo-700 font-bold' : 'text-gray-400'}`}>
                                    {fmtRevealTime(val)}
                                  </span>
                                  <button onClick={() => adjustReveal(5)} disabled={saving}
                                    className="w-6 h-6 rounded bg-blue-50 text-blue-500 hover:bg-blue-100 disabled:opacity-40 text-[10px] font-bold">+</button>
                                  {isOverridden && (
                                    <button onClick={async () => {
                                      const { [key]: _, ...rest } = offsets;
                                      const newOffsets = Object.keys(rest).length
                                        ? { ...courseOffsets, [courseKey]: rest }
                                        : (() => { const { [courseKey]: __, ...r } = courseOffsets; return r; })();
                                      setCourseOffsets(newOffsets);
                                      setSaving(true);
                                      try {
                                        await fetch(`/api/organizer/events/${eventId}/settings`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ course_timing_offsets: newOffsets }),
                                        });
                                        await fetch('/api/admin/recalc-envelope-times', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ event_id: eventId }),
                                        });
                                        setMessage(`✅ ${rLabel} återställd`);
                                        setTimeout(() => setMessage(''), 2000);
                                      } catch { setMessage('❌ Nätverksfel'); }
                                      finally { setSaving(false); }
                                    }} className="w-6 h-6 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 text-[10px]" title="Återställ">↩</button>
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

                {/* Afterparty row — shown only if afterparty_time exists */}
                {event.afterparty_time && (() => {
                  const apTime = event.afterparty_time?.slice(0, 5) || '00:00';
                  const adjustAp = (min: number) => {
                    const [h, m] = apTime.split(':').map(Number);
                    const total = h * 60 + m + min;
                    const newH = Math.floor(((total % 1440) + 1440) % 1440 / 60);
                    const newM = ((total % 60) + 60) % 60;
                    const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`;
                    saveTime('afterparty_time', newTime, apTime);
                  };
                  return (
                    <div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-gray-700">🎉 Efterfest</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => adjustAp(-5)} disabled={saving}
                            className="w-7 h-7 rounded-lg bg-orange-50 text-orange-500 hover:bg-orange-100 disabled:opacity-40 text-xs font-bold flex items-center justify-center">−</button>
                          <span className="text-sm font-mono font-semibold text-gray-900 min-w-[3rem] text-center">{apTime}</span>
                          <button onClick={() => adjustAp(5)} disabled={saving}
                            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 disabled:opacity-40 text-xs font-bold flex items-center justify-center">+</button>
                        </div>
                      </div>
                      {/* Afterparty details */}
                      <div className="ml-6 mb-2 space-y-0.5">
                        {event.afterparty_location && (
                          <p className="text-xs text-gray-500">📍 {event.afterparty_location}</p>
                        )}
                        {event.afterparty_door_code && (
                          <p className="text-xs text-gray-500">🔑 Portkod: <span className="font-mono font-medium text-gray-700">{event.afterparty_door_code}</span></p>
                        )}
                        {event.afterparty_byob && (
                          <p className="text-xs text-amber-600">🍻 Ta med egen dryck</p>
                        )}
                        {event.afterparty_notes && (
                          <p className="text-xs text-gray-400 italic">{event.afterparty_notes}</p>
                        )}
                        <p className="text-[10px] text-gray-300 mt-1">Alla cyklar hit efter desserten</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Manual activation */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">📤 Aktivera kuvert manuellt</p>
            <div className="flex gap-2">
              {[
                { course: 'starter', label: '🥗 Förrätt' },
                { course: 'main', label: '🍖 Huvudrätt' },
                { course: 'dessert', label: '🍰 Efterrätt' },
              ].map(({ course, label }) => (
                <button key={course} onClick={() => activateCourse(course)} disabled={!!activating || !isActive}
                  className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-40 text-sm font-medium transition">
                  {activating === course ? '...' : label}
                </button>
              ))}
            </div>
          </div>

          {/* Afterparty activation */}
          {event?.afterparty_time && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">🎉 Efterfest-reveal</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    if (!confirm('Aktivera teasing för efterfesten? Gästerna ser tid + BYOB-info.')) return;
                    setActivating('afterparty-tease'); setMessage('');
                    try {
                      const res = await fetch('/api/admin/activate-afterparty', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event_id: eventId, action: 'tease' }),
                      });
                      if (res.ok) {
                        setAfterpartyStatus(s => ({ ...s, teasing: true }));
                        setMessage('✅ Efterfest-teasing aktiverad!');
                        setTimeout(() => setMessage(''), 3000);
                      } else setMessage('❌ Kunde inte aktivera');
                    } catch { setMessage('❌ Nätverksfel'); }
                    finally { setActivating(null); }
                  }}
                  disabled={!!activating || !isActive || afterpartyStatus.teasing}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    afterpartyStatus.teasing
                      ? 'bg-purple-100 text-purple-500 cursor-default'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-40'
                  }`}
                >
                  {activating === 'afterparty-tease' ? '...' : afterpartyStatus.teasing ? '✓ Teasing' : '🤫 Teasing'}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Avslöja efterfesten? Gästerna ser full adress + karta.')) return;
                    setActivating('afterparty-reveal'); setMessage('');
                    try {
                      const res = await fetch('/api/admin/activate-afterparty', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event_id: eventId, action: 'reveal' }),
                      });
                      if (res.ok) {
                        setAfterpartyStatus({ teasing: true, revealed: true });
                        setMessage('✅ Efterfest avslöjad! 🎉');
                        setTimeout(() => setMessage(''), 3000);
                      } else setMessage('❌ Kunde inte avslöja');
                    } catch { setMessage('❌ Nätverksfel'); }
                    finally { setActivating(null); }
                  }}
                  disabled={!!activating || !isActive || afterpartyStatus.revealed}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    afterpartyStatus.revealed
                      ? 'bg-purple-100 text-purple-500 cursor-default'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-40'
                  }`}
                >
                  {activating === 'afterparty-reveal' ? '...' : afterpartyStatus.revealed ? '✓ Avslöjad' : '🎉 Avslöja'}
                </button>
                {(afterpartyStatus.teasing || afterpartyStatus.revealed) && (
                  <button
                    onClick={async () => {
                      if (!confirm('Återställ efterfest-reveal? Gästerna ser den som låst igen.')) return;
                      setActivating('afterparty-reset'); setMessage('');
                      try {
                        const res = await fetch('/api/admin/activate-afterparty', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ event_id: eventId, action: 'reset' }),
                        });
                        if (res.ok) {
                          setAfterpartyStatus({ teasing: false, revealed: false });
                          setMessage('✅ Efterfest-reveal återställd');
                          setTimeout(() => setMessage(''), 3000);
                        } else setMessage('❌ Kunde inte återställa');
                      } catch { setMessage('❌ Nätverksfel'); }
                      finally { setActivating(null); }
                    }}
                    disabled={!!activating || !isActive}
                    className="px-3 py-1.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 disabled:opacity-40 text-sm font-medium transition"
                  >
                    {activating === 'afterparty-reset' ? '...' : '↩ Återställ'}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Auto: Teasing 30 min före, avslöjad vid {event.afterparty_time?.slice(0, 5)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── UnplacedCouplesPanel ───────────────────────────────── */

interface UnplacedCouple {
  id: string;
  name: string;
  address: string;
  person_count: number;
}

interface HostOption {
  couple_id: string;
  name: string;
  address: string;
  current_guests: number;
  max_guests: number;
}

interface UnplacedData {
  unplaced: UnplacedCouple[];
  hostsByCourse: Record<string, HostOption[]>;
}

const COURSE_LABELS: Record<string, { label: string; icon: string }> = {
  starter: { label: 'Förrätt', icon: '🥗' },
  main: { label: 'Huvudrätt', icon: '🍖' },
  dessert: { label: 'Dessert', icon: '🍰' },
};

function UnplacedCouplesPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<UnplacedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // selections: coupleId -> { course, hostId }
  const [selections, setSelections] = useState<Record<string, { course: string; hostId: string }>>({});
  const [showNotifyDraft, setShowNotifyDraft] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/unplaced`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return null;
  if (!data || data.unplaced.length === 0) return null;

  const courses = ['starter', 'main', 'dessert'];

  const handleSelectionChange = (coupleId: string, course: string, hostId: string) => {
    setSelections(prev => ({
      ...prev,
      [coupleId]: { course, hostId },
    }));
  };

  const selectedCount = Object.values(selections).filter(s => s.hostId).length;

  const handleSave = async () => {
    const placements = Object.entries(selections)
      .filter(([, s]) => s.hostId)
      .map(([coupleId, s]) => ({
        guest_couple_id: coupleId,
        host_couple_id: s.hostId,
        course: s.course,
      }));

    if (placements.length === 0) return;

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch(`/api/organizer/events/${eventId}/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placements }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage(`✅ ${json.pairings_created} par placerade!`);
        setSelections({});
        // Reload to refresh list
        setLoading(true);
        await loadData();
        setTimeout(() => setMessage(''), 5000);
      } else {
        setMessage(`❌ ${json.error || 'Kunde inte placera'}`);
      }
    } catch {
      setMessage('❌ Nätverksfel');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl shadow-sm border-2 border-red-200 bg-red-50/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-5">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">
            Oplacerade par
            <span className="ml-2 text-sm font-normal text-red-600">
              ({data.unplaced.length} st)
            </span>
          </h3>
          <p className="text-xs text-gray-500">
            Par som saknar placering i aktiv matchning. Välj värd per rätt nedan.
          </p>
        </div>
      </div>

      {message && (
        <div className={`text-sm px-5 py-2 mx-5 rounded-lg ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="px-5 pb-5 space-y-4">
        {/* Per-course grouping: for each course, show available hosts and unplaced couples */}
        {courses.map(course => {
          const hosts = data.hostsByCourse[course] || [];
          const { label, icon } = COURSE_LABELS[course];

          // Only show course if there are hosts with capacity
          const hostsWithRoom = hosts.filter(h => h.max_guests - h.current_guests > 0);
          if (hostsWithRoom.length === 0 && hosts.length === 0) return null;

          return (
            <div key={course} className="bg-white rounded-lg border border-gray-100 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                {icon} {label}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({hostsWithRoom.length} värdar med plats)
                </span>
              </h4>

              <div className="space-y-2">
                {data.unplaced.map(couple => {
                  const sel = selections[couple.id];
                  const isSelectedForThisCourse = sel?.course === course;

                  return (
                    <div
                      key={`${couple.id}-${course}`}
                      className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                    >
                      {/* Couple info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {couple.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{couple.address}</p>
                      </div>

                      {/* Host dropdown */}
                      <select
                        value={isSelectedForThisCourse ? sel.hostId : ''}
                        onChange={e => handleSelectionChange(couple.id, course, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-w-[260px]"
                      >
                        <option value="">Välj värd...</option>
                        {hosts.map(host => {
                          const available = host.max_guests - host.current_guests;
                          const hasRoom = available >= couple.person_count;
                          return (
                            <option
                              key={host.couple_id}
                              value={host.couple_id}
                              disabled={!hasRoom}
                            >
                              {host.name} — {host.address} ({host.current_guests}/{host.max_guests} pers)
                              {!hasRoom ? ' ⛔' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Save button */}
        {selectedCount > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition text-sm"
          >
            {saving ? 'Sparar...' : `💾 Spara ${selectedCount} placering${selectedCount > 1 ? 'ar' : ''}`}
          </button>
        )}

        {/* Notify hosts draft button */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={() => setShowNotifyDraft(!showNotifyDraft)}
            className="text-sm text-amber-700 hover:text-amber-800 font-medium transition"
          >
            📩 Fråga värdar om extra kapacitet
          </button>

          {showNotifyDraft && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-600 font-medium mb-2">
                Förhandsvisning av meddelande:
              </p>
              <div className="bg-white rounded-lg p-3 text-sm text-gray-700 border border-amber-100">
                <p>Hej! 👋</p>
                <p className="mt-1">
                  Vi har par som behöver ny värd. Kan du ta emot 1-2 par extra?
                </p>
                <p className="mt-1 text-gray-400 italic">
                  [Länk till svarsformulär kommer här]
                </p>
              </div>
              <p className="text-[10px] text-amber-500 mt-2">
                ⚠️ Meddelandet skickas <strong>inte</strong> automatiskt. Kopiera och skicka manuellt vid behov.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── GuestMessagePanel ─────────────────────────────────── */

function GuestMessagePanel({ eventId, isActive }: { eventId: string; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [audience, setAudience] = useState<'all' | 'starter' | 'main' | 'dessert'>('all');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function handleSend() {
    if (!messageText.trim()) return;
    if (!confirm(`Skicka meddelande till ${audience === 'all' ? 'alla gäster' : audience === 'starter' ? 'förrätt-gäster' : audience === 'main' ? 'huvudrätt-gäster' : 'dessert-gäster'}?`)) return;
    setSending(true); setFeedback('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/guest-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience, message: messageText.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(`✅ Skickat till ${data.sent || '?'} gäster`);
        setMessageText('');
        setTimeout(() => setFeedback(''), 5000);
      } else {
        setFeedback(`❌ ${data.error || 'Kunde inte skicka'}`);
      }
    } catch { setFeedback('❌ Nätverksfel'); }
    finally { setSending(false); }
  }

  const audiences = [
    { id: 'all' as const, label: 'Alla', icon: '👥' },
    { id: 'starter' as const, label: 'Förrätt', icon: '🥗' },
    { id: 'main' as const, label: 'Huvudrätt', icon: '🍖' },
    { id: 'dessert' as const, label: 'Dessert', icon: '🍰' },
  ];

  return (
    <div className={`rounded-xl shadow-sm border overflow-hidden ${
      isActive ? 'bg-white border border-amber-200' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 p-5 w-full text-left hover:bg-gray-50/50 transition"
      >
        <span className="text-2xl">📢</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">Meddelande till gäster</h3>
          <p className="text-xs text-gray-500">Skicka viktiga meddelanden under middagen</p>
        </div>
        <span className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {feedback && (
            <div className={`text-sm p-2 rounded-lg ${feedback.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {feedback}
            </div>
          )}

          {/* Audience selector */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Mottagare</p>
            <div className="flex gap-2 flex-wrap">
              {audiences.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAudience(a.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    audience === a.id
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message input */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Meddelande</p>
            <textarea
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              placeholder="Skriv ditt meddelande här..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || !messageText.trim() || !isActive}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition text-sm"
          >
            {sending ? 'Skickar...' : `📢 Skicka till ${audience === 'all' ? 'alla' : audiences.find(a => a.id === audience)?.label.toLowerCase()}`}
          </button>

          <p className="text-xs text-gray-400">
            💡 Meddelandet skickas via email. Push-notiser kommer i framtiden.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── ActionCard ────────────────────────────────────────── */

type StepStatus = 'todo' | 'active' | 'done' | 'locked';

const STEP_BADGE: Record<StepStatus, { icon: string; className: string } | null> = {
  todo: null,
  active: { icon: '👉', className: 'bg-indigo-100 text-indigo-600' },
  done: { icon: '✅', className: 'bg-green-100 text-green-600' },
  locked: { icon: '🔒', className: 'bg-gray-100 text-gray-500' },
};

function ActionCard({ href, title, description, icon, count, disabled, target, step }: {
  href: string; title: string; description: string; icon: string; count?: number; disabled?: boolean; target?: string; step?: StepStatus;
}) {
  const badge = step ? STEP_BADGE[step] : null;
  const isActive = step === 'active';

  if (disabled) {
    return (
      <div className="bg-gray-50 rounded-xl p-5 opacity-50 cursor-not-allowed">
        <div className="flex items-center gap-4">
          <div className="text-3xl shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
          {badge && (
            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm shrink-0 ${badge.className}`}>
              {badge.icon}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      target={target}
      className={`group block relative rounded-xl p-5 shadow-sm transition-all duration-150 ${
        isActive
          ? 'bg-white border-2 border-indigo-300 shadow-md animate-subtle-pulse'
          : step === 'done'
          ? 'bg-green-50/50 border border-green-200 hover:shadow-md'
          : 'bg-white border border-gray-100 hover:shadow-md hover:border-indigo-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="text-3xl shrink-0 group-hover:scale-110 transition-transform duration-150">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {count !== undefined && (
            <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-sm font-semibold">{count}</span>
          )}
          {badge && (
            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${badge.className}`}>
              {badge.icon}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes subtle-pulse {
          0%, 100% { box-shadow: 0 1px 3px rgba(99,102,241,0.1); }
          50% { box-shadow: 0 4px 14px rgba(99,102,241,0.25); }
        }
        .animate-subtle-pulse { animation: subtle-pulse 2s ease-in-out infinite; }
      `}</style>
    </Link>
  );
}

/* ── InviteLockedBanner ────────────────────────────────── */

function InviteLockedBanner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = useCallback(async () => {
    if (!confirm('Lås upp inbjudan? Matchningen kan behöva köras om om du ändrar gästlistan.')) return;
    setUnlocking(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/unlock-invite`, { method: 'POST' });
      if (!res.ok) { const data = await res.json(); alert(data.error || 'Kunde inte låsa upp'); return; }
      router.refresh();
    } catch { alert('Något gick fel'); }
    finally { setUnlocking(false); }
  }, [eventId, router]);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔒</span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">Inbjudan är låst</div>
          <div className="text-xs text-gray-500">Matchningen är klar. Lås upp för att ändra gästlistan.</div>
        </div>
      </div>
      <button onClick={handleUnlock} disabled={unlocking}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 transition disabled:opacity-50 shrink-0">
        {unlocking ? 'Låser upp…' : 'Lås upp'}
      </button>
    </div>
  );
}
