'use client';

/**
 * Personal Wrap - Animated story like Spotify Wrapped
 * 
 * 4 slides with animations and optional music:
 * 1. "Din kväll" intro
 * 2. Distance cycled
 * 3. People met
 * 4. Thank you + share CTA
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface WrapData {
  couple_name: string;
  event_name: string;
  event_date: string;
  distance_km: number;
  people_met: number;
  dishes_eaten: number;
  hosts_visited: string[];
}

const SLIDE_DURATION = 4000; // 4 seconds per slide

export default function WrapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const coupleId = searchParams.get('coupleId');
  
  const [data, setData] = useState<WrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const supabase = createClient();
  
  const TOTAL_SLIDES = 4;
  
  useEffect(() => {
    loadData();
  }, [slug, coupleId]);
  
  // Auto-advance slides
  useEffect(() => {
    if (!isPlaying || !hasStarted) return;
    
    const timer = setTimeout(() => {
      if (currentSlide < TOTAL_SLIDES - 1) {
        setCurrentSlide(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, SLIDE_DURATION);
    
    return () => clearTimeout(timer);
  }, [currentSlide, isPlaying, hasStarted]);
  
  async function loadData() {
    if (!coupleId) {
      setLoading(false);
      return;
    }
    
    // Get couple and event
    const { data: couple } = await supabase
      .from('couples')
      .select('*, events(*)')
      .eq('id', coupleId)
      .single();
    
    if (!couple) {
      setLoading(false);
      return;
    }
    
    const event = couple.events as any;
    
    // Get envelopes for this couple
    const { data: envelopes } = await supabase
      .from('envelopes')
      .select('*, host_couple:couples!envelopes_host_couple_id_fkey(invited_name, partner_name)')
      .eq('couple_id', coupleId)
      .eq('match_plan_id', event.active_match_plan_id);
    
    // Get all couples for "people met"
    const { data: allCouples } = await supabase
      .from('couples')
      .select('id')
      .eq('event_id', event.id)
      .eq('confirmed', true);
    
    // Calculate stats
    const totalCyclingMin = envelopes?.reduce((sum, e) => sum + (e.cycling_minutes || 0), 0) || 0;
    const distanceKm = Math.round(totalCyclingMin * 0.25 * 10) / 10;
    const peopleMet = Math.max(0, ((allCouples?.length || 1) - 1) * 2);
    
    const hostNames = envelopes
      ?.filter(e => e.host_couple && e.couple_id !== e.host_couple_id)
      .map(e => {
        const host = e.host_couple as any;
        return `${host.invited_name}${host.partner_name ? ` & ${host.partner_name}` : ''}`;
      }) || [];
    
    setData({
      couple_name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
      event_name: event.name,
      event_date: event.event_date,
      distance_km: distanceKm,
      people_met: peopleMet,
      dishes_eaten: 3,
      hosts_visited: hostNames,
    });
    
    setLoading(false);
  }
  
  function startWrap() {
    setHasStarted(true);
    setIsPlaying(true);
    setCurrentSlide(0);
    // Try to play audio
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }
  
  function handleSlideClick() {
    if (currentSlide < TOTAL_SLIDES - 1) {
      setCurrentSlide(prev => prev + 1);
    }
  }
  
  async function shareToInstagram() {
    // Create share text
    const text = `🚴 Min Cykelfest-kväll:\n\n` +
      `📍 ${data?.distance_km} km cyklat\n` +
      `👥 ${data?.people_met} nya vänner\n` +
      `🍽️ ${data?.dishes_eaten} fantastiska rätter\n\n` +
      `Tack ${data?.event_name}! ✨\n\n` +
      `#Cykelfesten #DinnerSafari`;
    
    // Try native share
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Min Cykelfest-kväll',
          text,
          url: window.location.href,
        });
      } catch (e) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(text);
      alert('Kopierat till urklipp! 📋');
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-white">Laddar din wrap...</div>
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <p>Kunde inte ladda data 😕</p>
      </div>
    );
  }
  
  // Start screen
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-white"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-8xl mb-8"
          >
            ✨
          </motion.div>
          <h1 className="text-3xl font-bold mb-2">{data.couple_name}</h1>
          <p className="text-purple-200 mb-8">Din Cykelfest Wrapped</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startWrap}
            className="bg-white text-purple-900 font-bold py-4 px-10 rounded-full text-lg shadow-2xl"
          >
            ▶️ Starta
          </motion.button>
        </motion.div>
        
        {/* Preload audio */}
        <audio 
          ref={audioRef} 
          src="/wrap-music.mp3" 
          loop 
          preload="auto"
        />
      </div>
    );
  }
  
  // Main wrap experience
  return (
    <div 
      className="min-h-screen bg-black relative overflow-hidden cursor-pointer"
      onClick={handleSlideClick}
    >
      {/* Progress bar */}
      <div className="absolute top-4 left-4 right-4 z-50 flex gap-1">
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <div key={i} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-white"
              initial={{ width: '0%' }}
              animate={{ 
                width: i < currentSlide ? '100%' : i === currentSlide && isPlaying ? '100%' : '0%' 
              }}
              transition={{ 
                duration: i === currentSlide ? SLIDE_DURATION / 1000 : 0,
                ease: 'linear'
              }}
            />
          </div>
        ))}
      </div>
      
      <AnimatePresence mode="wait">
        {/* Slide 1: Intro */}
        {currentSlide === 0 && (
          <Slide key="slide-0" bg="from-violet-600 via-purple-600 to-fuchsia-600">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="text-center"
            >
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-purple-200 text-lg mb-4"
              >
                {new Date(data.event_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}
              </motion.p>
              <motion.h1 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="text-5xl font-bold mb-6"
              >
                Din kväll
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-xl text-purple-100"
              >
                {data.event_name}
              </motion.p>
            </motion.div>
          </Slide>
        )}
        
        {/* Slide 2: Distance */}
        {currentSlide === 1 && (
          <Slide key="slide-1" bg="from-cyan-500 via-blue-600 to-indigo-700">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="text-8xl mb-6"
              >
                🚴
              </motion.div>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-blue-200 text-lg mb-2"
              >
                Du cyklade
              </motion.p>
              <motion.p 
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="text-7xl font-black mb-2"
              >
                {data.distance_km}
              </motion.p>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-3xl font-bold"
              >
                kilometer
              </motion.p>
            </motion.div>
          </Slide>
        )}
        
        {/* Slide 3: People */}
        {currentSlide === 2 && (
          <Slide key="slide-2" bg="from-rose-500 via-pink-600 to-fuchsia-700">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="text-8xl mb-6"
              >
                👥
              </motion.div>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-pink-200 text-lg mb-2"
              >
                Du träffade
              </motion.p>
              <motion.p 
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="text-7xl font-black mb-2"
              >
                {data.people_met}
              </motion.p>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-3xl font-bold"
              >
                nya vänner
              </motion.p>
            </motion.div>
          </Slide>
        )}
        
        {/* Slide 4: Thank you + Share */}
        {currentSlide === 3 && (
          <Slide key="slide-3" bg="from-amber-500 via-orange-500 to-red-600">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="text-7xl mb-6"
              >
                ✨
              </motion.div>
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-4xl font-bold mb-4"
              >
                Tack för en magisk kväll!
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-orange-100 text-lg mb-8"
              >
                {data.couple_name}
              </motion.p>
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  shareToInstagram();
                }}
                className="bg-white text-orange-600 font-bold py-4 px-8 rounded-full text-lg shadow-xl"
              >
                📲 Dela på Instagram
              </motion.button>
            </motion.div>
          </Slide>
        )}
      </AnimatePresence>
      
      {/* Tap hint */}
      {currentSlide < TOTAL_SLIDES - 1 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm"
        >
          Tryck för nästa →
        </motion.p>
      )}
      
      {/* Audio element */}
      <audio ref={audioRef} src="/wrap-music.mp3" loop />
    </div>
  );
}

function Slide({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`min-h-screen bg-gradient-to-br ${bg} flex items-center justify-center p-8 text-white`}
    >
      {children}
    </motion.div>
  );
}
