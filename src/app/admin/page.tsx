'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/database';

export default function AdminPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  
  const supabase = createClient();
  
  useEffect(() => {
    loadEvents();
  }, []);
  
  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });
    
    setEvents((data as Event[]) || []);
    setLoading(false);
  }
  
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            🎛️ Admin
          </h1>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-4 py-2 rounded-lg"
          >
            + Skapa event
          </button>
        </div>
        
        {loading ? (
          <p className="text-gray-500">Laddar...</p>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-gray-500 mb-4">Inga events ännu</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-amber-500 hover:text-amber-600 font-medium"
            >
              Skapa ditt första event →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map(event => (
              <EventCard 
                key={event.id} 
                event={event} 
                onUpdate={loadEvents}
              />
            ))}
          </div>
        )}
        
        {showCreate && (
          <CreateEventModal 
            onClose={() => setShowCreate(false)}
            onCreate={loadEvents}
          />
        )}
      </div>
    </main>
  );
}

function EventCard({ event, onUpdate }: { event: Event; onUpdate: () => void }) {
  const [matching, setMatching] = useState(false);
  const [couplesCount, setCouplesCount] = useState<number | null>(null);
  const supabase = createClient();
  
  useEffect(() => {
    loadCouplesCount();
  }, []);
  
  async function loadCouplesCount() {
    const { count } = await supabase
      .from('couples')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('cancelled', false);
    
    setCouplesCount(count);
  }
  
  async function runMatching() {
    setMatching(true);
    try {
      const res = await fetch('/api/matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        alert(`Fel: ${data.error}\n${data.details || ''}`);
      } else {
        alert(`Matchning klar!\n\nPar matchade: ${data.stats.couples_matched}\nPreferenser: ${Math.round(data.stats.preference_satisfaction * 100)}%\nKuvert skapade: ${data.stats.envelopes_created}`);
        onUpdate();
      }
    } catch (err) {
      alert('Matchning misslyckades');
    } finally {
      setMatching(false);
    }
  }
  
  async function updateStatus(status: string) {
    await supabase
      .from('events')
      .update({ status })
      .eq('id', event.id);
    
    onUpdate();
  }
  
  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    open: 'bg-green-100 text-green-700',
    matched: 'bg-blue-100 text-blue-700',
    locked: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-orange-100 text-orange-700',
    completed: 'bg-gray-100 text-gray-600',
  };
  
  return (
    <div className="bg-white rounded-xl p-6 shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {event.name}
          </h2>
          <p className="text-gray-500">
            {new Date(event.event_date).toLocaleDateString('sv-SE')} • {event.slug}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[event.status] || statusColors.draft}`}>
          {event.status}
        </span>
      </div>
      
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-600">
        <span>👥 {couplesCount ?? '...'} par anmälda</span>
        <span>🕐 {event.starter_time} / {event.main_time} / {event.dessert_time}</span>
      </div>
      
      <div className="flex gap-2 flex-wrap">
        <a
          href={`/e/${event.slug}`}
          target="_blank"
          className="text-amber-500 hover:text-amber-600 text-sm font-medium"
        >
          Visa event →
        </a>
        
        <a
          href={`/admin/${event.id}`}
          className="text-blue-500 hover:text-blue-600 text-sm font-medium ml-4"
        >
          📊 Matchnings-vy
        </a>
        
        <a
          href={`/e/${event.slug}/my`}
          target="_blank"
          className="text-purple-500 hover:text-purple-600 text-sm font-medium ml-4"
        >
          ✉️ Kuvert-demo
        </a>
        
        {event.status === 'draft' && (
          <button
            onClick={() => updateStatus('open')}
            className="text-green-600 hover:text-green-700 text-sm font-medium ml-4"
          >
            Öppna anmälan
          </button>
        )}
        
        {event.status === 'open' && (couplesCount ?? 0) >= 3 && (
          <button
            onClick={runMatching}
            disabled={matching}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium px-3 py-1 rounded ml-4"
          >
            {matching ? 'Kör matchning...' : '🎯 Kör matchning'}
          </button>
        )}
        
        {event.status === 'matched' && (
          <button
            onClick={() => updateStatus('locked')}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-3 py-1 rounded ml-4"
          >
            🔒 Lås matchning
          </button>
        )}
      </div>
    </div>
  );
}

function CreateEventModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    event_date: '',
    starter_time: '17:30',
    main_time: '19:00',
    dessert_time: '20:30',
    afterparty_time: '22:00',
  });
  
  const supabase = createClient();
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      // Auto-generate slug from name
      ...(name === 'name' ? { slug: value.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') } : {}),
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase.from('events').insert({
        ...form,
        status: 'draft',
      });
      
      if (error) throw error;
      
      onCreate();
      onClose();
    } catch (err) {
      alert('Kunde inte skapa event');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Skapa nytt event
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Namn
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              placeholder="Grannskapsfesten 2026"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL-slug
            </label>
            <input
              type="text"
              name="slug"
              value={form.slug}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              placeholder="grannskapsfesten-2026"
            />
            <p className="text-xs text-gray-500 mt-1">
              cykelfesten.vercel.app/e/{form.slug || '...'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Datum
            </label>
            <input
              type="date"
              name="event_date"
              value={form.event_date}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Förrätt
              </label>
              <input
                type="time"
                name="starter_time"
                value={form.starter_time}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Huvudrätt
              </label>
              <input
                type="time"
                name="main_time"
                value={form.main_time}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Efterrätt
              </label>
              <input
                type="time"
                name="dessert_time"
                value={form.dessert_time}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Efterfest
              </label>
              <input
                type="time"
                name="afterparty_time"
                value={form.afterparty_time}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium px-4 py-2 rounded-lg"
            >
              {loading ? 'Skapar...' : 'Skapa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
