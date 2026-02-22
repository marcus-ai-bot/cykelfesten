'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function SettingsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [delaying, setDelaying] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [sendingNotifications, setSendingNotifications] = useState(false);

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/settings`);
      const data = await res.json();
      if (res.ok) setEvent(data.event);
      else setError(data.error || 'Kunde inte ladda');
    } catch { setError('Nätverksfel'); }
    finally { setLoading(false); }
  }

  async function saveSettings(updates: Record<string, any>) {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        // Recalc envelope times if course times changed
        const timeFields = ['starter_time', 'main_time', 'dessert_time'];
        if (timeFields.some(f => f in updates)) {
          await fetch('/api/admin/recalc-envelope-times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId }),
          });
          setSuccess('Tider + kuvert uppdaterade!');
        } else {
          setSuccess('Sparat!');
        }
        setTimeout(() => setSuccess(''), 2000);
      }
      else setError(data.error || 'Kunde inte spara');
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  async function adjustEnvelopeTimes(minutes: number) {
    setDelaying(true);
    try {
      const res = await fetch('/api/admin/delay-envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, delay_minutes: minutes }),
      });
      if (res.ok) {
        await loadData();
        const direction = minutes > 0 ? 'fram' : 'tillbaka';
        setSuccess(`Kuverttider skjutna ${direction} ${Math.abs(minutes)} min`);
        setTimeout(() => setSuccess(''), 3000);
      } else setError('Kunde inte justera tider');
    } finally { setDelaying(false); }
  }

  async function activateCourse(course: string) {
    const label = course === 'starter' ? 'förrätt' : course === 'main' ? 'huvudrätt' : 'dessert';
    if (!confirm(`Aktivera kuvert för ${label} nu?`)) return;
    setActivating(course);
    try {
      const res = await fetch('/api/admin/activate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, course }),
      });
      if (res.ok) { await loadData(); setSuccess('Kuvert aktiverade!'); setTimeout(() => setSuccess(''), 3000); }
      else setError('Kunde inte aktivera');
    } finally { setActivating(null); }
  }

  async function sendNotifications(type: string) {
    const label = type === 'assignment' ? 'uppgiftsnotifieringar' : 'påminnelser';
    if (!confirm(`Skicka ${label} till alla par?`)) return;
    setSendingNotifications(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, notification_type: type }),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(`Skickat: ${data.summary.sent}, redan skickade: ${data.summary.already_sent}`); setTimeout(() => setSuccess(''), 5000); }
      else setError('Kunde inte skicka: ' + (data.error || 'okänt fel'));
    } finally { setSendingNotifications(false); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Laddar...</p></div>;
  if (!event) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-red-500">{error}</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-500 hover:text-gray-700">← {event.name}</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">⚙️ Inställningar</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4">{success}</div>}

        {/* Event Info — no Status dropdown (use header dropdown instead) */}
        <Section title="📋 Eventinfo">
          <EditableField label="Namn" value={event.name} onSave={(v) => saveSettings({ name: v })} saving={saving} />
          <EditableField label="Datum" value={event.event_date} type="date" onSave={(v) => saveSettings({ event_date: v })} saving={saving} />
          <EditableField label="Stad" value={event.city || ''} onSave={(v) => saveSettings({ city: v })} saving={saving} />
          <EditableField label="Beskrivning" value={event.description || ''} onSave={(v) => saveSettings({ description: v })} saving={saving} />
        </Section>

        {/* Times with ±5 min adjustment */}
        <Section title="🕐 Tider">
          {[
            { label: 'Förrätt', icon: '🥗', field: 'starter_time', value: event.starter_time },
            { label: 'Huvudrätt', icon: '🍖', field: 'main_time', value: event.main_time },
            { label: 'Dessert', icon: '🍰', field: 'dessert_time', value: event.dessert_time },
          ].map(({ label, icon, field, value }) => {
            const time = value?.slice(0, 5) || '00:00';
            const adjustTime = (minutes: number) => {
              const [h, m] = time.split(':').map(Number);
              const total = h * 60 + m + minutes;
              const newH = Math.floor(((total % 1440) + 1440) % 1440 / 60);
              const newM = ((total % 60) + 60) % 60;
              const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
              saveSettings({ [field]: newTime + ':00' });
            };
            return (
              <div key={field} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-700">{icon} {label}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => adjustTime(-5)} disabled={saving}
                    className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-50 text-sm font-bold">−</button>
                  <button onClick={() => { const val = prompt(`Ny tid för ${label}:`, time); if (val) saveSettings({ [field]: val + ':00' }); }}
                    className="text-sm font-mono font-semibold text-gray-900 hover:text-indigo-600 cursor-pointer min-w-[3rem] text-center">
                    {time}
                  </button>
                  <button onClick={() => adjustTime(5)} disabled={saving}
                    className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 text-sm font-bold">+</button>
                </div>
              </div>
            );
          })}
        </Section>

        {/* Envelope Controls */}
        <Section title="✉️ Kuvertkontroller">
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">Justera kuverttider</p>
            <div className="flex gap-2 flex-wrap">
              {[-15, -5].map(min => (
                <button key={min} onClick={() => adjustEnvelopeTimes(min)} disabled={delaying}
                  className="px-4 py-2 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 disabled:opacity-50 text-sm">
                  {min} min
                </button>
              ))}
              {[5, 15, 30].map(min => (
                <button key={min} onClick={() => adjustEnvelopeTimes(min)} disabled={delaying}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm">
                  +{min} min
                </button>
              ))}
            </div>
          </div>
          {event.time_offset_minutes !== 0 && event.time_offset_minutes != null && (
            <div className={`text-sm p-3 rounded-lg mb-4 ${event.time_offset_minutes > 0 ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50'}`}>
              {event.time_offset_minutes > 0
                ? `⏩ Tiderna är skjutna fram ${event.time_offset_minutes} minuter`
                : `⏪ Tiderna är skjutna tillbaka ${Math.abs(event.time_offset_minutes)} minuter`}
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500 mb-2">Aktivera kuvert manuellt</p>
            <div className="flex gap-2">
              {[
                { course: 'starter', label: '🥗 Förrätt' },
                { course: 'main', label: '🍖 Huvudrätt' },
                { course: 'dessert', label: '🍰 Efterrätt' },
              ].map(({ course, label }) => (
                <button key={course} onClick={() => activateCourse(course)} disabled={!!activating}
                  className="px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 text-sm">
                  {activating === course ? '...' : label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Quick Links */}
        <Section title="🔗 Gästlänkar">
          <div className="flex flex-wrap gap-2">
            {[
              { href: `/e/${event.slug}`, label: '🌐 Event-sida' },
              { href: `/e/${event.slug}/live`, label: '📬 Levande kuvert' },
              { href: `/e/${event.slug}/host`, label: '🏠 Värd-vy' },
              { href: `/e/${event.slug}/party`, label: '🎉 Efterfest' },
            ].map(({ href, label }) => (
              <a key={href} href={href} target="_blank"
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                {label}
              </a>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function EditableField({ label, value, type = 'text', onSave, saving }: {
  label: string; value: string; type?: string; onSave: (v: string) => void; saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (!editing) {
    return (
      <div className="flex justify-between items-center py-2 border-b border-gray-50 group cursor-pointer" onClick={() => { setVal(value); setEditing(true); }}>
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm text-gray-900 group-hover:text-indigo-600">{value || '—'} <span className="text-gray-300 text-xs">✏️</span></span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50">
      <span className="text-sm text-gray-500 w-24 shrink-0">{label}</span>
      <input type={type} value={val} onChange={(e) => setVal(e.target.value)}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" autoFocus />
      <button onClick={() => { onSave(val); setEditing(false); }} disabled={saving}
        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs">Spara</button>
      <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs">Avbryt</button>
    </div>
  );
}
