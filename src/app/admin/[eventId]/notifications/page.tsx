'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Event {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  organizer_email: string | null;
  wrap_reminder_time: string;
  wrap_approved_at: string | null;
  wrap_approved_by: string | null;
  wraps_sent_at: string | null;
  thank_you_message: string | null;
}

interface TrackingStats {
  total_opens: number;
  unique_people: number;
  by_person: { person_type: string; count: number }[];
}

interface EmailLogEntry {
  id: string;
  email_type: string;
  recipient_email: string;
  sent_at: string;
  status: string;
}

export default function NotificationsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  
  const [event, setEvent] = useState<Event | null>(null);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [reminderTime, setReminderTime] = useState('08:00');
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [eventId]);
  
  async function loadData() {
    // Load event
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventData) {
      setEvent(eventData);
      setOrganizerEmail(eventData.organizer_email || '');
      setReminderTime(eventData.wrap_reminder_time || '08:00');
    }
    
    // Load tracking stats
    const { data: opens } = await supabase
      .from('wrap_link_opens')
      .select('person_type')
      .eq('couple_id', eventId); // This needs to be fixed - should join through couples
    
    // For now, get all opens for couples in this event
    const { data: couples } = await supabase
      .from('couples')
      .select('id')
      .eq('event_id', eventId);
    
    if (couples) {
      const coupleIds = couples.map(c => c.id);
      const { data: opensData } = await supabase
        .from('wrap_link_opens')
        .select('*')
        .in('couple_id', coupleIds);
      
      if (opensData) {
        const uniquePeople = new Set(opensData.map(o => `${o.couple_id}-${o.person_type}`));
        const byPerson = [
          { person_type: 'invited', count: opensData.filter(o => o.person_type === 'invited').length },
          { person_type: 'partner', count: opensData.filter(o => o.person_type === 'partner').length },
        ];
        setStats({
          total_opens: opensData.length,
          unique_people: uniquePeople.size,
          by_person: byPerson,
        });
      }
    }
    
    // Load email log
    const { data: logData } = await supabase
      .from('email_log')
      .select('*')
      .eq('event_id', eventId)
      .order('sent_at', { ascending: false })
      .limit(50);
    
    if (logData) {
      setEmailLog(logData);
    }
    
    setLoading(false);
  }
  
  async function saveSettings() {
    setSaving(true);
    
    await supabase
      .from('events')
      .update({
        organizer_email: organizerEmail || null,
        wrap_reminder_time: reminderTime,
      })
      .eq('id', eventId);
    
    await loadData();
    setSaving(false);
  }
  
  async function sendOrganizerReminder() {
    setSending(true);
    
    const res = await fetch('/api/notify/organizer-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, force: true }),
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert('Påminnelse skickad!');
      await loadData();
    } else {
      alert(`Fel: ${data.error}`);
    }
    
    setSending(false);
  }
  
  async function approveWraps() {
    if (!confirm('Är du säker? Detta godkänner wraps för utskick.')) return;
    
    setSending(true);
    
    const res = await fetch('/api/admin/approve-wraps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, approvedBy: 'admin' }),
    });
    
    const data = await res.json();
    
    if (data.success) {
      await loadData();
    } else {
      alert(`Fel: ${data.error}`);
    }
    
    setSending(false);
  }
  
  async function sendWrapsToParticipants() {
    if (!confirm('Skicka wraps till ALLA deltagare? Detta kan inte ångras.')) return;
    
    setSending(true);
    
    const res = await fetch('/api/notify/send-wraps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert(`Klart! ${data.results.sent} mail skickade, ${data.results.failed} misslyckades.`);
      await loadData();
    } else {
      alert(`Fel: ${data.error}`);
    }
    
    setSending(false);
  }
  
  if (loading) {
    return <div className="p-8">Laddar...</div>;
  }
  
  if (!event) {
    return <div className="p-8">Event hittades inte</div>;
  }
  
  const isApproved = !!event.wrap_approved_at;
  const isSent = !!event.wraps_sent_at;
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/admin/${eventId}`} className="text-indigo-600 hover:underline">
            ← Tillbaka till {event.name}
          </Link>
          <h1 className="text-3xl font-bold mt-4">📧 Notifikationer</h1>
          <p className="text-gray-600">Hantera wrap-utskick och se statistik</p>
        </div>
        
        {/* Status Overview */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Status</h2>
          <div className="flex gap-4">
            <div className={`flex-1 p-4 rounded-lg ${isApproved ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <div className="text-2xl mb-1">{isApproved ? '✅' : '⏳'}</div>
              <div className="font-medium">{isApproved ? 'Godkänt' : 'Väntar på godkännande'}</div>
              {isApproved && (
                <div className="text-sm text-gray-600">
                  {new Date(event.wrap_approved_at!).toLocaleString('sv-SE')}
                </div>
              )}
            </div>
            <div className={`flex-1 p-4 rounded-lg ${isSent ? 'bg-green-100' : 'bg-gray-100'}`}>
              <div className="text-2xl mb-1">{isSent ? '📨' : '📭'}</div>
              <div className="font-medium">{isSent ? 'Wraps skickade' : 'Ej skickade'}</div>
              {isSent && (
                <div className="text-sm text-gray-600">
                  {new Date(event.wraps_sent_at!).toLocaleString('sv-SE')}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Settings */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">⚙️ Inställningar</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Arrangörens email</label>
              <input
                type="email"
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
                placeholder="arrangör@example.com"
                className="w-full border rounded-lg px-4 py-2"
              />
              <p className="text-sm text-gray-500 mt-1">
                Hit skickas påminnelser om fun facts och wrap-godkännande
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Påminnelsetid (dagen efter eventet)</label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="border rounded-lg px-4 py-2"
              />
            </div>
            
            <button
              onClick={saveSettings}
              disabled={saving}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Sparar...' : 'Spara inställningar'}
            </button>
          </div>
        </div>
        
        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">🚀 Åtgärder</h2>
          
          <div className="space-y-4">
            {/* Step 1: Send organizer reminder */}
            <div className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="text-2xl">1️⃣</div>
              <div className="flex-1">
                <div className="font-medium">Skicka påminnelse till arrangör</div>
                <div className="text-sm text-gray-600">
                  Påminn om att fylla i fun facts och granska wraps
                </div>
              </div>
              <button
                onClick={sendOrganizerReminder}
                disabled={sending || !organizerEmail}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Skicka
              </button>
            </div>
            
            {/* Step 2: Approve wraps */}
            <div className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="text-2xl">2️⃣</div>
              <div className="flex-1">
                <div className="font-medium">Godkänn wraps</div>
                <div className="text-sm text-gray-600">
                  Bekräfta att allt ser bra ut och är redo för utskick
                </div>
              </div>
              <button
                onClick={approveWraps}
                disabled={sending || isApproved}
                className={`px-4 py-2 rounded-lg ${
                  isApproved 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-green-600 text-white hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {isApproved ? '✓ Godkänt' : 'Godkänn'}
              </button>
            </div>
            
            {/* Step 3: Send to participants */}
            <div className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="text-2xl">3️⃣</div>
              <div className="flex-1">
                <div className="font-medium">Skicka wraps till deltagare</div>
                <div className="text-sm text-gray-600">
                  Skickar personliga wrap-länkar till alla gäster
                </div>
              </div>
              <button
                onClick={sendWrapsToParticipants}
                disabled={sending || !isApproved || isSent}
                className={`px-4 py-2 rounded-lg ${
                  isSent 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                } disabled:opacity-50`}
              >
                {isSent ? '✓ Skickade' : 'Skicka wraps'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Tracking Stats */}
        {stats && stats.total_opens > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">📊 Öppningsstatistik</h2>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-3xl font-bold text-indigo-600">{stats.total_opens}</div>
                <div className="text-sm text-gray-600">Totala öppningar</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{stats.unique_people}</div>
                <div className="text-sm text-gray-600">Unika personer</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">
                  {stats.total_opens > 0 ? (stats.total_opens / stats.unique_people).toFixed(1) : 0}
                </div>
                <div className="text-sm text-gray-600">Öppningar/person</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Email Log */}
        {emailLog.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">📋 Maillogg</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Typ</th>
                    <th className="text-left p-2">Mottagare</th>
                    <th className="text-left p-2">Skickat</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLog.map((entry) => (
                    <tr key={entry.id} className="border-b">
                      <td className="p-2">
                        {entry.email_type === 'organizer_reminder' ? '📢 Påminnelse' : '🎁 Wrap'}
                      </td>
                      <td className="p-2">{entry.recipient_email}</td>
                      <td className="p-2">
                        {new Date(entry.sent_at).toLocaleString('sv-SE')}
                      </td>
                      <td className="p-2">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
