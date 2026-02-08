'use client';

/**
 * Personal Wrap - Animated story like Spotify Wrapped
 * 
 * 10 slides with animations and decade-based music:
 * 1. "Din kväll" intro
 * 2. Collective distance (all participants)
 * 3. Your distance
 * 4. People met
 * 5. Fun fact: shortest ride
 * 6. Fun fact: longest ride
 * 7. Dishes served
 * 8. Last guest departed (if available)
 * 9. Award teaser
 * 10. Thank you + share CTA
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface WrapStats {
  total_distance_km: number;
  total_couples: number;
  total_people: number;
  total_portions: number;
  shortest_ride_meters: number;
  shortest_ride_couple: string;
  longest_ride_meters: number;
  longest_ride_couple: string;
  districts_count: number;
  fun_facts_count: number;
  last_guest_departure: string | null;
}

interface WrapData {
  couple_name: string;
  event_name: string;
  event_date: string;
  distance_km: number;
  people_met: number;
  music_decade: string;
  wrap_stats: WrapStats | null;
  has_award: boolean;
}

const SLIDE_DURATION = 4000; // 4 seconds per slide

// Map decade preferences to music files
function getMusicFile(funFacts: string[] | null): string {
  if (!funFacts) return '/music/default.mp3';
  
  const decadeKeywords: Record<string, string[]> = {
    '80s': ['80-tal', '80s', 'eighties', '1980'],
    '90s': ['90-tal', '90s', 'nineties', '1990'],
    '2000s': ['2000-tal', '2000s', 'nollnoll', '00-tal'],
    '2010s': ['2010-tal', '2010s', 'tio-tal'],
    '2020s': ['2020-tal', '2020s', 'tjugo-tal', 'nu', 'modern'],
  };
  
  const allFacts = funFacts.join(' ').toLowerCase();
  
  for (const [decade, keywords] of Object.entries(decadeKeywords)) {
    if (keywords.some(kw => allFacts.includes(kw))) {
      return `/music/${decade}.mp3`;
    }
  }
  
  return '/music/default.mp3';
}

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
  const [musicSrc, setMusicSrc] = useState('/music/default.mp3');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const supabase = createClient();
  
  // Dynamic slides based on available data
  const [slides, setSlides] = useState<React.ReactNode[]>([]);
  
  useEffect(() => {
    loadData();
  }, [slug, coupleId]);
  
  useEffect(() => {
    if (data) {
      buildSlides();
    }
  }, [data]);
  
  // Auto-advance slides
  useEffect(() => {
    if (!isPlaying || !hasStarted || slides.length === 0) return;
    
    const timer = setTimeout(() => {
      if (currentSlide < slides.length - 1) {
        setCurrentSlide(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, SLIDE_DURATION);
    
    return () => clearTimeout(timer);
  }, [currentSlide, isPlaying, hasStarted, slides.length]);
  
  async function loadData() {
    if (!coupleId) {
      setLoading(false);
      return;
    }
    
    // Get couple with fun_facts and event
    const { data: couple } = await supabase
      .from('couples')
      .select('*, invited_fun_facts, partner_fun_facts, events(*)')
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
      .select('*')
      .eq('couple_id', coupleId)
      .eq('match_plan_id', event.active_match_plan_id);
    
    // Get all couples for "people met"
    const { data: allCouples } = await supabase
      .from('couples')
      .select('id')
      .eq('event_id', event.id)
      .eq('confirmed', true);
    
    // Calculate personal stats
    const totalCyclingMin = envelopes?.reduce((sum, e) => sum + (e.cycling_minutes || 0), 0) || 0;
    const distanceKm = Math.round(totalCyclingMin * 0.25 * 10) / 10;
    const peopleMet = Math.max(0, ((allCouples?.length || 1) - 1) * 2);
    
    // Get music based on fun facts (combine invited + partner)
    const allFunFacts = [
      ...(couple.invited_fun_facts || []),
      ...(couple.partner_fun_facts || [])
    ];
    const music = getMusicFile(allFunFacts.length > 0 ? allFunFacts : null);
    setMusicSrc(music);
    
    // Check if couple has an award (column might not exist yet)
    const hasAward = !!(couple as any).award_type;
    
    setData({
      couple_name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
      event_name: event.name,
      event_date: event.event_date,
      distance_km: distanceKm,
      people_met: peopleMet,
      music_decade: music.includes('80s') ? '80-tal' : 
                    music.includes('90s') ? '90-tal' :
                    music.includes('2000s') ? '2000-tal' :
                    music.includes('2010s') ? '2010-tal' :
                    music.includes('2020s') ? '2020-tal' : 'festlig',
      wrap_stats: (event as any).wrap_stats || null,
      has_award: hasAward,
    });
    
    setLoading(false);
  }
  
  function buildSlides() {
    if (!data) return;
    
    const newSlides: React.ReactNode[] = [];
    const ws = data.wrap_stats;
    
    // Slide 1: Intro
    newSlides.push(
      <Slide key="intro" bg="from-violet-600 via-purple-600 to-fuchsia-600">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-purple-200 text-lg mb-4"
          >
            {new Date(data.event_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}
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
    );
    
    // Slide 2: Collective distance (if available)
    if (ws?.total_distance_km) {
      newSlides.push(
        <Slide key="collective" bg="from-emerald-500 via-teal-600 to-cyan-700">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="text-7xl mb-6"
            >
              🌍
            </motion.div>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-teal-200 text-lg mb-2"
            >
              Tillsammans cyklade vi
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-7xl font-black mb-2"
            >
              {ws.total_distance_km}
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
      );
    }
    
    // Slide 3: Your distance
    newSlides.push(
      <Slide key="distance" bg="from-cyan-500 via-blue-600 to-indigo-700">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
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
            Du stod för
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
    );
    
    // Slide 4: People met
    newSlides.push(
      <Slide key="people" bg="from-rose-500 via-pink-600 to-fuchsia-700">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
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
    );
    
    // Slide 5: Shortest ride (fun fact)
    if (ws?.shortest_ride_meters && ws.shortest_ride_meters < 200) {
      newSlides.push(
        <Slide key="shortest" bg="from-yellow-400 via-amber-500 to-orange-600">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="text-7xl mb-6"
            >
              ⚡
            </motion.div>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-amber-100 text-lg mb-2"
            >
              Kortaste cyklingen ikväll?
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-6xl font-black mb-2"
            >
              {ws.shortest_ride_meters} meter
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-amber-100"
            >
              {ws.shortest_ride_meters < 100 ? '(Över tomtgränsen! 😂)' : `av ${ws.shortest_ride_couple}`}
            </motion.p>
          </motion.div>
        </Slide>
      );
    }
    
    // Slide 6: Longest ride
    if (ws?.longest_ride_meters && ws.longest_ride_meters > 1000) {
      newSlides.push(
        <Slide key="longest" bg="from-indigo-500 via-purple-600 to-violet-700">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="text-7xl mb-6"
            >
              🏆
            </motion.div>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-violet-200 text-lg mb-2"
            >
              Längsta sträckan?
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-6xl font-black mb-2"
            >
              {(ws.longest_ride_meters / 1000).toFixed(1)} km
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-violet-100"
            >
              av {ws.longest_ride_couple}
            </motion.p>
          </motion.div>
        </Slide>
      );
    }
    
    // Slide 7: Portions served
    if (ws?.total_portions) {
      newSlides.push(
        <Slide key="food" bg="from-lime-500 via-green-600 to-emerald-700">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="text-8xl mb-6"
            >
              🍽️
            </motion.div>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-green-200 text-lg mb-2"
            >
              Totalt serverades
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-7xl font-black mb-2"
            >
              {ws.total_portions}
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-3xl font-bold"
            >
              portioner
            </motion.p>
          </motion.div>
        </Slide>
      );
    }
    
    // Slide 8: Last guest departure
    if (ws?.last_guest_departure) {
      newSlides.push(
        <Slide key="lastguest" bg="from-slate-600 via-slate-700 to-slate-900">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="text-7xl mb-6"
            >
              🌙
            </motion.div>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-slate-300 text-lg mb-2"
            >
              Sista gästen lämnade efterfesten
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-6xl font-black mb-2"
            >
              {ws.last_guest_departure}
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-slate-300"
            >
              (Det var en lyckad kväll! 🎉)
            </motion.p>
          </motion.div>
        </Slide>
      );
    }
    
    // Slide 9: Award teaser
    if (data.has_award) {
      newSlides.push(
        <Slide key="teaser" bg="from-yellow-500 via-amber-500 to-yellow-600">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: [0, 1.2, 1], rotate: [0, 10, 0] }}
              transition={{ duration: 0.8, type: 'spring' }}
              className="text-8xl mb-6"
            >
              🎁
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold mb-4"
            >
              Du har en utmärkelse
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-amber-100 text-lg"
            >
              som väntar på dig...
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="text-amber-200 text-sm mt-4"
            >
              🏆 Avslöjas kl 14:00
            </motion.p>
          </motion.div>
        </Slide>
      );
    }
    
    // Slide 10: Thank you + Share (always last)
    newSlides.push(
      <Slide key="thanks" bg="from-amber-500 via-orange-500 to-red-600">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
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
    );
    
    setSlides(newSlides);
  }
  
  function startWrap() {
    setHasStarted(true);
    setIsPlaying(true);
    setCurrentSlide(0);
    // Try to play audio with better error handling
    if (audioRef.current) {
      audioRef.current.volume = 0.7;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setAudioPlaying(true))
          .catch((err) => {
            console.log('Audio autoplay blocked:', err);
            setAudioPlaying(false);
          });
      }
    }
  }
  
  function toggleAudio() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.volume = 0.7;
      audioRef.current.play()
        .then(() => setAudioPlaying(true))
        .catch(console.error);
    } else {
      audioRef.current.pause();
      setAudioPlaying(false);
    }
  }
  
  function handleSlideClick() {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    }
  }
  
  async function shareToInstagram() {
    const ws = data?.wrap_stats;
    
    // Create share text
    const text = `🚴 Min Cykelfest-kväll:\n\n` +
      (ws?.total_distance_km ? `🌍 Vi cyklade totalt ${ws.total_distance_km} km\n` : '') +
      `📍 Jag stod för ${data?.distance_km} km\n` +
      `👥 Träffade ${data?.people_met} nya vänner\n` +
      (ws?.total_portions ? `🍽️ ${ws.total_portions} portioner serverades\n` : '') +
      `\nTack ${data?.event_name}! ✨\n\n` +
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
          <p className="text-purple-200 mb-2">Din Cykelfest Wrapped</p>
          <p className="text-purple-300 text-sm mb-8">🎵 Musik: {data.music_decade}</p>
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
          src={musicSrc}
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
        {slides.map((_, i) => (
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
        {slides[currentSlide]}
      </AnimatePresence>
      
      {/* Tap hint */}
      {currentSlide < slides.length - 1 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm"
        >
          Tryck för nästa →
        </motion.p>
      )}
      
      {/* Audio control button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleAudio();
        }}
        className="absolute bottom-8 right-4 z-50 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white p-3 rounded-full transition-colors text-xl"
        aria-label="Toggle music"
      >
        {audioPlaying ? '🔊' : '🔇'}
      </button>
      
      {/* Audio element with decade-based music */}
      <audio ref={audioRef} src={musicSrc} loop preload="auto" />
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
