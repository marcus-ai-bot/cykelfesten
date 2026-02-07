'use client';

/**
 * Admin Messages Editor
 * 
 * Edit custom messages for different envelope states:
 * - host_self_messages: When guest IS the host
 * - lips_sealed_messages: When no clue available (privacy)
 * - mystery_host_messages: When host has no fun facts
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Message {
  emoji: string;
  text: string;
}

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
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [eventId]);
  
  async function loadData() {
    setLoading(true);
    
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('name, host_self_messages, lips_sealed_messages, mystery_host_messages')
      .eq('id', eventId)
      .single();
    
    if (eventError) {
      setError(eventError.message);
    } else if (event) {
      setEventName(event.name);
      setMessages({
        host_self_messages: event.host_self_messages?.length ? event.host_self_messages : DEFAULT_MESSAGES.host_self_messages,
        lips_sealed_messages: event.lips_sealed_messages?.length ? event.lips_sealed_messages : DEFAULT_MESSAGES.lips_sealed_messages,
        mystery_host_messages: event.mystery_host_messages?.length ? event.mystery_host_messages : DEFAULT_MESSAGES.mystery_host_messages,
      });
    }
    
    setLoading(false);
  }
  
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    
    const { error: updateError } = await supabase
      .from('events')
      .update({
        host_self_messages: messages.host_self_messages,
        lips_sealed_messages: messages.lips_sealed_messages,
        mystery_host_messages: messages.mystery_host_messages,
      })
      .eq('id', eventId);
    
    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    
    setSaving(false);
  }
  
  function updateMessage(category: keyof MessagesData, index: number, field: 'emoji' | 'text', value: string) {
    setMessages(prev => ({
      ...prev,
      [category]: prev[category].map((msg, i) => 
        i === index ? { ...msg, [field]: value } : msg
      ),
    }));
  }
  
  function addMessage(category: keyof MessagesData) {
    setMessages(prev => ({
      ...prev,
      [category]: [...prev[category], { emoji: '✨', text: 'Nytt meddelande...' }],
    }));
  }
  
  function removeMessage(category: keyof MessagesData, index: number) {
    setMessages(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href={`/admin/${eventId}`}
            className="text-amber-600 hover:text-amber-700 text-sm mb-2 inline-block"
          >
            ← Tillbaka till admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            💬 Kuvert-meddelanden
          </h1>
          <p className="text-gray-600">{eventName}</p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            ✅ Sparat!
          </div>
        )}
        
        <div className="space-y-8">
          {/* Host Self Messages */}
          <MessageCategory
            title="👑 Du är värden!"
            description="Visas när gästen själv är värd för rätten"
            messages={messages.host_self_messages}
            category="host_self_messages"
            onUpdate={updateMessage}
            onAdd={addMessage}
            onRemove={removeMessage}
            color="amber"
          />
          
          {/* Lips Sealed Messages */}
          <MessageCategory
            title="🤫 Lips Sealed"
            description="Visas när vi inte kan avslöja fler ledtrådar (privacy)"
            messages={messages.lips_sealed_messages}
            category="lips_sealed_messages"
            onUpdate={updateMessage}
            onAdd={addMessage}
            onRemove={removeMessage}
            color="purple"
          />
          
          {/* Mystery Host Messages */}
          <MessageCategory
            title="🎭 Mystisk värd"
            description="Visas när värden inte har några fun facts"
            messages={messages.mystery_host_messages}
            category="mystery_host_messages"
            onUpdate={updateMessage}
            onAdd={addMessage}
            onRemove={removeMessage}
            color="indigo"
          />
          
          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            {saving ? 'Sparar...' : '💾 Spara meddelanden'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Message Category Component
function MessageCategory({
  title,
  description,
  messages,
  category,
  onUpdate,
  onAdd,
  onRemove,
  color,
}: {
  title: string;
  description: string;
  messages: Message[];
  category: keyof MessagesData;
  onUpdate: (category: keyof MessagesData, index: number, field: 'emoji' | 'text', value: string) => void;
  onAdd: (category: keyof MessagesData) => void;
  onRemove: (category: keyof MessagesData, index: number) => void;
  color: 'amber' | 'purple' | 'indigo';
}) {
  const colorClasses = {
    amber: 'bg-amber-50 border-amber-200',
    purple: 'bg-purple-50 border-purple-200',
    indigo: 'bg-indigo-50 border-indigo-200',
  };
  
  const buttonClasses = {
    amber: 'bg-amber-100 hover:bg-amber-200 text-amber-700',
    purple: 'bg-purple-100 hover:bg-purple-200 text-purple-700',
    indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700',
  };
  
  return (
    <div className={`rounded-xl p-6 border ${colorClasses[color]}`}>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">{title}</h2>
      <p className="text-sm text-gray-600 mb-4">{description}</p>
      
      <div className="space-y-3">
        {messages.map((msg, index) => (
          <div key={index} className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
            <input
              type="text"
              value={msg.emoji}
              onChange={(e) => onUpdate(category, index, 'emoji', e.target.value)}
              className="w-12 text-center text-xl p-1 border border-gray-200 rounded"
              placeholder="😀"
            />
            <textarea
              value={msg.text}
              onChange={(e) => onUpdate(category, index, 'text', e.target.value)}
              className="flex-1 p-2 border border-gray-200 rounded text-sm resize-none"
              rows={2}
              placeholder="Meddelande..."
            />
            <button
              onClick={() => onRemove(category, index)}
              className="text-red-400 hover:text-red-600 p-1"
              title="Ta bort"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      
      <button
        onClick={() => onAdd(category)}
        className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${buttonClasses[color]}`}
      >
        + Lägg till meddelande
      </button>
    </div>
  );
}
