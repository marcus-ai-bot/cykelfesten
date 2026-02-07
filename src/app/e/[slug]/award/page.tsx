'use client';

/**
 * Award Wrap - Personal award reveal
 * 
 * Each person gets ONE unique award.
 * Animated reveal with confetti!
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { AWARDS, type Award } from '@/lib/awards/calculate';

interface AwardData {
  couple_name: string;
  event_name: string;
  award: Award;
  value: string | null;
}

export default function AwardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const coupleId = searchParams.get('coupleId');
  
  const [data, setData] = useState<AwardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'intro' | 'drumroll' | 'reveal'>('intro');
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [slug, coupleId]);
  
  async function loadData() {
    if (!coupleId) {
      setLoading(false);
      return;
    }
    
    // Get couple info
    const { data: couple } = await supabase
      .from('couples')
      .select('*, events(*)')
      .eq('id', coupleId)
      .single();
    
    if (!couple) {
      setLoading(false);
      return;
    }
    
    // Get award assignment
    const { data: assignment } = await supabase
      .from('award_assignments')
      .select('*')
      .eq('couple_id', coupleId)
      .single();
    
    if (!assignment) {
      // No award assigned yet - show default
      setData({
        couple_name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
        event_name: (couple.events as any)?.name || '',
        award: AWARDS.find(a => a.id === 'wildcard') || AWARDS[0],
        value: null,
      });
      setLoading(false);
      return;
    }
    
    const award = AWARDS.find(a => a.id === assignment.award_id);
    
    setData({
      couple_name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
      event_name: (couple.events as any)?.name || '',
      award: award || AWARDS[0],
      value: assignment.value,
    });
    
    setLoading(false);
  }
  
  function startReveal() {
    setStep('drumroll');
    
    // After drumroll, reveal with confetti
    setTimeout(() => {
      setStep('reveal');
      fireConfetti();
    }, 2500);
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
  
  async function shareAward() {
    if (!data) return;
    
    const text = `🏆 Jag vann "${data.award.title}" på ${data.event_name}!\n\n` +
      `${data.award.emoji} ${data.award.subtitle}\n` +
      (data.value ? `📊 ${data.value}\n\n` : '\n') +
      `#Cykelfesten #Award`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `🏆 ${data.award.title}`,
          text,
          url: window.location.href,
        });
      } catch (e) {}
    } else {
      await navigator.clipboard.writeText(text);
      alert('Kopierat till urklipp! 📋');
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
          <h1 className="text-3xl font-bold mb-2">{data.couple_name}</h1>
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
  
  // Reveal!
  return (
    <div className={`min-h-screen bg-gradient-to-br ${data.award.color_from} ${data.award.color_to} flex items-center justify-center p-4`}>
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
          <p className="text-xl text-white/90 mb-4">{data.award.subtitle}</p>
          
          {/* Value if exists */}
          {data.value && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: 'spring' }}
              className="bg-white/20 backdrop-blur rounded-2xl py-4 px-6 inline-block mb-6"
            >
              <p className="text-3xl font-bold">{data.value}</p>
            </motion.div>
          )}
        </motion.div>
        
        {/* Couple name */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-white/70 mb-8"
        >
          {data.couple_name}
        </motion.p>
        
        {/* Share button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={shareAward}
          className="bg-white/90 text-gray-900 font-bold py-4 px-8 rounded-full text-lg shadow-xl"
        >
          📲 Dela min award
        </motion.button>
      </motion.div>
    </div>
  );
}
