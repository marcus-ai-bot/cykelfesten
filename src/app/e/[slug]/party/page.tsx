'use client';

/**
 * Afterparty Page
 * 
 * Reveals X minutes before the afterparty starts.
 * Shows location, time, host info, and cycling times.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface AfterpartyData {
  event_name: string;
  afterparty_time: string;
  afterparty_location: string;
  afterparty_hosts: string;
  afterparty_door_code: string | null;
  afterparty_byob: boolean;
  afterparty_notes: string | null;
  reveals_at: Date;
  is_revealed: boolean;
  minutes_until_reveal: number;
}

export default function AfterpartyPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [data, setData] = useState<AfterpartyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
    // Update time every 10 seconds
    const interval = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(interval);
  }, [slug]);
  
  async function loadData() {
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (eventError || !event) {
      setError('Event hittades inte');
      setLoading(false);
      return;
    }
    
    // Calculate reveal time (30 min before afterparty)
    const afterpartyDateTime = new Date(`${event.event_date}T${event.afterparty_time || event.dessert_time}`);
    const revealTime = new Date(afterpartyDateTime.getTime() - 30 * 60 * 1000); // 30 min before
    const isRevealed = new Date() >= revealTime;
    const minutesUntil = Math.max(0, Math.floor((revealTime.getTime() - Date.now()) / 60000));
    
    setData({
      event_name: event.name,
      afterparty_time: event.afterparty_time || '21:00',
      afterparty_location: event.afterparty_location || 'TBA',
      afterparty_hosts: event.afterparty_hosts || '',
      afterparty_door_code: event.afterparty_door_code,
      afterparty_byob: event.afterparty_byob ?? true,
      afterparty_notes: event.afterparty_notes,
      reveals_at: revealTime,
      is_revealed: isRevealed,
      minutes_until_reveal: minutesUntil,
    });
    
    setLoading(false);
  }
  
  // Recalculate reveal status
  useEffect(() => {
    if (data) {
      const isRevealed = now >= data.reveals_at;
      const minutesUntil = Math.max(0, Math.floor((data.reveals_at.getTime() - now.getTime()) / 60000));
      if (isRevealed !== data.is_revealed || minutesUntil !== data.minutes_until_reveal) {
        setData({ ...data, is_revealed: isRevealed, minutes_until_reveal: minutesUntil });
      }
    }
  }, [now, data]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Laddar...</div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center text-white">
          <p className="text-xl mb-4">😕 {error}</p>
          <Link href="/" className="text-purple-400 underline">Tillbaka</Link>
        </div>
      </div>
    );
  }
  
  // Not yet revealed - show countdown
  if (!data.is_revealed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-white max-w-md"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-8xl mb-6"
          >
            🎉
          </motion.div>
          <h1 className="text-3xl font-bold mb-4">Efterfesten väntar...</h1>
          <p className="text-purple-200 mb-8">
            Platsen avslöjas om
          </p>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-6">
            <p className="text-5xl font-bold text-yellow-300">
              {data.minutes_until_reveal} min
            </p>
          </div>
          <p className="text-sm text-purple-300">
            Njut av desserten så länge! 🍰
          </p>
        </motion.div>
      </div>
    );
  }
  
  // Revealed - show full info
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-4">
      <div className="max-w-lg mx-auto pt-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="text-center text-white">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="text-6xl mb-4"
            >
              🎉
            </motion.div>
            <h1 className="text-3xl font-bold mb-2">Efterfesten!</h1>
            <p className="text-purple-200">{data.event_name}</p>
          </div>
          
          {/* Main info card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-6 shadow-2xl"
          >
            <div className="space-y-4">
              {/* Time */}
              <div className="flex items-center gap-3">
                <span className="text-3xl">⏰</span>
                <div>
                  <p className="text-sm text-gray-500">Tid</p>
                  <p className="text-2xl font-bold text-gray-900">{data.afterparty_time}</p>
                </div>
              </div>
              
              {/* Location */}
              <div className="flex items-center gap-3">
                <span className="text-3xl">📍</span>
                <div>
                  <p className="text-sm text-gray-500">Plats</p>
                  <p className="text-xl font-bold text-gray-900">{data.afterparty_location}</p>
                </div>
              </div>
              
              {/* Hosts */}
              {data.afterparty_hosts && (
                <div className="flex items-center gap-3">
                  <span className="text-3xl">👋</span>
                  <div>
                    <p className="text-sm text-gray-500">Värd</p>
                    <p className="text-lg font-semibold text-gray-900">{data.afterparty_hosts}</p>
                  </div>
                </div>
              )}
              
              {/* Door code */}
              {data.afterparty_door_code && (
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🔑</span>
                  <div>
                    <p className="text-sm text-gray-500">Portkod</p>
                    <p className="text-xl font-mono font-bold text-purple-600">{data.afterparty_door_code}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          
          {/* Practical info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/10 backdrop-blur rounded-xl p-4 text-white space-y-2"
          >
            <h3 className="font-semibold text-yellow-300">📝 Bra att veta</h3>
            {data.afterparty_byob && (
              <p className="text-sm flex items-center gap-2">
                <span>🍷</span> Ta med egen dryck
              </p>
            )}
            {data.afterparty_notes && (
              <p className="text-sm flex items-center gap-2">
                <span>💡</span> {data.afterparty_notes}
              </p>
            )}
          </motion.div>
          
          {/* Map button */}
          <motion.a
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            href={`https://maps.google.com/?q=${encodeURIComponent(data.afterparty_location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 px-6 rounded-xl text-center text-lg shadow-lg transition-colors"
          >
            🗺️ Öppna i kartan
          </motion.a>
          
          {/* Cycling times */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white/5 rounded-xl p-4"
          >
            <p className="text-white/60 text-sm text-center mb-3">🚴 Cykeltid (ungefär)</p>
            <div className="grid grid-cols-3 gap-2 text-center text-white">
              <div className="bg-white/10 rounded-lg p-2">
                <p className="text-xl">🏅</p>
                <p className="font-bold">5 min</p>
                <p className="text-xs text-white/60">Nykter</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2">
                <p className="text-xl">🍷</p>
                <p className="font-bold">8 min</p>
                <p className="text-xs text-white/60">Lagom</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2">
                <p className="text-xl">🥴</p>
                <p className="font-bold">15 min</p>
                <p className="text-xs text-white/60">Fest-läge</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
