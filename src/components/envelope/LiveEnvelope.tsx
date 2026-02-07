'use client';

/**
 * LiveEnvelope - Animated envelope component for Living Envelope system
 * 
 * States: LOCKED → TEASING → CLUE_1 → CLUE_2 → STREET → NUMBER → OPEN
 * 
 * Features:
 * - Curious wiggle on TEASING
 * - Vibration + glow on new clues
 * - Letter peek animation
 * - Confetti burst on full reveal
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { EnvelopeState, CourseEnvelopeStatus, Course } from '@/types/database';

// ============================================
// Props & Types
// ============================================

interface CustomMessage {
  emoji: string;
  text: string;
}

interface LiveEnvelopeProps {
  course: CourseEnvelopeStatus;
  onOpen?: () => void;
  className?: string;
  messages?: {
    host_self: CustomMessage[];
    lips_sealed: CustomMessage[];
    mystery_host: CustomMessage[];
  };
}

interface EnvelopeContentProps {
  course: CourseEnvelopeStatus;
  isOpen: boolean;
  hostSelfMessages: CustomMessage[];
  lipsSealedMessages: CustomMessage[];
  mysteryHostMessages: CustomMessage[];
}

// ============================================
// Animation Variants
// ============================================

const envelopeVariants: Variants = {
  idle: { 
    scale: 1, 
    rotate: 0,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  curious: {
    rotate: [-3, 3, -2, 2, -1, 1, 0],
    transition: { duration: 0.6, ease: 'easeInOut' },
  },
  vibrate: {
    x: [-3, 3, -3, 3, -2, 2, -1, 1, 0],
    transition: { duration: 0.5 },
  },
  glow: {
    boxShadow: [
      '0 0 0 0 rgba(251, 191, 36, 0)',
      '0 0 20px 5px rgba(251, 191, 36, 0.4)',
      '0 0 0 0 rgba(251, 191, 36, 0)',
    ],
    transition: { duration: 1.5, repeat: 2 },
  },
  hover: {
    scale: 1.02,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    transition: { duration: 0.2 },
  },
  tap: {
    scale: 0.98,
  },
};

const flapVariants: Variants = {
  closed: { 
    rotateX: 0,
    transformOrigin: 'top center',
  },
  open: { 
    rotateX: -160,
    transformOrigin: 'top center',
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

const letterVariants: Variants = {
  hidden: { 
    y: 0,
    opacity: 1,
  },
  peek: { 
    y: -50,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
  full: {
    y: -100,
    scale: 1.05,
    transition: { duration: 0.5 },
  },
  retract: {
    y: 0,
    transition: { duration: 0.3, ease: 'easeIn' },
  },
};

const contentVariants: Variants = {
  hidden: { 
    opacity: 0, 
    y: 20,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.3,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ============================================
// Helper Functions
// ============================================

function getCourseEmoji(course: Course): string {
  switch (course) {
    case 'starter': return '🥗';
    case 'main': return '🍽️';
    case 'dessert': return '🍰';
    default: return '📧';
  }
}

function getCourseName(course: Course): string {
  switch (course) {
    case 'starter': return 'Förrätt';
    case 'main': return 'Huvudrätt';
    case 'dessert': return 'Dessert';
    default: return course;
  }
}

function getStateMessage(state: EnvelopeState, clueCount: number = 0): string {
  switch (state) {
    case 'LOCKED': return 'Kommer snart...';
    case 'TEASING': return 'Nyfiken? 🤫';
    case 'CLUE_1': return clueCount > 0 ? 'En ledtråd!' : 'Hemligt... 🤫';
    case 'CLUE_2': return clueCount > 1 ? 'Ännu en ledtråd!' : 'Hemligt... 🤐';
    case 'STREET': return 'Nu vet du gatan!';
    case 'NUMBER': return 'Snart framme!';
    case 'OPEN': return 'Välkommen!';
    default: return '';
  }
}

// "Lips sealed" messages when no clue available (host HAS fun facts but we can't reveal more)
const LIPS_SEALED_MESSAGES = [
  { emoji: '🤫', text: 'Our lips are sealed — avslöjar vi en ledtråd kan ni gissa vem!' },
  { emoji: '🤐', text: 'Tyst som en mus — vi kan inte säga mer utan att avslöja!' },
  { emoji: '🤫', text: 'Vi håller tyst den här gången... annars blir det för lätt!' },
  { emoji: '🤐', text: 'Inga fler ledtrådar — nu får ni gissa!' },
];

// Mystery messages when host has NO fun facts at all
const MYSTERY_HOST_MESSAGES = [
  { emoji: '🎭', text: 'Dina värdar är ett mysterium! Vem kan det vara?' },
  { emoji: '✨', text: 'Överraskning väntar — vi avslöjar inget!' },
  { emoji: '🔮', text: 'Ödet har talat. Mer får ni inte veta.' },
  { emoji: '🎪', text: 'Vem döljer sig bakom dörren? Spännande!' },
  { emoji: '🌟', text: 'Stjärnorna är tysta ikväll...' },
];

// Fun messages when YOU are the host (about yourself!)
const HOST_SELF_MESSAGES = [
  { emoji: '👑', text: 'Psst... värden är faktiskt ganska fantastisk. (Det är du!)' },
  { emoji: '🪞', text: 'Ledtråd: Värden tittar på dig i spegeln varje morgon.' },
  { emoji: '🦸', text: 'Breaking news: Kvällens värd är en hjälte i förklädnad!' },
  { emoji: '🎭', text: 'Mystisk värd sökes... Hittad! (Kolla i spegeln)' },
  { emoji: '🌟', text: 'Fun fact: Din värd är extremt bra på att vara du.' },
  { emoji: '🏆', text: 'Grattis! Du har vunnit världens bästa värd. Spoiler: det är du.' },
  { emoji: '🎪', text: 'Cirkusen är i stan! Och du är ringmastern ikväll.' },
  { emoji: '🦄', text: 'Ledtråd: Värden är lika unik som en enhörning. Titta ner.' },
  { emoji: '🎬', text: 'I huvudrollen ikväll: DU! Applåder tack.' },
  { emoji: '🌈', text: 'Värden? Åh, bara den mest underbara personen du känner. Dig själv!' },
];

// "All revealed" message when we've shown everything we have
const ALL_REVEALED_MESSAGES = [
  { emoji: '🤷', text: 'Det var allt vi visste! Resten får ni upptäcka själva.' },
  { emoji: '📭', text: 'Tomt på ledtrådar! Men snart får ni veta gatan...' },
  { emoji: '🎁', text: 'Inga fler ledtrådar — men överraskningen väntar!' },
];

function getLipsSealedMessage(index: number) {
  return LIPS_SEALED_MESSAGES[index % LIPS_SEALED_MESSAGES.length];
}

function getMysteryHostMessage(index: number) {
  return MYSTERY_HOST_MESSAGES[index % MYSTERY_HOST_MESSAGES.length];
}

function getHostSelfMessage(index: number) {
  return HOST_SELF_MESSAGES[index % HOST_SELF_MESSAGES.length];
}

function getAllRevealedMessage(index: number) {
  return ALL_REVEALED_MESSAGES[index % ALL_REVEALED_MESSAGES.length];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Nu!';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
}

// ============================================
// Confetti Effect
// ============================================

function fireConfetti() {
  const count = 100;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 1000,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#FFD700'] });
  fire(0.2, { spread: 60, colors: ['#FF6B6B', '#4ECDC4'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#FFD700', '#FF6B6B', '#4ECDC4'] });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
}

// ============================================
// Envelope Content Component
// ============================================

function EnvelopeContent({ course, isOpen, hostSelfMessages, lipsSealedMessages, mysteryHostMessages }: EnvelopeContentProps) {
  const state = course.state;
  
  // Helper to get message by index
  const getHostSelfMsg = (i: number) => hostSelfMessages[i % hostSelfMessages.length];
  const getLipsSealedMsg = (i: number) => lipsSealedMessages[i % lipsSealedMessages.length];
  const getMysteryHostMsg = (i: number) => mysteryHostMessages[i % mysteryHostMessages.length];
  
  return (
    <motion.div
      variants={contentVariants}
      initial="hidden"
      animate={isOpen ? 'visible' : 'hidden'}
      className="p-4 space-y-3"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="text-center">
        <span className="text-2xl">{getCourseEmoji(course.type)}</span>
        <h3 className="text-lg font-semibold text-gray-800">
          {getCourseName(course.type)}
        </h3>
        <p className="text-sm text-gray-500">
          Startar {formatTime(course.starts_at)}
        </p>
      </motion.div>

      {/* Clues */}
      {course.clues.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-2">
          <h4 className="text-sm font-medium text-amber-700 flex items-center gap-1">
            🔮 Ledtrådar
          </h4>
          <ul className="space-y-1">
            {course.clues.map((clue, i) => (
              <li key={i} className="text-sm text-gray-700 pl-4 border-l-2 border-amber-200">
                {clue.text}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* CLUE_1 with clue pool: Show all participants' clues shuffled */}
      {state === 'CLUE_1' && course.clue_pool && course.clue_pool.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h4 className="text-sm font-medium text-amber-700 flex items-center gap-1">
            🎭 Kvällens deltagare — vem är vem?
          </h4>
          <p className="text-xs text-gray-500 mb-2">
            Någon av dessa är era värdar ikväll...
          </p>
          <div className="flex flex-wrap gap-2">
            {course.clue_pool.map((clue, i) => (
              <span 
                key={i} 
                className="inline-block bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-full"
              >
                {clue}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* EDGE CASE: You ARE the host - show fun self-referential messages */}
      {course.is_self_host && ['CLUE_1', 'CLUE_2'].includes(state) && (
        <motion.div variants={itemVariants} className="bg-amber-50 rounded-lg p-4 text-center border border-amber-200">
          <p className="text-3xl mb-2">{getHostSelfMsg(state === 'CLUE_1' ? 0 : 1).emoji}</p>
          <p className="text-sm text-amber-700 font-medium">{getHostSelfMsg(state === 'CLUE_1' ? 0 : 1).text}</p>
        </motion.div>
      )}

      {/* EDGE CASE: Host has NO fun facts at all - mystery message */}
      {!course.is_self_host && !course.host_has_fun_facts && ['CLUE_1', 'CLUE_2'].includes(state) && (
        <motion.div variants={itemVariants} className="bg-indigo-50 rounded-lg p-4 text-center">
          <p className="text-3xl mb-2">{getMysteryHostMsg(state === 'CLUE_1' ? 0 : 1).emoji}</p>
          <p className="text-sm text-indigo-700">{getMysteryHostMsg(state === 'CLUE_1' ? 0 : 1).text}</p>
        </motion.div>
      )}

      {/* EDGE CASE: CLUE_1 but no clues available (host HAS fun facts but privacy) */}
      {!course.is_self_host && course.host_has_fun_facts && state === 'CLUE_1' && course.clues.length === 0 && (
        <motion.div variants={itemVariants} className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-3xl mb-2">{getLipsSealedMsg(0).emoji}</p>
          <p className="text-sm text-purple-700">{getLipsSealedMsg(0).text}</p>
        </motion.div>
      )}
      
      {/* EDGE CASE: CLUE_2 but only had 1 clue - "that's all we knew" + street hint */}
      {!course.is_self_host && course.host_has_fun_facts && state === 'CLUE_2' && course.clues.length === 1 && (
        <motion.div variants={itemVariants} className="bg-blue-50 rounded-lg p-4 text-center space-y-2">
          <p className="text-3xl mb-1">🗺️</p>
          <p className="text-sm text-blue-700">
            Ni ska till någon som just nu är på <span className="font-bold">{course.street?.name || 'en hemlig gata'}</span>.
          </p>
          {course.cycling_meters && (
            <p className="text-xs text-blue-600">🚴 Ca {course.cycling_meters} meter att cykla</p>
          )}
        </motion.div>
      )}

      {/* EDGE CASE: CLUE_2 but NO clues at all - lips sealed */}
      {!course.is_self_host && course.host_has_fun_facts && state === 'CLUE_2' && course.clues.length === 0 && (
        <motion.div variants={itemVariants} className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-3xl mb-2">{getLipsSealedMsg(1).emoji}</p>
          <p className="text-sm text-purple-700">{getLipsSealedMsg(1).text}</p>
        </motion.div>
      )}

      {/* Street info (only show before OPEN - after that we show full address) */}
      {course.street && state !== 'OPEN' && (
        <motion.div variants={itemVariants} className="bg-blue-50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-700 flex items-center gap-1">
            📍 Adress
          </h4>
          <p className="text-blue-900 font-medium">
            {course.street.name} {course.number ?? course.street.range}
          </p>
          {course.street.cycling_minutes > 0 && (
            <p className="text-xs text-blue-600">
              🚴 {course.street.cycling_minutes} min cykel
            </p>
          )}
        </motion.div>
      )}

      {/* Full address (OPEN state) */}
      {state === 'OPEN' && course.full_address && (
        <motion.div variants={itemVariants} className="bg-green-50 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-medium text-green-700">🎉 Full adress</h4>
          <p className="text-green-900 font-semibold">
            {course.full_address.street} {course.full_address.number}
            {course.full_address.apartment && `, ${course.full_address.apartment}`}
          </p>
          {course.full_address.door_code && (
            <p className="text-sm text-green-700">
              Portkod: <span className="font-mono">{course.full_address.door_code}</span>
            </p>
          )}
          {course.host_names && course.host_names.length > 0 && (
            <p className="text-sm text-green-600">
              👋 {course.host_names.length === 1 ? 'Värd' : 'Värdar'}:{' '}
              {course.host_names.map((name, i) => (
                <span key={i}>
                  {i > 0 && ' & '}
                  <span className="font-bold text-green-800">{name}</span>
                </span>
              ))}
            </p>
          )}
          <a
            href={course.full_address.coordinates 
              ? `https://maps.google.com/?q=${course.full_address.coordinates.lat},${course.full_address.coordinates.lng}`
              : `https://maps.google.com/?q=${encodeURIComponent(`${course.full_address.street} ${course.full_address.number}, ${course.full_address.city}`)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            🗺️ Öppna i kartan
          </a>
        </motion.div>
      )}

      {/* Next reveal countdown */}
      {course.next_reveal && (
        <motion.div variants={itemVariants} className="text-center text-sm text-gray-500">
          ⏱️ Nästa: {getStateMessage(course.next_reveal.type)} om{' '}
          <span className="font-medium">{formatCountdown(course.next_reveal.in_seconds)}</span>
        </motion.div>
      )}

      {/* DESSERT SPECIAL: Stats reveal (CLUE_1) */}
      {course.type === 'dessert' && course.dessert_stats && (
        <motion.div variants={itemVariants} className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-1">
            📊 Kvällens statistik
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-amber-600">{course.dessert_stats.total_couples}</p>
              <p className="text-xs text-gray-600">par deltog</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-amber-600">{course.dessert_stats.total_distance_km}</p>
              <p className="text-xs text-gray-600">km cyklades</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-amber-600">{course.dessert_stats.total_dishes}</p>
              <p className="text-xs text-gray-600">rätter serverades</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-amber-600">{course.dessert_stats.vegetarian_dishes}</p>
              <p className="text-xs text-gray-600">vegetariska</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* DESSERT SPECIAL: Practical info (CLUE_2) */}
      {course.type === 'dessert' && course.afterparty_practical && (
        <motion.div variants={itemVariants} className="bg-blue-50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-1">
            ⏰ Snart dags att röra på sig
          </h4>
          <p className="text-blue-700">
            Efterfesten börjar <span className="font-bold">{course.afterparty_practical.time}</span>
          </p>
          {course.afterparty_practical.door_code && (
            <p className="text-sm text-blue-600">
              🔑 Portkod: <span className="font-mono font-bold">{course.afterparty_practical.door_code}</span>
            </p>
          )}
          {course.afterparty_practical.bring_own_drinks && (
            <p className="text-sm text-blue-600">🍷 Ta med egen dryck</p>
          )}
          {course.afterparty_practical.notes && (
            <p className="text-sm text-blue-600 italic">{course.afterparty_practical.notes}</p>
          )}
          <p className="text-xs text-blue-500 mt-2">Avsluta kaffet i lugn och ro...</p>
        </motion.div>
      )}

      {/* DESSERT SPECIAL: Location push (STREET/NUMBER) */}
      {course.type === 'dessert' && course.afterparty_location && (
        <motion.div variants={itemVariants} className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 space-y-3 border-2 border-green-200">
          <h4 className="text-lg font-bold text-green-800 flex items-center gap-2">
            🎉 Nu är det dags!
          </h4>
          <div className="bg-white/70 rounded-lg p-3">
            <p className="text-green-900 font-bold text-lg">📍 {course.afterparty_location.address}</p>
            {course.afterparty_location.host_names.length > 0 && (
              <p className="text-green-700 text-sm">
                👋 Värd: {course.afterparty_location.host_names.join(' & ')}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-green-700">🚴 Cykeltid härifrån:</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white/60 rounded p-2 text-center">
                <p className="text-lg">🏅</p>
                <p className="font-bold">{course.afterparty_location.cycling_minutes_sober} min</p>
                <p className="text-gray-500">Nykter</p>
              </div>
              <div className="bg-white/60 rounded p-2 text-center">
                <p className="text-lg">🍷</p>
                <p className="font-bold">{course.afterparty_location.cycling_minutes_tipsy} min</p>
                <p className="text-gray-500">Lagom</p>
              </div>
              <div className="bg-white/60 rounded p-2 text-center">
                <p className="text-lg">🥴</p>
                <p className="font-bold">{course.afterparty_location.cycling_minutes_drunk} min</p>
                <p className="text-gray-500">Efterfest-läge</p>
              </div>
            </div>
          </div>
          {course.afterparty_location.coordinates && (
            <a
              href={`https://maps.google.com/?q=${course.afterparty_location.coordinates.lat},${course.afterparty_location.coordinates.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              🗺️ Öppna i kartan
            </a>
          )}
        </motion.div>
      )}

      {/* TEASING message */}
      {state === 'TEASING' && course.clues.length === 0 && (
        <motion.div variants={itemVariants} className="text-center py-4">
          <p className="text-lg">🤫</p>
          <p className="text-gray-600">Nyfiken?</p>
          <p className="text-sm text-gray-400">Mer händer snart...</p>
        </motion.div>
      )}

      {/* LOCKED message */}
      {state === 'LOCKED' && (
        <motion.div variants={itemVariants} className="text-center py-4 text-gray-400">
          <p className="text-2xl">🔒</p>
          <p>Kommer snart...</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================
// Main Component
// ============================================

export function LiveEnvelope({ course, onOpen, className = '', messages }: LiveEnvelopeProps) {
  // Use custom messages or fall back to defaults
  const hostSelfMessages = messages?.host_self ?? HOST_SELF_MESSAGES;
  const lipsSealedMessages = messages?.lips_sealed ?? LIPS_SEALED_MESSAGES;
  const mysteryHostMessages = messages?.mystery_host ?? MYSTERY_HOST_MESSAGES;
  const [isOpen, setIsOpen] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationState, setAnimationState] = useState<'idle' | 'curious' | 'vibrate' | 'glow'>('idle');
  
  const state = course.state;
  const isClickable = state !== 'LOCKED';

  // Trigger animations based on state changes
  useEffect(() => {
    if (hasAnimated) return;
    
    if (state === 'TEASING') {
      setAnimationState('curious');
      setTimeout(() => setAnimationState('idle'), 600);
      setHasAnimated(true);
    } else if (['CLUE_1', 'CLUE_2', 'STREET', 'NUMBER'].includes(state)) {
      setAnimationState('vibrate');
      setTimeout(() => {
        setAnimationState('glow');
        setTimeout(() => setAnimationState('idle'), 1500);
      }, 500);
      setHasAnimated(true);
    } else if (state === 'OPEN' && !isOpen) {
      // Auto-open and fire confetti
      setIsOpen(true);
      setTimeout(fireConfetti, 300);
      setHasAnimated(true);
    }
  }, [state, hasAnimated, isOpen]);

  // Handle click
  const handleClick = useCallback(() => {
    if (!isClickable) return;
    
    if (state === 'TEASING') {
      // Just wiggle, don't open
      setAnimationState('curious');
      setTimeout(() => setAnimationState('idle'), 600);
      return;
    }
    
    setIsOpen(!isOpen);
    
    if (!isOpen && state === 'OPEN') {
      setTimeout(fireConfetti, 300);
    }
    
    onOpen?.();
  }, [isClickable, state, isOpen, onOpen]);

  // Get envelope color based on state
  const getEnvelopeColor = () => {
    switch (state) {
      case 'LOCKED': return 'bg-gray-100 border-gray-200';
      case 'TEASING': return 'bg-amber-50 border-amber-200';
      case 'CLUE_1':
      case 'CLUE_2': return 'bg-amber-100 border-amber-300';
      case 'STREET':
      case 'NUMBER': return 'bg-blue-50 border-blue-200';
      case 'OPEN': return 'bg-green-50 border-green-200';
      default: return 'bg-white border-gray-200';
    }
  };

  return (
    <motion.div
      className={`relative ${className}`}
      variants={envelopeVariants}
      initial="idle"
      animate={animationState}
      whileHover={isClickable ? 'hover' : undefined}
      whileTap={isClickable ? 'tap' : undefined}
      onClick={handleClick}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      {/* Envelope container */}
      <div className={`
        relative overflow-hidden rounded-xl border-2 
        ${getEnvelopeColor()}
        transition-colors duration-300
      `}>
        {/* Badge for new content */}
        {['CLUE_1', 'CLUE_2', 'STREET', 'NUMBER'].includes(state) && !isOpen && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10"
          >
            Nytt!
          </motion.div>
        )}

        {/* Envelope header (always visible) */}
        <div className="p-4 flex items-center justify-between border-b border-inherit">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getCourseEmoji(course.type)}</span>
            <div>
              <h3 className="font-semibold text-gray-800">{getCourseName(course.type)}</h3>
              <p className="text-xs text-gray-500">{getStateMessage(state, course.clues.length)}</p>
            </div>
          </div>
          
          {/* Chevron indicator */}
          {isClickable && state !== 'TEASING' && (
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-gray-400"
            >
              ▼
            </motion.span>
          )}
        </div>

        {/* Expandable content */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <EnvelopeContent 
                course={course} 
                isOpen={isOpen}
                hostSelfMessages={hostSelfMessages}
                lipsSealedMessages={lipsSealedMessages}
                mysteryHostMessages={mysteryHostMessages}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default LiveEnvelope;
