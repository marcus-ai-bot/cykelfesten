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
      if (res.ok) { setEvent(data.event); setSuccess('Sparat!'); setTimeout(() => setSuccess(''), 2000); }
      else setError(data.error || 'Kunde inte spara');
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  async function delayEnvelopes(minutes: number) {
    setDelaying(true);
    try {
      const res = await fetch('/api/admin/delay-envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, delay_minutes: minutes }),
      });
      if (res.ok) { await loadData(); setSuccess(`Kuverttider skjutna fram ${minutes} min`); setTimeout(() => setSuccess(''), 3000); }
      else setError('Kunde inte skjuta upp tider');
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

        {/* Event Info */}
        <Section title="📋 Eventinfo">
          <EditableField label="Namn" value={event.name} onSave={(v) => saveSettings({ name: v })} saving={saving} />
          <EditableField label="Datum" value={event.event_date} type="date" onSave={(v) => saveSettings({ event_date: v })} saving={saving} />
          <EditableField label="Stad" value={event.city || ''} onSave={(v) => saveSettings({ city: v })} saving={saving} />
          <EditableField label="Beskrivning" value={event.description || ''} onSave={(v) => saveSettings({ description: v })} saving={saving} />
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Status</span>
            <select
              value={event.status}
              onChange={(e) => saveSettings({ status: e.target.value })}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="draft">📝 Utkast</option>
              <option value="open">🟢 Öppen</option>
              <option value="closed">🔴 Stängd</option>
              <option value="completed">✅ Avslutad</option>
            </select>
          </div>
        </Section>

        {/* Times */}
        <Section title="🕐 Tider">
          <EditableField label="Förrätt" value={event.starter_time?.slice(0, 5) || '17:30'} type="time" onSave={(v) => saveSettings({ starter_time: v + ':00' })} saving={saving} />
          <EditableField label="Huvudrätt" value={event.main_time?.slice(0, 5) || '19:00'} type="time" onSave={(v) => saveSettings({ main_time: v + ':00' })} saving={saving} />
          <EditableField label="Dessert" value={event.dessert_time?.slice(0, 5) || '20:30'} type="time" onSave={(v) => saveSettings({ dessert_time: v + ':00' })} saving={saving} />
        </Section>

        {/* Envelope Controls */}
        <Section title="✉️ Kuvertkontroller">
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">Skjut upp återstående kuvert</p>
            <div className="flex gap-2">
              {[15, 30, 45].map(min => (
                <button key={min} onClick={() => delayEnvelopes(min)} disabled={delaying}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm">
                  +{min} min
                </button>
              ))}
            </div>
          </div>
          {event.time_offset_minutes > 0 && (
            <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg mb-4">
              ⚠️ Tiderna är skjutna fram <strong>{event.time_offset_minutes} minuter</strong>
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

        {/* Notifications */}
        <Section title="📧 Notifieringar">
          <div className="space-y-3">
            <button onClick={() => sendNotifications('assignment')} disabled={sendingNotifications}
              className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 disabled:opacity-50 text-sm font-medium">
              📋 Skicka uppgifter (vilken rätt + adress)
            </button>
            <button onClick={() => sendNotifications('reminder')} disabled={sendingNotifications}
              className="w-full py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50 text-sm font-medium">
              ⏰ Skicka påminnelse
            </button>
          </div>
        </Section>

        {/* Advanced */}
        <Section title="🔧 Avancerat">
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: `/organizer/event/${eventId}/timing`, label: '⏱️ Timing-editor', desc: 'Kuvert-reveal tider' },
              { href: `/organizer/event/${eventId}/messages`, label: '💬 Meddelanden', desc: 'Kuvert-texter' },
              { href: `/organizer/event/${eventId}/awards`, label: '🏆 Awards', desc: 'Utmärkelser' },
              { href: `/organizer/event/${eventId}/wrap`, label: '🎬 Wrap', desc: 'Sammanfattning & mail' },
            ].map(({ href, label, desc }) => (
              <Link key={href} href={href}
                className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="font-medium text-sm text-gray-900">{label}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </Link>
            ))}
          </div>
        </Section>

        {/* Quick Links */}
        <Section title="🔗 Gästlänkar">
          <div className="flex flex-wrap gap-2">
            {[
              { href: `/e/${event.slug}`, label: '🌐 Event-sida' },
              { href: `/e/${event.slug}/my`, label: '📱 Kuvert-demo' },
              { href: `/e/${event.slug}/host`, label: '🏠 Värd-vy' },
              { href: `/e/${event.slug}/party`, label: '🎉 Efterfest' },
              { href: `/e/${event.slug}/memories`, label: '📸 Memories' },
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
