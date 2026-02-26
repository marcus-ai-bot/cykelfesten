'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface EventData {
  id: string;
  name: string;
  event_date: string;
  afterparty_time: string | null;
  afterparty_location: string | null;
  afterparty_description: string | null;
  dessert_time: string;
  time_offset_minutes: number;
}

export default function AfterpartyPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [countdown, setCountdown] = useState<string>('');
  
  const supabase = createClient();
  
  useEffect(() => {
    loadEvent();
  }, [slug]);
  
  useEffect(() => {
    if (!event) return;
    
    const checkUnlock = () => {
      const eventDate = new Date(event.event_date);
      const dessertTime = event.dessert_time.split(':').map(Number);
      eventDate.setHours(dessertTime[0], dessertTime[1] + (event.time_offset_minutes || 0), 0, 0);
      
      // Unlock 1 hour after dessert time
      const unlockTime = new Date(eventDate.getTime() + 60 * 60 * 1000);
      const now = new Date();
      
      if (now >= unlockTime) {
        setIsUnlocked(true);
        setCountdown('');
      } else {
        setIsUnlocked(false);
        const diff = unlockTime.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setCountdown(`${hours}h ${minutes}min`);
      }
    };
    
    checkUnlock();
    const interval = setInterval(checkUnlock, 60000);
    return () => clearInterval(interval);
  }, [event]);
  
  async function loadEvent() {
    const { data } = await supabase
      .from('events_public')
      .select('*')
      .eq('slug', slug)
      .single();
    
    setEvent(data);
    setLoading(false);
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-purple-200">Laddar...</div>
      </div>
    );
  }
  
  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-red-300">Event hittades inte</div>
      </div>
    );
  }
  
  // Format afterparty time
  const afterpartyTime = event.afterparty_time 
    ? event.afterparty_time.slice(0, 5) 
    : '22:00';
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-900 to-indigo-900 py-12 relative overflow-hidden">
      {/* Stars background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: Math.random() * 0.7 + 0.3,
            }}
          />
        ))}
      </div>
      
      <div className="max-w-md mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Efterfest!
          </h1>
          <p className="text-purple-200">{event.name}</p>
        </div>
        
        {!isUnlocked ? (
          // Locked state
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Inte än!
            </h2>
            <p className="text-purple-200 mb-4">
              Efterfest-info låses upp efter efterrätten.
            </p>
            {countdown && (
              <div className="text-3xl font-bold text-purple-300">
                ⏰ {countdown}
              </div>
            )}
          </div>
        ) : (
          // Unlocked state
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🥳</div>
              <h2 className="text-2xl font-bold text-white">
                Dags att festa!
              </h2>
            </div>
            
            <div className="space-y-4">
              {/* Time */}
              <div className="bg-white/10 rounded-xl p-4">
                <div className="text-purple-300 text-sm mb-1">Tid</div>
                <div className="text-xl font-semibold text-white">
                  🕐 {afterpartyTime}
                </div>
              </div>
              
              {/* Location */}
              {event.afterparty_location && (
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="text-purple-300 text-sm mb-1">Plats</div>
                  <div className="text-xl font-semibold text-white">
                    📍 {event.afterparty_location}
                  </div>
                </div>
              )}
              
              {/* Description */}
              {event.afterparty_description && (
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="text-purple-300 text-sm mb-1">Info</div>
                  <div className="text-white">
                    {event.afterparty_description}
                  </div>
                </div>
              )}
              
              {/* Map link */}
              {event.afterparty_location && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.afterparty_location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 bg-purple-500 hover:bg-purple-400 text-white text-center rounded-xl font-medium transition-colors"
                >
                  🗺️ Öppna i kartan
                </a>
              )}
            </div>
            
            <div className="mt-8 text-center text-purple-300 text-sm">
              ✨ Tack för en fantastisk kväll! ✨
            </div>
          </div>
        )}
        
        {/* Back link */}
        <div className="mt-8 text-center">
          <Link 
            href={`/e/${slug}/my`}
            className="text-purple-300 hover:text-white text-sm"
          >
            ← Tillbaka till mina kuvert
          </Link>
        </div>
      </div>
    </main>
  );
}
