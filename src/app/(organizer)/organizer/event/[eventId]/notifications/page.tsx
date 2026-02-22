'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';

export default function NotificationsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [emailLog, setEmailLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [reminderTime, setReminderTime] = useState('08:00');
  const [message, setMessage] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/notifications`);
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        setStats(data.stats);
        setEmailLog(data.emailLog);
        setOrganizerEmail(data.event.organizer_email || '');
        setReminderTime(data.event.wrap_reminder_time || '08:00');
      }
    } catch {}
    finally { setLoading(false); }
  }

  async function saveSettings() {
    setSaving(true);
    await fetch(`/api/organizer/events/${eventId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizer_email: organizerEmail || null, wrap_reminder_time: reminderTime }),
    });
    await loadData();
    setSaving(false);
    setMessage('✅ Sparat!');
    setTimeout(() => setMessage(''), 3000);
  }

  async function sendOrganizerReminder() {
    setSending(true);
    const res = await fetch('/api/notify/organizer-reminder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, force: true }),
    });
    const data = await res.json();
    setMessage(data.success ? '✅ Påminnelse skickad!' : `❌ ${data.error}`);
    await loadData();
    setSending(false);
  }

  async function approveWraps() {
    if (!confirm('Godkänn wraps för utskick?')) return;
    setSending(true);
    const res = await fetch('/api/admin/approve-wraps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, approvedBy: 'organizer' }),
    });
    const data = await res.json();
    if (data.success) await loadData();
    else setMessage(`❌ ${data.error}`);
    setSending(false);
  }

  async function sendWraps() {
    if (!confirm('Skicka wraps till ALLA deltagare? Kan inte ångras.')) return;
    setSending(true);
    const res = await fetch('/api/notify/send-wraps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
    const data = await res.json();
    setMessage(data.success ? `✅ ${data.results.sent} mail skickade!` : `❌ ${data.error}`);
    await loadData();
    setSending(false);
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Laddar...</p></div>;
  if (!event) return <div className="min-h-screen bg-gray-50 p-8"><p className="text-red-500">Event hittades inte</p></div>;

  const isApproved = !!event.wrap_approved_at;
  const isSent = !!event.wraps_sent_at;

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="📧 Notifikationer" parentView="after" />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">📧 Notifikationer</h1>
        <p className="text-gray-500 mb-6">Hantera wrap-utskick och se statistik</p>

        {message && <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">{message}</div>}

        {/* Status */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Status</h2>
          <div className="flex gap-4">
            <div className={`flex-1 p-4 rounded-lg ${isApproved ? 'bg-green-50' : 'bg-amber-50'}`}>
              <div className="text-2xl mb-1">{isApproved ? '✅' : '⏳'}</div>
              <div className="font-medium">{isApproved ? 'Godkänt' : 'Väntar på godkännande'}</div>
              {isApproved && <div className="text-sm text-gray-500">{new Date(event.wrap_approved_at).toLocaleString('sv-SE')}</div>}
            </div>
            <div className={`flex-1 p-4 rounded-lg ${isSent ? 'bg-green-50' : 'bg-gray-50'}`}>
              <div className="text-2xl mb-1">{isSent ? '📨' : '📭'}</div>
              <div className="font-medium">{isSent ? 'Wraps skickade' : 'Ej skickade'}</div>
              {isSent && <div className="text-sm text-gray-500">{new Date(event.wraps_sent_at).toLocaleString('sv-SE')}</div>}
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">⚙️ Inställningar</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Arrangörens email</label>
              <input type="email" value={organizerEmail} onChange={(e) => setOrganizerEmail(e.target.value)}
                placeholder="arrangör@example.com" className="w-full border rounded-lg px-4 py-2" />
              <p className="text-sm text-gray-500 mt-1">Hit skickas påminnelser</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Påminnelsetid</label>
              <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="border rounded-lg px-4 py-2" />
            </div>
            <button onClick={saveSettings} disabled={saving}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">🚀 Åtgärder</h2>
          <div className="space-y-4">
            <ActionStep step="1️⃣" title="Skicka påminnelse till arrangör" desc="Påminn om fun facts och granska wraps"
              button="Skicka" onClick={sendOrganizerReminder} disabled={sending || !organizerEmail} />
            <ActionStep step="2️⃣" title="Godkänn wraps" desc="Bekräfta att allt är redo för utskick"
              button={isApproved ? '✓ Godkänt' : 'Godkänn'} onClick={approveWraps} disabled={sending || isApproved}
              buttonClass={isApproved ? 'bg-green-100 text-green-800' : 'bg-green-600 text-white hover:bg-green-700'} />
            <ActionStep step="3️⃣" title="Skicka wraps till deltagare" desc="Personliga wrap-länkar till alla gäster"
              button={isSent ? '✓ Skickade' : 'Skicka wraps'} onClick={sendWraps} disabled={sending || !isApproved || isSent}
              buttonClass={isSent ? 'bg-green-100 text-green-800' : 'bg-purple-600 text-white hover:bg-purple-700'} />
          </div>
        </div>

        {/* Tracking */}
        {stats && stats.total_opens > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📊 Öppningsstatistik</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-3xl font-bold text-indigo-600">{stats.total_opens}</div>
                <div className="text-sm text-gray-500">Öppningar</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{stats.unique_people}</div>
                <div className="text-sm text-gray-500">Unika</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">{stats.total_opens > 0 ? (stats.total_opens / stats.unique_people).toFixed(1) : 0}</div>
                <div className="text-sm text-gray-500">Per person</div>
              </div>
            </div>
          </div>
        )}

        {/* Email Log */}
        {emailLog.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">📋 Maillogg</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left p-2">Typ</th><th className="text-left p-2">Mottagare</th><th className="text-left p-2">Skickat</th><th className="text-left p-2">Status</th></tr></thead>
                <tbody>
                  {emailLog.map((e: any) => (
                    <tr key={e.id} className="border-b">
                      <td className="p-2">{e.email_type === 'organizer_reminder' ? '📢 Påminnelse' : '🎁 Wrap'}</td>
                      <td className="p-2">{e.recipient_email}</td>
                      <td className="p-2">{new Date(e.sent_at).toLocaleString('sv-SE')}</td>
                      <td className="p-2"><span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ActionStep({ step, title, desc, button, onClick, disabled, buttonClass }: {
  step: string; title: string; desc: string; button: string;
  onClick: () => void; disabled: boolean; buttonClass?: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <div className="text-2xl">{step}</div>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-gray-500">{desc}</div>
      </div>
      <button onClick={onClick} disabled={disabled}
        className={`px-4 py-2 rounded-lg disabled:opacity-50 ${buttonClass || 'bg-blue-600 text-white hover:bg-blue-700'}`}>
        {button}
      </button>
    </div>
  );
}
