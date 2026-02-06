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

interface LiveEnvelopeProps {
  course: CourseEnvelopeStatus;
  onOpen?: () => void;
  className?: string;
}

interface EnvelopeContentProps {
  course: CourseEnvelopeStatus;
  isOpen: boolean;
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

function getStateMessage(state: EnvelopeState): string {
  switch (state) {
    case 'LOCKED': return 'Kommer snart...';
    case 'TEASING': return 'Nyfiken? 🤫';
    case 'CLUE_1': return 'En ledtråd!';
    case 'CLUE_2': return 'Ännu en ledtråd!';
    case 'STREET': return 'Nu vet du gatan!';
    case 'NUMBER': return 'Snart framme!';
    case 'OPEN': return 'Välkommen!';
    default: return '';
  }
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

function EnvelopeContent({ course, isOpen }: EnvelopeContentProps) {
  const state = course.state;
  
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

      {/* Street info */}
      {course.street && (
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
              👋 Värdar:{' '}
              {course.host_names.map((name, i) => (
                <span key={i}>
                  {i > 0 && ' & '}
                  <span className="font-bold text-green-800">{name}</span>
                </span>
              ))}
            </p>
          )}
          {course.full_address.coordinates && (
            <a
              href={`https://maps.google.com/?q=${course.full_address.coordinates.lat},${course.full_address.coordinates.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 underline"
            >
              🗺️ Öppna i kartan
            </a>
          )}
        </motion.div>
      )}

      {/* Next reveal countdown */}
      {course.next_reveal && (
        <motion.div variants={itemVariants} className="text-center text-sm text-gray-500">
          ⏱️ Nästa: {getStateMessage(course.next_reveal.type)} om{' '}
          <span className="font-medium">{formatCountdown(course.next_reveal.in_seconds)}</span>
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

export function LiveEnvelope({ course, onOpen, className = '' }: LiveEnvelopeProps) {
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
              <p className="text-xs text-gray-500">{getStateMessage(state)}</p>
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
              <EnvelopeContent course={course} isOpen={isOpen} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default LiveEnvelope;
