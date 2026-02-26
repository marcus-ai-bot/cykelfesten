'use client';

/**
 * Award Wrap v2 - Individual person-based award reveal
 * 
 * URL: /award?coupleId=xxx&person=invited OR /award?coupleId=xxx&person=partner
 * 
 * 6-step flow:
 * 1. Intro: "{Name}, du har fått en utmärkelse!"
 * 2. Drumroll: 🥁 with sound
 * 3. Reveal: Award with confetti + celebration sound
 * 4. Context: Explanation of what the award means
 * 5. Badge: Downloadable diploma/PNG
 * 6. Share: Social sharing with "Vilken utmärkelse fick DU?"
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
// Note: Supabase client removed - using API for data fetching
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { AWARDS, type Award } from '@/lib/awards/calculate';

// Default enabled awards (non-sensitive)
const DEFAULT_ENABLED_AWARDS = [
  'longest_distance', 'shortest_distance', 'average_distance',
  'first_signup', 'last_signup',
  'furthest_from_center', 'closest_to_center',
  'most_fun_facts',
  'wildcard', 'social_butterfly', 'mystery_guest',
  'perfect_host', 'party_starter', 'night_owl',
];

interface AwardData {
  person_name: string;              // Individual name, not couple
  event_name: string;
  event_date: string;
  award: Award;
  value: string | null;
  explanation: string;              // Personalized explanation
  thank_you_message: string | null; // Admin's custom message
}

export default function AwardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  
  const token = searchParams.get('token');
  
  const [data, setData] = useState<AwardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'intro' | 'drumroll' | 'reveal' | 'context' | 'badge' | 'share'>('intro');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    loadData();
  }, [slug, token]);
  
  async function loadData() {
    if (!token) {
      setLoading(false);
      return;
    }
    
    try {
      // Build API URL with auth params
      const apiUrl = new URL('/api/award/data', window.location.origin);
      apiUrl.searchParams.set('eventSlug', slug);
      
      apiUrl.searchParams.set('token', token);
      
      const response = await fetch(apiUrl.toString());
      
      if (!response.ok) {
        console.error('Failed to load award data:', response.status);
        setLoading(false);
        return;
      }
      
      const awardData = await response.json();
      
      // If no award, show default participant award
      if (!awardData.has_award || !awardData.award) {
        const wildcardAward = AWARDS.find(a => a.id === 'wildcard') || AWARDS[0];
        setData({
          person_name: awardData.person_name || 'Deltagare',
          event_name: awardData.event_name || '',
          event_date: awardData.event_date || '',
          award: wildcardAward,
          value: null,
          explanation: getExplanation(wildcardAward, null, awardData.person_name),
          thank_you_message: awardData.thank_you_message,
        });
      } else {
        setData({
          person_name: awardData.person_name,
          event_name: awardData.event_name,
          event_date: awardData.event_date,
          award: awardData.award,
          value: awardData.value,
          explanation: awardData.explanation,
          thank_you_message: awardData.thank_you_message,
        });
      }
    } catch (error) {
      console.error('Error loading award data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  function getExplanation(award: Award, value: string | null, name: string | null): string {
    const displayName = name || 'Du';
    
    switch (award.id) {
      case 'longest_distance':
        return `${displayName} cyklade längst av alla deltagare! ${value ? `Hela ${value} — det är en sann prestation!` : 'Imponerande!'}`;
      
      case 'shortest_distance':
        return `${displayName} hade tur med placeringen och fick njuta av en kort cykeltur. ${value ? `Bara ${value}!` : 'Praktiskt!'}`;
      
      case 'oldest':
        return `${displayName} representerar erfarenhet och visdom på festen. Ålder är bara en siffra, men din energi är tidlös!`;
      
      case 'youngest':
        return `${displayName} är kvällens nya stjärna! Frisk energi och nya perspektiv är alltid välkomna.`;
      
      case 'first_signup':
        return `${displayName} var först att anmäla sig — det visar verklig entusiasm!`;
      
      case 'last_signup':
        return `${displayName} väntade in det rätta ögonblicket. Fashionably late till anmälan, men på plats när det gäller!`;
      
      case 'most_fun_facts':
        return `${displayName} delade flest fun facts — en riktig berättare som gör kvällen levande!`;
      
      case 'least_fun_facts':
        return `${displayName} behöll mystiken. Ibland säger tystnaden mer än tusen ord...`;
      
      case 'only_vegetarian':
        return `${displayName} representerar det gröna på bordet! Tack för att du visar att god mat kan vara hållbar.`;
      
      case 'wildcard':
        return `${displayName} drog wildcarden! Slumpen valde dig till något alldeles speciellt.`;
      
      default:
        return `Grattis ${displayName}! Du har gjort kvällen minnesvärd.`;
    }
  }
  
  function startReveal() {
    setStep('drumroll');
    
    // Play drumroll sound
    try {
      const drumroll = new Audio('/sounds/drumroll.mp3');
      drumroll.volume = 0.7;
      drumroll.play().catch(() => {}); // Ignore autoplay errors
    } catch {}
    
    // After drumroll, reveal with confetti
    setTimeout(() => {
      setStep('reveal');
      fireConfetti();
      
      // Play celebration sound
      try {
        const celebration = new Audio('/sounds/celebration.mp3');
        celebration.volume = 0.5;
        celebration.play().catch(() => {});
      } catch {}
    }, 2500);
  }
  
  function nextStep() {
    const steps: Array<typeof step> = ['intro', 'drumroll', 'reveal', 'context', 'badge', 'share'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  }
  
  async function downloadBadge() {
    if (!badgeRef.current || !data) return;
    
    try {
      // Dynamic import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(badgeRef.current, {
        backgroundColor: '#1e1b4b', // Fallback bg color
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });
      
      const fileName = `cykelfesten-${data.award.id}-${data.person_name.replace(/\s/g, '-')}.png`;
      
      // Try native share with file (works on mobile)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' });
        const shareData = { files: [file] };
        
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }
      
      // Fallback: Download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = fileName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Diplom nedladdat! 🎉');
    } catch (e) {
      console.error('Badge download failed:', e);
      // iOS Safari fallback: Open image in new tab
      try {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(badgeRef.current!, {
          backgroundColor: '#1e1b4b',
          scale: 2,
        });
        const dataUrl = canvas.toDataURL('image/png');
        const newTab = window.open('about:blank');
        if (newTab) {
          newTab.document.write(`
            <html>
              <head><title>Ditt Cykelfest-diplom</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
              <body style="margin:0;padding:20px;display:flex;flex-direction:column;align-items:center;background:#1a1a2e;min-height:100vh;">
                <p style="color:white;font-family:system-ui;margin-bottom:20px;">📱 Håll inne på bilden → "Lägg till i Bilder"</p>
                <img src="${dataUrl}" style="max-width:100%;border-radius:16px;" />
              </body>
            </html>
          `);
          return;
        }
      } catch (e2) {
        console.error('Fallback also failed:', e2);
      }
      alert('Tips: Håll fingret på diplomet ovan och välj "Spara bild" eller ta en screenshot! 📱');
    }
  }
  
  function fireConfetti() {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 1000,
    };
    
    confetti({
      ...defaults,
      particleCount: count * 0.25,
      spread: 26,
      startVelocity: 55,
      colors: ['#FFD700', '#FFA500'],
    });
    
    confetti({
      ...defaults,
      particleCount: count * 0.2,
      spread: 60,
      colors: ['#FF6B6B', '#4ECDC4', '#FFE66D'],
    });
    
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: count * 0.35,
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      });
    }, 200);
    
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: count * 0.1,
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      });
    }, 400);
  }
  
  async function shareAward(platform: 'generic' | 'instagram' = 'generic') {
    if (!data) return;
    
    const shareText = `Jag fick utmärkelsen "${data.award.title}" ${data.award.emoji} på Cykelfesten! Vilken utmärkelse fick DU? 🚴✨`;
    
    if (platform === 'instagram') {
      // Download badge first, then prompt for IG
      await downloadBadge();
      alert('Öppna Instagram och ladda upp bilden till din story!');
      return;
    }
    
    const shareData = {
      title: `${data.person_name}s utmärkelse`,
      text: shareText,
      url: window.location.href,
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          await copyShareText();
        }
      }
    } else {
      await copyShareText();
    }
  }
  
  async function copyShareText() {
    if (!data) return;
    
    const text = `Jag fick utmärkelsen "${data.award.title}" ${data.award.emoji} på Cykelfesten! Vilken utmärkelse fick DU? 🚴✨\n\n${window.location.href}\n\n#Cykelfesten #DinnerSafari #Piteå2026`;
    
    try {
      await navigator.clipboard.writeText(text);
      alert('Text kopierad! Klistra in i din story 📱');
    } catch {
      alert('Kunde inte kopiera. Prova igen!');
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-white">Laddar din award...</div>
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
  
  // Intro screen
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-white max-w-md"
        >
          <motion.div
            animate={{ 
              rotate: [0, -10, 10, -10, 10, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
            className="text-8xl mb-8"
          >
            🏆
          </motion.div>
          <h1 className="text-3xl font-bold mb-2">{data.person_name}</h1>
          <p className="text-purple-300 mb-2">Du har fått en utmärkelse!</p>
          <p className="text-gray-400 text-sm mb-8">{data.event_name}</p>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startReveal}
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-bold py-4 px-10 rounded-full text-lg shadow-2xl"
          >
            🎁 Öppna
          </motion.button>
        </motion.div>
      </div>
    );
  }
  
  // Drumroll
  if (step === 'drumroll') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.3, 1, 1.3, 1, 1.5],
              rotate: [0, 0, 0, 0, 0, 360],
            }}
            transition={{ duration: 2.5, times: [0, 0.2, 0.4, 0.6, 0.8, 1] }}
            className="text-9xl"
          >
            🥁
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0, 1, 0, 1] }}
            transition={{ duration: 2.5 }}
            className="text-white text-2xl mt-8 font-bold"
          >
            Och vinnaren är...
          </motion.p>
        </motion.div>
      </div>
    );
  }
  
  // Step 3: Reveal!
  if (step === 'reveal') {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${data.award.color_from || 'from-yellow-400'} ${data.award.color_to || 'to-orange-500'} flex items-center justify-center p-4`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', bounce: 0.4 }}
          className="text-center text-white max-w-md"
        >
          {/* Trophy animation */}
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, type: 'spring', bounce: 0.5 }}
            className="relative"
          >
            <motion.div
              animate={{ 
                y: [0, -10, 0],
                rotate: [0, -5, 5, 0],
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-9xl mb-4"
            >
              {data.award.emoji}
            </motion.div>
            
            {/* Sparkles */}
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute top-0 left-1/4 text-4xl"
            >
              ✨
            </motion.div>
            <motion.div
              animate={{ scale: [1, 0.8, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }}
              className="absolute top-2 right-1/4 text-3xl"
            >
              ⭐
            </motion.div>
          </motion.div>
          
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <p className="text-white/80 text-lg mb-2">Du vann</p>
            <h1 className="text-4xl font-black mb-4">"{data.award.title}"</h1>
            <p className="text-xl text-white/90 mb-6">{data.award.subtitle}</p>
          </motion.div>
          
          {/* Continue button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={nextStep}
            className="bg-white/90 text-gray-900 font-bold py-4 px-8 rounded-full text-lg shadow-xl"
          >
            Vad betyder det? →
          </motion.button>
        </motion.div>
      </div>
    );
  }
  
  // Step 4: Context - Explanation
  if (step === 'context') {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${data.award.color_from || 'from-purple-600'} ${data.award.color_to || 'to-indigo-700'} flex items-center justify-center p-4`}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-white max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
            className="text-7xl mb-6"
          >
            {data.award.emoji}
          </motion.div>
          
          <h2 className="text-3xl font-bold mb-6">Vad betyder det?</h2>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6"
          >
            <p className="text-xl leading-relaxed">
              {data.explanation}
            </p>
          </motion.div>
          
          {data.value && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="bg-black/30 rounded-xl py-4 px-6 inline-block mb-8"
            >
              <p className="text-3xl font-bold">{data.value}</p>
            </motion.div>
          )}
          
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={nextStep}
            className="bg-white text-gray-900 font-bold py-4 px-8 rounded-full text-lg shadow-xl"
          >
            Se ditt diplom 🏆
          </motion.button>
        </motion.div>
      </div>
    );
  }
  
  // Step 5: Badge - Downloadable diploma
  if (step === 'badge') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-white"
        >
          <h2 className="text-3xl font-bold mb-8">Ditt diplom</h2>
          
          {/* Badge for download */}
          <motion.div
            ref={badgeRef}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring' }}
            className="bg-gradient-to-br from-purple-800 to-pink-800 
                       p-8 rounded-2xl border-4 border-yellow-400 
                       max-w-sm mx-auto mb-8 shadow-2xl"
          >
            <div className="text-6xl mb-4">{data.award.emoji}</div>
            <h3 className="text-3xl font-black mb-2">"{data.award.title}"</h3>
            <p className="text-lg text-white/80 mb-4">{data.award.subtitle}</p>
            <div className="border-t border-white/30 pt-4 mt-4">
              <p className="text-2xl font-bold">{data.person_name}</p>
              <p className="text-sm text-white/60 mt-2">{data.event_name}</p>
              {data.event_date && (
                <p className="text-xs text-white/40 mt-1">
                  {new Date(data.event_date).toLocaleDateString('sv-SE')}
                </p>
              )}
            </div>
            <div className="mt-4 text-xs text-white/40">
              🚴 Cykelfesten
            </div>
          </motion.div>
          
          <div className="space-y-4">
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={downloadBadge}
              className="bg-yellow-400 text-gray-900 font-bold py-4 px-8 rounded-full text-lg shadow-xl block w-full max-w-xs mx-auto"
            >
              💾 Ladda ner diplom
            </motion.button>
            
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={nextStep}
              className="bg-white/20 text-white font-bold py-3 px-6 rounded-full text-lg block w-full max-w-xs mx-auto"
            >
              Dela med vänner →
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }
  
  // Step 6: Share - Social trigger
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-white max-w-md"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.5 }}
          className="text-7xl mb-6"
        >
          🎉
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-4">Dela din utmärkelse!</h2>
        
        {/* Admin's thank you message */}
        {data.thank_you_message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 mb-6 max-w-sm mx-auto"
          >
            <p className="text-lg">{data.thank_you_message}</p>
          </motion.div>
        )}
        
        <p className="text-xl text-white/80 mb-6">
          Visa dina vänner vad du fick! 🏆
        </p>
        
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-8 max-w-sm mx-auto">
          <p className="text-lg italic">
            "Vilken utmärkelse fick DU?"
          </p>
        </div>
        
        <div className="space-y-4">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => shareAward('instagram')}
            className="bg-gradient-to-r from-purple-500 to-pink-500 
                       text-white px-8 py-4 rounded-full text-lg font-bold
                       shadow-xl block w-full max-w-xs mx-auto"
          >
            📸 Dela till Instagram Story
          </motion.button>
          
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => shareAward('generic')}
            className="bg-blue-500 text-white px-8 py-4 rounded-full 
                       text-lg font-bold shadow-xl block w-full max-w-xs mx-auto"
          >
            📱 Dela överallt
          </motion.button>
          
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={copyShareText}
            className="bg-white/20 text-white px-6 py-3 rounded-full 
                       text-lg block w-full max-w-xs mx-auto"
          >
            📋 Kopiera text
          </motion.button>
        </div>
        
        <p className="text-sm text-white/50 mt-8">
          #Cykelfesten #DinnerSafari #Piteå2026
        </p>
      </motion.div>
    </div>
  );
}
