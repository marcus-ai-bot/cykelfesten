'use client';

/**
 * Personal Wrap v2 - Individual person-based animated story
 * 
 * URL: /wrap?coupleId=xxx&person=invited OR /wrap?coupleId=xxx&person=partner
 * 
 * 10 slides with animations and decade-based music:
 * 1. "[Name], din kväll" intro (personalized)
 * 2. Collective distance (all participants)
 * 3. Your distance (% of total + fun comparison)
 * 4. People met (with storytelling)
 * 5. Fun fact: shortest ride (ALWAYS show, even <200m)
 * 6. Fun fact: longest ride (highlight if you)
 * 7. Dishes served (with comparison)
 * 8. Last guest departed
 * 9. Award teaser
 * 10. Thank you + share CTA (#Cykelfesten)
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
  person_name: string;              // Individual name, not couple
  event_name: string;
  event_date: string;
  distance_km: number;              // Individual distance
  distance_percent: number;         // % of total event distance
  people_met: number;               // Individual count
  music_decade: string;             // From individual fun_facts
  wrap_stats: WrapStats | null;     // Event-level aggregate
  has_award: boolean;
  is_longest_rider: boolean;        // Did THIS person cycle most?
}

const SLIDE_DURATION = 4000; // 4 seconds per slide

// (Music file is determined server-side)

// Fun comparisons for distances
function getDistanceComparison(km: number): string {
  if (km < 0.2) return `${Math.round(km * 1000)} meter — nästan en kvällspromenad!`;
  if (km < 1) return `${Math.round(km * 1000)} meter — perfekt distans för en middag!`;
  if (km < 2) return `${km.toFixed(1)} km — som en tur runt kvarteret!`;
  if (km < 5) return `${km.toFixed(1)} km — som från centrum till Norrstrand!`;
  if (km < 10) return `${km.toFixed(1)} km — som från Piteå till Hortlax!`;
  if (km < 20) return `${km.toFixed(1)} km — som från Piteå till Rosvik!`;
  return `${km.toFixed(1)} km — du är en sann cyklist! 🚴`;
}

export default function WrapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  
  // Support both signed token (preferred) and legacy coupleId+person params
  const token = searchParams.get('token');
  const coupleId = searchParams.get('coupleId');
  const personType = searchParams.get('person') || 'invited'; // 'invited' or 'partner'
  
  const [data, setData] = useState<WrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [musicSrc, setMusicSrc] = useState('/music/default.mp3');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const supabase = createClient(); // Keep for tracking only
  
  // Dynamic slides based on available data
  const [slides, setSlides] = useState<React.ReactNode[]>([]);
  
  useEffect(() => {
    loadData();
  }, [slug, token, coupleId, personType]);
  
  // Track wrap link open (once per session)
  useEffect(() => {
    if (!coupleId || !personType) return;
    const trackKey = `wrap_tracked_${coupleId}_${personType}`;
    if (sessionStorage.getItem(trackKey)) return;
    
    // Log the open
    fetch('/api/track/wrap-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coupleId, personType }),
    }).catch(() => {}); // Fire and forget
    
    sessionStorage.setItem(trackKey, 'true');
  }, [coupleId, personType]);
  
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
    // Need either token or coupleId
    if (!token && !coupleId) {
      setLoading(false);
      return;
    }
    
    try {
      // Build API URL with auth params
      const apiUrl = new URL('/api/wrap/data', window.location.origin);
      apiUrl.searchParams.set('eventSlug', slug);
      
      if (token) {
        // Preferred: signed token
        apiUrl.searchParams.set('token', token);
      } else if (coupleId) {
        // Legacy: raw coupleId (still supported during migration)
        apiUrl.searchParams.set('coupleId', coupleId);
        apiUrl.searchParams.set('person', personType);
      }
      
      const response = await fetch(apiUrl.toString());
      
      if (!response.ok) {
        console.error('Failed to load wrap data:', response.status);
        setLoading(false);
        return;
      }
      
      const wrapData: WrapData = await response.json();
      
      // Set music based on decade
      const musicFile = `/music/${wrapData.music_decade}.mp3`;
      setMusicSrc(musicFile);
      
      setData({
        ...wrapData,
        music_decade: wrapData.music_decade === '80s' ? '80-tal' : 
                      wrapData.music_decade === '90s' ? '90-tal' :
                      wrapData.music_decade === '2000s' ? '2000-tal' :
                      wrapData.music_decade === '2010s' ? '2010-tal' :
                      wrapData.music_decade === '2020s' ? '2020-tal' : 'festlig',
      });
    } catch (error) {
      console.error('Error loading wrap data:', error);
    }
    
    setLoading(false);
  }
  
  function buildSlides() {
    if (!data) return;
    
    const newSlides: React.ReactNode[] = [];
    const ws = data.wrap_stats;
    
    // Slide 1: Intro (personalized)
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
            className="text-6xl font-bold mb-2"
          >
            {data.person_name},
          </motion.h1>
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-4xl font-bold mb-6"
          >
            din kväll
          </motion.h2>
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
    
    // Slide 3: Your distance (with % and comparison)
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
            Du cyklade
          </motion.p>
          <motion.p 
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="text-7xl font-black mb-4"
          >
            {data.distance_km} km
          </motion.p>
          {data.distance_percent > 0 && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-2xl font-bold mb-4"
            >
              Du stod för {data.distance_percent}% av totalen!
            </motion.p>
          )}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="text-xl text-blue-200"
          >
            {getDistanceComparison(data.distance_km)}
          </motion.p>
        </motion.div>
      </Slide>
    );
    
    // Slide 4: People met (with storytelling)
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
            className="text-7xl font-black mb-4"
          >
            {data.people_met}
          </motion.p>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-2xl font-bold mb-4"
          >
            nya ansikten, nya historier
          </motion.p>
          {data.people_met >= 20 && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="text-xl text-pink-200"
            >
              Det är som ett helt klassrum!
            </motion.p>
          )}
          {data.people_met >= 30 && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="text-xl text-pink-200"
            >
              Du är en social superstjärna! 🌟
            </motion.p>
          )}
        </motion.div>
      </Slide>
    );
    
    // Slide 5: Shortest ride (ALWAYS show, even tiny - storytelling!)
    if (ws?.shortest_ride_meters) {
      const metersStr = ws.shortest_ride_meters < 1000 
        ? `${ws.shortest_ride_meters}m`
        : `${(ws.shortest_ride_meters / 1000).toFixed(1)} km`;
      
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
              Kortaste cykelturen:
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-6xl font-black mb-4"
            >
              {metersStr}
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl font-bold"
            >
              {ws.shortest_ride_couple}
            </motion.p>
            {ws.shortest_ride_meters < 200 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="text-lg text-yellow-200 mt-4"
              >
                Turligt placerade! 🍀
              </motion.p>
            )}
            {ws.shortest_ride_meters < 50 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
                className="text-lg text-yellow-200"
              >
                Praktiskt taget grannbesök! 😄
              </motion.p>
            )}
          </motion.div>
        </Slide>
      );
    }
    
    // Slide 6: Longest ride (highlight if you)
    if (ws?.longest_ride_meters) {
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
              Längsta cykelturen:
            </motion.p>
            <motion.p 
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="text-6xl font-black mb-4"
            >
              {(ws.longest_ride_meters / 1000).toFixed(1)} km
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl font-bold"
            >
              {ws.longest_ride_couple}
            </motion.p>
            {data.is_longest_rider && (
              <motion.p 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2, type: 'spring' }}
                className="text-2xl text-green-300 mt-4"
              >
                Det var du! 💪
              </motion.p>
            )}
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
              className="text-7xl font-black mb-4"
            >
              {ws.total_portions}
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-2xl font-bold mb-4"
            >
              portioner mat
            </motion.p>
            {ws.total_portions > 100 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="text-xl text-green-200"
              >
                Det är som en liten restaurang! 🍽️
              </motion.p>
            )}
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
    
    // Slide 10: Thank you + Share CTA (strong social trigger)
    newSlides.push(
      <Slide key="thanks" bg="from-amber-500 via-orange-500 to-red-600">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center px-4"
        >
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl font-bold mb-8"
          >
            Tack för en magisk kväll!
          </motion.h2>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-8 max-w-md mx-auto"
          >
            <p className="text-3xl mb-4">Dela din wrap!</p>
            <p className="text-lg text-orange-100 mb-6">
              Berätta för världen om din kväll
            </p>
            
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                shareWrap();
              }}
              className="bg-gradient-to-r from-pink-500 to-purple-500 
                         text-white px-8 py-4 rounded-full text-xl font-bold
                         hover:shadow-2xl transition-shadow w-full"
            >
              📱 Dela med #Cykelfesten
            </motion.button>
          </motion.div>
          
          {data.has_award && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/e/${slug}/award?coupleId=${coupleId}&person=${personType}`;
              }}
              className="text-xl underline hover:text-white transition-colors"
            >
              Se din utmärkelse →
            </motion.button>
          )}
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
  
  function handleSlideClick(e: React.MouseEvent) {
    // Ignore clicks on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    // Get click position relative to viewport
    const clickX = e.clientX;
    const screenWidth = window.innerWidth;
    
    // Left 30% = back, Right 70% = forward (like Facebook/Instagram stories)
    if (clickX < screenWidth * 0.3) {
      // Go back
      if (currentSlide > 0) {
        setCurrentSlide(prev => prev - 1);
        setIsPlaying(false); // Pause auto-advance when manually navigating
      }
    } else {
      // Go forward
      if (currentSlide < slides.length - 1) {
        setCurrentSlide(prev => prev + 1);
        setIsPlaying(false); // Pause auto-advance when manually navigating
      }
    }
  }
  
  async function shareWrap() {
    if (!data) return;
    
    // Create personalized share text
    const shareText = `Jag cyklade ${data.distance_km} km, träffade ${data.people_met} personer och fick en utmärkelse! 🚴✨`;
    
    const shareData = {
      title: `${data.person_name}s Cykelfest`,
      text: shareText,
      url: window.location.href,
    };
    
    // Try native share (works on mobile)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        // User cancelled or error - fallback to clipboard
        if ((e as Error).name !== 'AbortError') {
          await copyToClipboard(shareText);
        }
      }
    } else {
      // Desktop fallback: copy to clipboard
      await copyToClipboard(shareText);
    }
  }
  
  async function copyToClipboard(text: string) {
    const fullText = `${text}\n\n${window.location.href}\n\n#Cykelfesten #DinnerSafari #Piteå2026`;
    
    try {
      await navigator.clipboard.writeText(fullText);
      alert('Kopierat till urklipp! Klistra in i din story 📱');
    } catch (e) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = fullText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
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
          <h1 className="text-3xl font-bold mb-2">{data.person_name}</h1>
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
      
      {/* Tap hint - shows back/forward zones */}
      {currentSlide < slides.length - 1 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm"
        >
          {currentSlide > 0 ? '← Vänster: bakåt | Höger: framåt →' : 'Tryck för nästa →'}
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
