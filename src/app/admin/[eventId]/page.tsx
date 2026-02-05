'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  person_count: number;
  address: string;
  course_preference: string | null;
  invited_allergies: string[] | null;
  partner_allergies: string[] | null;
}

interface Assignment {
  couple_id: string;
  course: string;
}

interface Pairing {
  course: string;
  host_couple_id: string;
  guest_couple_id: string;
}

interface MatchPlan {
  id: string;
  version: number;
  status: string;
  stats: {
    couples_matched: number;
    preference_satisfaction: number;
    capacity_utilization: number;
  } | null;
}

export default function EventAdminPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  
  const [event, setEvent] = useState<any>(null);
  const [couples, setCouples] = useState<Couple[]>([]);
  const [matchPlan, setMatchPlan] = useState<MatchPlan | null>(null);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'overview' | 'starter' | 'main' | 'dessert'>('overview');
  const [delaying, setDelaying] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  
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
    setEvent(eventData);
    
    // Load couples
    const { data: couplesData } = await supabase
      .from('couples')
      .select('*')
      .eq('event_id', eventId)
      .eq('cancelled', false)
      .order('invited_name');
    setCouples(couplesData || []);
    
    // Load latest match plan
    const { data: planData } = await supabase
      .from('match_plans')
      .select('*')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
      .limit(1)
      .single();
    setMatchPlan(planData);
    
    // Load pairings for latest plan
    if (planData) {
      const { data: pairingsData } = await supabase
        .from('course_pairings')
        .select('*')
        .eq('match_plan_id', planData.id);
      setPairings(pairingsData || []);
    }
    
    setLoading(false);
  }
  
  async function delayEnvelopes(minutes: number) {
    setDelaying(true);
    try {
      const res = await fetch('/api/admin/delay-envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, delay_minutes: minutes }),
      });
      if (res.ok) {
        await loadData();
        alert(`Kuverttider skjutna fram ${minutes} minuter!`);
      } else {
        alert('Kunde inte skjuta upp tider');
      }
    } finally {
      setDelaying(false);
    }
  }
  
  async function activateCourse(course: string) {
    if (!confirm(`Aktivera kuvert för ${course === 'starter' ? 'förrätt' : course === 'main' ? 'huvudrätt' : 'efterrätt'} nu?`)) return;
    
    setActivating(course);
    try {
      const res = await fetch('/api/admin/activate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, course }),
      });
      if (res.ok) {
        await loadData();
        alert('Kuvert aktiverade!');
      } else {
        alert('Kunde inte aktivera kuvert');
      }
    } finally {
      setActivating(null);
    }
  }
  
  if (loading) {
    return <div className="p-8 text-gray-500">Laddar...</div>;
  }
  
  if (!event) {
    return <div className="p-8 text-red-500">Event hittades inte</div>;
  }
  
  const coupleMap = new Map(couples.map(c => [c.id, c]));
  
  // Group pairings by course and host
  const courseData = ['starter', 'main', 'dessert'].map(course => {
    const coursePairings = pairings.filter(p => p.course === course);
    const hosts = [...new Set(coursePairings.map(p => p.host_couple_id))];
    
    return {
      course,
      label: course === 'starter' ? '🥗 Förrätt' : course === 'main' ? '🍖 Huvudrätt' : '🍰 Efterrätt',
      hosts: hosts.map(hostId => ({
        host: coupleMap.get(hostId),
        guests: coursePairings
          .filter(p => p.host_couple_id === hostId)
          .map(p => coupleMap.get(p.guest_couple_id))
          .filter(Boolean) as Couple[],
      })),
    };
  });
  
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="text-amber-500 hover:text-amber-600 text-sm mb-2 inline-block">
            ← Tillbaka till admin
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
          <p className="text-gray-500">
            {new Date(event.event_date).toLocaleDateString('sv-SE')} • {couples.length} par
          </p>
        </div>
        
        {/* Stats */}
        {matchPlan?.stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow text-center">
              <div className="text-3xl font-bold text-amber-500">{matchPlan.stats.couples_matched}</div>
              <div className="text-gray-500 text-sm">Par matchade</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow text-center">
              <div className="text-3xl font-bold text-green-500">
                {Math.round(matchPlan.stats.preference_satisfaction * 100)}%
              </div>
              <div className="text-gray-500 text-sm">Preferenser</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow text-center">
              <div className="text-3xl font-bold text-blue-500">v{matchPlan.version}</div>
              <div className="text-gray-500 text-sm">Match Plan</div>
            </div>
          </div>
        )}
        
        {/* Envelope Controls */}
        <div className="bg-white rounded-xl p-6 shadow mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">⏰ Kuvertkontroller</h2>
          
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-500 mb-2">Skjut upp återstående kuvert</div>
              <div className="flex gap-2">
                {[15, 30, 45].map(minutes => (
                  <button
                    key={minutes}
                    onClick={() => delayEnvelopes(minutes)}
                    disabled={delaying}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                  >
                    +{minutes} min
                  </button>
                ))}
              </div>
            </div>
            
            <div className="border-l pl-4">
              <div className="text-sm text-gray-500 mb-2">Aktivera kuvert manuellt</div>
              <div className="flex gap-2">
                {[
                  { course: 'starter', label: '🥗 Förrätt' },
                  { course: 'main', label: '🍖 Huvudrätt' },
                  { course: 'dessert', label: '🍰 Efterrätt' },
                ].map(({ course, label }) => (
                  <button
                    key={course}
                    onClick={() => activateCourse(course)}
                    disabled={!!activating}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                  >
                    {activating === course ? '...' : label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {event.time_offset_minutes > 0 && (
            <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              ⚠️ Tiderna är skjutna fram <strong>{event.time_offset_minutes} minuter</strong>
            </div>
          )}
        </div>
        
        {/* View tabs */}
        <div className="flex gap-2 mb-6">
          {['overview', 'starter', 'main', 'dessert'].map(v => (
            <button
              key={v}
              onClick={() => setView(v as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                view === v 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {v === 'overview' ? '📊 Översikt' : 
               v === 'starter' ? '🥗 Förrätt' : 
               v === 'main' ? '🍖 Huvudrätt' : '🍰 Efterrätt'}
            </button>
          ))}
        </div>
        
        {/* Overview */}
        {view === 'overview' && (
          <div className="space-y-6">
            {courseData.map(({ course, label, hosts }) => (
              <div key={course} className="bg-white rounded-xl p-6 shadow">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">{label}</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {hosts.map(({ host, guests }) => host && (
                    <div key={host.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="font-medium text-gray-900 mb-2">
                        🏠 {host.invited_name}
                        {host.partner_name && ` & ${host.partner_name}`}
                      </div>
                      <div className="text-sm text-gray-500 mb-3">{host.address}</div>
                      <div className="space-y-1">
                        {guests.map(guest => (
                          <div key={guest.id} className="text-sm text-gray-700 flex items-center gap-2">
                            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                            {guest.invited_name}
                            {guest.partner_name && ` & ${guest.partner_name}`}
                            <span className="text-gray-400">({guest.person_count}p)</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t text-xs text-gray-400">
                        {guests.reduce((sum, g) => sum + g.person_count, 0)} gäster
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Course detail view */}
        {view !== 'overview' && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Värd</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Adress</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Gäster</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Allergier</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {courseData.find(c => c.course === view)?.hosts.map(({ host, guests }) => host && (
                  <tr key={host.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">
                        {host.invited_name}
                        {host.partner_name && ` & ${host.partner_name}`}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{host.address}</td>
                    <td className="px-4 py-4">
                      {guests.map(g => (
                        <div key={g.id} className="text-sm">
                          {g.invited_name}{g.partner_name && ` & ${g.partner_name}`}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {guests.flatMap(g => [
                        ...(g.invited_allergies || []).map(a => `${g.invited_name}: ${a}`),
                        ...(g.partner_allergies || []).map(a => `${g.partner_name}: ${a}`),
                      ]).map((allergy, i) => (
                        <div key={i} className="text-orange-600">{allergy}</div>
                      ))}
                      {guests.every(g => !g.invited_allergies?.length && !g.partner_allergies?.length) && (
                        <span className="text-gray-400">Inga</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
