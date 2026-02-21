'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

export default function MessagesEditorPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [messages, setMessages] = useState<MessagesData>(DEFAULT_MESSAGES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/messages`);
      const data = await res.json();
      if (res.ok) {
        setEventName(data.eventName);
        setMessages({
          host_self_messages: data.host_self_messages?.length ? data.host_self_messages : DEFAULT_MESSAGES.host_self_messages,
          lips_sealed_messages: data.lips_sealed_messages?.length ? data.lips_sealed_messages : DEFAULT_MESSAGES.lips_sealed_messages,
          mystery_host_messages: data.mystery_host_messages?.length ? data.mystery_host_messages : DEFAULT_MESSAGES.mystery_host_messages,
        });
      } else {
        setError(data.error || 'Kunde inte ladda');
      }
    } catch { setError('Nätverksfel'); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/messages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else { const d = await res.json(); setError(d.error || 'Kunde inte spara'); }
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

  if (loading) return <div className="min-h-screen bg-gray-50 p-8"><div className="max-w-3xl mx-auto animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3"></div><div className="h-64 bg-gray-200 rounded"></div></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href={`/organizer/event/${eventId}/settings`} className="text-indigo-600 hover:text-indigo-700 text-sm mb-2 inline-block">← Inställningar</Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">💬 Kuvertmeddelanden</h1>
            <span className="group relative">
              <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-500 text-xs cursor-help">?</span>
              <span className="absolute left-6 top-0 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                Kuvertmeddelanden är de texter som gästerna ser inuti sina digitala kuvert under kvällen. Här anpassar du tonen — roliga, mystiska eller personliga hälsningar beroende på situation.
              </span>
            </span>
          </div>
          <p className="text-gray-600">{eventName}</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
        {saved && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">✅ Sparat!</div>}

        <div className="space-y-8">
          <MessageCategory title="👑 Du är värden!" description="Visas när gästen själv är värd för rätten"
            messages={messages.host_self_messages} category="host_self_messages"
            onUpdate={updateMessage} onAdd={addMessage} onRemove={removeMessage} color="amber" />
          <MessageCategory title="🤫 Lips Sealed" description="Visas när vi inte kan avslöja fler ledtrådar"
            messages={messages.lips_sealed_messages} category="lips_sealed_messages"
            onUpdate={updateMessage} onAdd={addMessage} onRemove={removeMessage} color="purple" />
          <MessageCategory title="🎭 Mystisk värd" description="Visas när värden inte har fun facts"
            messages={messages.mystery_host_messages} category="mystery_host_messages"
            onUpdate={updateMessage} onAdd={addMessage} onRemove={removeMessage} color="indigo" />

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors">
            {saving ? 'Sparar...' : '💾 Spara meddelanden'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageCategory({ title, description, messages, category, onUpdate, onAdd, onRemove, color }: {
  title: string; description: string; messages: Message[]; category: keyof MessagesData;
  onUpdate: (c: keyof MessagesData, i: number, f: 'emoji' | 'text', v: string) => void;
  onAdd: (c: keyof MessagesData) => void; onRemove: (c: keyof MessagesData, i: number) => void;
  color: 'amber' | 'purple' | 'indigo';
}) {
  const bg = { amber: 'bg-amber-50 border-amber-200', purple: 'bg-purple-50 border-purple-200', indigo: 'bg-indigo-50 border-indigo-200' };
  const btn = { amber: 'bg-amber-100 hover:bg-amber-200 text-amber-700', purple: 'bg-purple-100 hover:bg-purple-200 text-purple-700', indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' };

  return (
    <div className={`rounded-xl p-6 border ${bg[color]}`}>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">{title}</h2>
      <p className="text-sm text-gray-600 mb-4">{description}</p>
      <div className="space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
            <input type="text" value={msg.emoji} onChange={(e) => onUpdate(category, i, 'emoji', e.target.value)} className="w-12 text-center text-xl p-1 border border-gray-200 rounded" />
            <textarea value={msg.text} onChange={(e) => onUpdate(category, i, 'text', e.target.value)} className="flex-1 p-2 border border-gray-200 rounded text-sm resize-none" rows={2} />
            <button onClick={() => onRemove(category, i)} className="text-red-400 hover:text-red-600 p-1">✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => onAdd(category)} className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${btn[color]}`}>+ Lägg till meddelande</button>
    </div>
  );
}
