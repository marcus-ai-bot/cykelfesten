'use client';

/**
 * Admin Wrap Settings
 * 
 * - Calculate wrap stats from event data
 * - Manual inputs (last guest departure, etc.)
 * - Preview wraps
 * - Trigger email sends
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface WrapStats {
  // Calculated
  total_distance_km: number;
  total_couples: number;
  total_people: number;
  total_portions: number;
  shortest_ride_meters: number;
  shortest_ride_couple: string;
  longest_ride_meters: number;
  longest_ride_couple: string;
  age_youngest: number;
  age_oldest: number;
  districts_count: number;
  fun_facts_count: number;
  
  // Manual
  last_guest_departure: string | null;
  wrap1_sent_at: string | null;
  wrap2_sent_at: string | null;
}

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  fun_facts: string[] | null;
}

export default function AdminWrapPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [stats, setStats] = useState<WrapStats | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [lastDeparture, setLastDeparture] = useState('');
  const [message, setMessage] = useState('');
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [eventId]);
  
  async function loadData() {
    // Get event
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    setEvent(eventData);
    
    if (eventData?.wrap_stats) {
      setStats(eventData.wrap_stats);
      setLastDeparture(eventData.wrap_stats.last_guest_departure || '');
    }
    
    setLoading(false);
  }
  
  async function calculateStats() {
    setCalculating(true);
    setMessage('Beräknar statistik...');
    
    try {
      // Get all confirmed couples
      const { data: couples } = await supabase
        .from('couples')
        .select('*')
        .eq('event_id', eventId)
        .eq('confirmed', true);
      
      if (!couples || couples.length === 0) {
        setMessage('Inga bekräftade par hittades');
        setCalculating(false);
        return;
      }
      
      // Get envelopes for actual travel routes (host info via envelopes)
      const matchPlanId = event?.active_match_plan_id;
      if (!matchPlanId) {
        setMessage('Inget aktivt matchningsschema hittades');
        setCalculating(false);
        return;
      }
      
      const { data: envelopes } = await supabase
        .from('envelopes')
        .select('couple_id, course, host_couple_id, host:couples!envelopes_host_couple_id_fkey(coordinates)')
        .eq('match_plan_id', matchPlanId);
      
      const coupleById = new Map(couples.map(c => [c.id, c]));
      
      // Calculate distances per couple using actual coordinates
      const coupleDistances: Record<string, { distance: number; name: string }> = {};
      
      // Group envelopes by couple and course order
      const coupleRoutes: Record<string, { coords: { lat: number; lng: number }[]; name: string }> = {};
      const courseOrder: Record<string, number> = { starter: 0, main: 1, dessert: 2 };
      const sortedEnvelopes = (envelopes ?? []).slice().sort((a: any, b: any) =>
        (courseOrder[a.course] ?? 0) - (courseOrder[b.course] ?? 0)
      );
      
      sortedEnvelopes.forEach(e => {
        const coupleId = e.couple_id;
        const couple = coupleById.get(coupleId) as any;
        const host = (e as any).host as any;
        
        if (!coupleRoutes[coupleId]) {
          coupleRoutes[coupleId] = {
            coords: [],
            name: `${couple?.invited_name}${couple?.partner_name ? ' & ' + couple.partner_name : ''}`
          };
          // Start from couple's home
          if (couple?.coordinates) {
            coupleRoutes[coupleId].coords.push(couple.coordinates);
          }
        }
        
        // Add host location
        if (host?.coordinates) {
          coupleRoutes[coupleId].coords.push(host.coordinates);
        }
      });
      
      // Calculate total distance for each couple
      for (const [coupleId, route] of Object.entries(coupleRoutes)) {
        let totalDistance = 0;
        for (let i = 1; i < route.coords.length; i++) {
          const from = route.coords[i - 1];
          const to = route.coords[i];
          // Haversine distance
          const R = 6371000; // Earth radius in meters
          const dLat = (to.lat - from.lat) * Math.PI / 180;
          const dLng = (to.lng - from.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          totalDistance += R * c;
        }
        coupleDistances[coupleId] = { distance: totalDistance, name: route.name };
      }
      
      // Find shortest and longest
      const distances = Object.entries(coupleDistances);
      let shortest = { meters: Infinity, couple: '' };
      let longest = { meters: 0, couple: '' };
      let totalDistance = 0;
      
      distances.forEach(([_, { distance, name }]) => {
        totalDistance += distance;
        if (distance < shortest.meters && distance > 0) {
          shortest = { meters: distance, couple: name };
        }
        if (distance > longest.meters) {
          longest = { meters: distance, couple: name };
        }
      });
      
      // Count fun facts
      let funFactsCount = 0;
      couples.forEach(c => {
        if (c.fun_facts && Array.isArray(c.fun_facts)) {
          funFactsCount += c.fun_facts.length;
        }
      });
      
      // Calculate ages (if birth dates available)
      // For now, use placeholder
      const ageYoungest = 25;
      const ageOldest = 65;
      
      // Unique districts (from addresses)
      const districts = new Set<string>();
      couples.forEach(c => {
        if (c.address) {
          // Extract district from address (simplified)
          const parts = c.address.split(',');
          if (parts.length > 1) {
            districts.add(parts[parts.length - 1].trim());
          }
        }
      });
      
      const newStats: WrapStats = {
        total_distance_km: Math.round(totalDistance / 100) / 10, // meters to km, 1 decimal
        total_couples: couples.length,
        total_people: couples.reduce((sum, c) => sum + (c.partner_name ? 2 : 1), 0),
        total_portions: couples.length * 3 * 2, // 3 courses, 2 people avg
        shortest_ride_meters: Math.round(shortest.meters),
        shortest_ride_couple: shortest.couple,
        longest_ride_meters: Math.round(longest.meters),
        longest_ride_couple: longest.couple,
        age_youngest: ageYoungest,
        age_oldest: ageOldest,
        districts_count: districts.size || 3,
        fun_facts_count: funFactsCount,
        last_guest_departure: lastDeparture || null,
        wrap1_sent_at: stats?.wrap1_sent_at || null,
        wrap2_sent_at: stats?.wrap2_sent_at || null,
      };
      
      // Save to event
      const { error } = await supabase
        .from('events')
        .update({ wrap_stats: newStats })
        .eq('id', eventId);
      
      if (error) throw error;
      
      setStats(newStats);
      setMessage('✅ Statistik beräknad och sparad!');
    } catch (err: any) {
      setMessage(`❌ Fel: ${err.message}`);
    }
    
    setCalculating(false);
  }
  
  async function saveManualFields() {
    if (!stats) return;
    
    const updatedStats = {
      ...stats,
      last_guest_departure: lastDeparture || null,
    };
    
    const { error } = await supabase
      .from('events')
      .update({ wrap_stats: updatedStats })
      .eq('id', eventId);
    
    if (error) {
      setMessage(`❌ Fel: ${error.message}`);
    } else {
      setStats(updatedStats);
      setMessage('✅ Sparat!');
    }
  }
  
  async function sendWrap(wrapNumber: 1 | 2) {
    setMessage(`Skickar Wrap ${wrapNumber}...`);
    
    // TODO: Implement email sending via API
    // For now, just mark as sent
    
    const updatedStats = {
      ...stats,
      [`wrap${wrapNumber}_sent_at`]: new Date().toISOString(),
    };
    
    const { error } = await supabase
      .from('events')
      .update({ wrap_stats: updatedStats })
      .eq('id', eventId);
    
    if (error) {
      setMessage(`❌ Fel: ${error.message}`);
    } else {
      setStats(updatedStats as WrapStats);
      setMessage(`✅ Wrap ${wrapNumber} markerad som skickad!`);
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p>Laddar...</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href={`/admin/${eventId}`}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Tillbaka
          </Link>
          <h1 className="text-2xl font-bold">🎬 Wrap Admin</h1>
        </div>
        
        {/* Message */}
        {message && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            {message}
          </div>
        )}
        
        {/* Calculate Stats */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📊 Beräkna statistik</h2>
          <p className="text-gray-600 mb-4">
            Beräknar alla wrap-stats från eventdata (sträckor, personer, fun facts etc.)
          </p>
          <button
            onClick={calculateStats}
            disabled={calculating}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {calculating ? '⏳ Beräknar...' : '🔄 Beräkna stats'}
          </button>
        </div>
        
        {/* Stats Display */}
        {stats && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📈 Aktuell statistik</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Total sträcka" value={`${stats.total_distance_km} km`} />
              <StatCard label="Antal par" value={stats.total_couples} />
              <StatCard label="Antal personer" value={stats.total_people} />
              <StatCard label="Portioner" value={stats.total_portions} />
              <StatCard label="Kortaste cykling" value={`${stats.shortest_ride_meters}m`} sub={stats.shortest_ride_couple} />
              <StatCard label="Längsta cykling" value={`${stats.longest_ride_meters}m`} sub={stats.longest_ride_couple} />
              <StatCard label="Åldersspan" value={`${stats.age_youngest}-${stats.age_oldest} år`} />
              <StatCard label="Stadsdelar" value={stats.districts_count} />
              <StatCard label="Fun facts" value={stats.fun_facts_count} />
            </div>
          </div>
        )}
        
        {/* Manual Fields */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">✏️ Manuella fält</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sista gästen lämnade efterfesten
            </label>
            <input
              type="time"
              value={lastDeparture}
              onChange={(e) => setLastDeparture(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full max-w-xs"
              placeholder="02:47"
            />
            <p className="text-sm text-gray-500 mt-1">
              T.ex. "02:47" — visas som "Sista gästen lämnade 02:47"
            </p>
          </div>
          
          <button
            onClick={saveManualFields}
            className="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-900"
          >
            💾 Spara
          </button>
        </div>
        
        {/* Send Wraps */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📧 Skicka Wraps</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Wrap 1 */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">🎬 Wrap 1 — Statistik</h3>
              <p className="text-sm text-gray-600 mb-4">
                Personlig + kollektiv statistik. Skickas kl 09:00.
              </p>
              {stats?.wrap1_sent_at ? (
                <p className="text-green-600 text-sm">
                  ✅ Skickad {new Date(stats.wrap1_sent_at).toLocaleString('sv-SE')}
                </p>
              ) : (
                <button
                  onClick={() => sendWrap(1)}
                  disabled={!stats}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  📤 Skicka Wrap 1
                </button>
              )}
              <Link 
                href={`/e/demo/wrap?coupleId=b7f99fb9-f928-4574-87bf-7b61dafa1bc1`}
                target="_blank"
                className="block mt-2 text-blue-600 text-sm hover:underline"
              >
                👁️ Förhandsgranska →
              </Link>
            </div>
            
            {/* Wrap 2 */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">🏆 Wrap 2 — Award</h3>
              <p className="text-sm text-gray-600 mb-4">
                Personlig utmärkelse. Skickas kl 14:00/19:00.
              </p>
              {stats?.wrap2_sent_at ? (
                <p className="text-green-600 text-sm">
                  ✅ Skickad {new Date(stats.wrap2_sent_at).toLocaleString('sv-SE')}
                </p>
              ) : (
                <button
                  onClick={() => sendWrap(2)}
                  disabled={!stats}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm"
                >
                  📤 Skicka Wrap 2
                </button>
              )}
              <Link 
                href={`/e/demo/award?coupleId=b7f99fb9-f928-4574-87bf-7b61dafa1bc1`}
                target="_blank"
                className="block mt-2 text-orange-600 text-sm hover:underline"
              >
                👁️ Förhandsgranska →
              </Link>
            </div>
          </div>
        </div>
        
        {/* Music Preview */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">🎵 Musik per årtionde</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {['80s', '90s', '2000s', '2010s', '2020s', 'default'].map((decade) => (
              <div key={decade} className="border rounded-lg p-3">
                <p className="font-medium mb-2">{decade === 'default' ? '🎵 Standard' : `${decade.replace('s', '')}-tal`}</p>
                <audio controls className="w-full h-8">
                  <source src={`/music/${decade}.mp3`} type="audio/mpeg" />
                </audio>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
