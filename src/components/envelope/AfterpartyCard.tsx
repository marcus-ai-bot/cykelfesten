'use client';

/**
 * AfterpartyCard — Dedicated card for the afterparty in the guest live view.
 * 
 * States:
 *  LOCKED   — Grey card, "Kommer efter desserten"
 *  TEASING  — Active card with time, BYOB info, anticipation
 *  REVEALED — Full info: address, door code, map link, cycling distance
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { AfterpartyStatus, AfterpartyState } from '@/types/database';

interface AfterpartyCardProps {
  afterparty: AfterpartyStatus;
  isPreview?: boolean;
  className?: string;
}

// ============================================
// Animation Variants
// ============================================

const cardVariants: Variants = {
  idle: { 
    scale: 1, 
    rotate: 0,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  pulse: {
    scale: [1, 1.01, 1],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
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
// Confetti for reveal
// ============================================

function fireAfterpartyConfetti() {
  const count = 150;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 1000,
  };

  // Purple/pink themed confetti
  confetti({
    ...defaults,
    particleCount: Math.floor(count * 0.3),
    spread: 60,
    startVelocity: 55,
    colors: ['#A855F7', '#EC4899', '#F472B6'],
  });
  confetti({
    ...defaults,
    particleCount: Math.floor(count * 0.3),
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#A855F7', '#EC4899', '#F472B6', '#FFD700'],
  });
  confetti({
    ...defaults,
    particleCount: Math.floor(count * 0.2),
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    colors: ['#FFD700', '#F472B6'],
  });
}

// ============================================
// Main Component
// ============================================

export function AfterpartyCard({ afterparty, isPreview = false, className = '' }: AfterpartyCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasConfettiFired, setHasConfettiFired] = useState(false);
  const state = afterparty.state;
  const isClickable = state !== 'LOCKED';

  // Fire confetti on REVEALED state
  useEffect(() => {
    if (state === 'REVEALED' && !hasConfettiFired && !isPreview) {
      setIsOpen(true);
      setTimeout(fireAfterpartyConfetti, 300);
      setHasConfettiFired(true);
    }
  }, [state, hasConfettiFired, isPreview]);

  // Auto-open for TEASING
  useEffect(() => {
    if (state === 'TEASING' && !isOpen) {
      setIsOpen(true);
    }
  }, [state]);

  const handleClick = useCallback(() => {
    if (!isClickable) return;
    setIsOpen(!isOpen);
    if (!isOpen && state === 'REVEALED' && !isPreview) {
      setTimeout(fireAfterpartyConfetti, 300);
    }
  }, [isClickable, isOpen, state, isPreview]);

  // Colors based on state
  const getCardColor = () => {
    switch (state) {
      case 'LOCKED': return 'bg-gray-100 border-gray-200';
      case 'TEASING': return 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300';
      case 'REVEALED': return 'bg-gradient-to-br from-purple-100 to-pink-100 border-purple-400';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const getStateMessage = () => {
    switch (state) {
      case 'LOCKED': return 'Kommer efter desserten';
      case 'TEASING': return 'Kvällen är inte slut! 🎶';
      case 'REVEALED': return 'Nu kör vi! 🥳';
      default: return '';
    }
  };

  return (
    <motion.div
      className={`relative ${className}`}
      variants={cardVariants}
      initial="idle"
      animate={state === 'TEASING' ? 'pulse' : 'idle'}
      whileHover={isClickable ? 'hover' : undefined}
      whileTap={isClickable ? 'tap' : undefined}
      onClick={handleClick}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <div className={`
        relative overflow-hidden rounded-xl border-2 
        ${getCardColor()}
        transition-colors duration-300
      `}>
        {/* "Nytt!" badge for TEASING */}
        {state === 'TEASING' && !isOpen && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10"
          >
            Nytt!
          </motion.div>
        )}

        {/* Header (always visible) */}
        <div className="p-4 flex items-center justify-between border-b border-inherit">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎉</span>
            <div>
              <h3 className={`font-semibold ${state === 'LOCKED' ? 'text-gray-500' : 'text-purple-800'}`}>
                Efterfest
              </h3>
              <p className={`text-xs ${state === 'LOCKED' ? 'text-gray-400' : 'text-purple-600'}`}>
                {getStateMessage()}
              </p>
            </div>
          </div>

          {/* Chevron */}
          {isClickable && (
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-purple-400"
            >
              ▼
            </motion.span>
          )}

          {/* Lock icon for LOCKED */}
          {state === 'LOCKED' && (
            <span className="text-gray-400 text-lg">🔒</span>
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
              <motion.div
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="p-4 space-y-3"
              >
                {/* TEASING content */}
                {state === 'TEASING' && (
                  <>
                    <motion.div variants={itemVariants} className="text-center py-2">
                      <p className="text-3xl mb-2">🎶</p>
                      <p className="text-purple-800 font-semibold text-lg">Kvällen är inte slut!</p>
                      {afterparty.time && (
                        <p className="text-purple-600 mt-1">
                          Efterfesten börjar <span className="font-bold text-purple-800">{afterparty.time}</span>
                        </p>
                      )}
                    </motion.div>

                    {afterparty.byob && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3 text-center">
                        <p className="text-purple-700 text-sm">🍷 Ta med egen dryck (BYOB)</p>
                      </motion.div>
                    )}

                    {afterparty.description && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3">
                        <p className="text-purple-700 text-sm">{afterparty.description}</p>
                      </motion.div>
                    )}

                    {afterparty.notes && (
                      <motion.div variants={itemVariants} className="text-sm text-purple-600 italic text-center">
                        {afterparty.notes}
                      </motion.div>
                    )}

                    <motion.div variants={itemVariants} className="text-center text-sm text-purple-500">
                      📍 Adressen avslöjas snart...
                    </motion.div>
                  </>
                )}

                {/* REVEALED content */}
                {state === 'REVEALED' && (
                  <>
                    <motion.div variants={itemVariants} className="text-center py-2">
                      <p className="text-4xl mb-2">🥳</p>
                      <p className="text-purple-800 font-bold text-xl">Efterfesten väntar!</p>
                      {afterparty.time && (
                        <p className="text-purple-600 mt-1">
                          Klockan <span className="font-bold">{afterparty.time}</span>
                        </p>
                      )}
                    </motion.div>

                    {/* Address */}
                    {afterparty.location && (
                      <motion.div variants={itemVariants} className="bg-white/70 rounded-lg p-4 space-y-2">
                        <p className="text-purple-900 font-bold text-lg">📍 {afterparty.location}</p>
                        {afterparty.host_names.length > 0 && (
                          <p className="text-purple-700 text-sm">
                            👋 {afterparty.host_names.length === 1 ? 'Värd' : 'Värdar'}:{' '}
                            {afterparty.host_names.join(' & ')}
                          </p>
                        )}
                        {afterparty.door_code && (
                          <p className="text-purple-700 text-sm">
                            🔑 Portkod: <span className="font-mono font-bold text-purple-900">{afterparty.door_code}</span>
                          </p>
                        )}
                      </motion.div>
                    )}

                    {/* BYOB + notes */}
                    <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
                      {afterparty.byob && (
                        <span className="inline-flex items-center gap-1 bg-purple-200 text-purple-800 text-sm px-3 py-1.5 rounded-full">
                          🍷 BYOB
                        </span>
                      )}
                      {afterparty.notes && (
                        <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-sm px-3 py-1.5 rounded-full">
                          💡 {afterparty.notes}
                        </span>
                      )}
                    </motion.div>

                    {afterparty.description && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3">
                        <p className="text-purple-700 text-sm">{afterparty.description}</p>
                      </motion.div>
                    )}

                    {/* Cycling distance */}
                    {afterparty.cycling_minutes_from_dessert != null && afterparty.cycling_minutes_from_dessert > 0 && (
                      <motion.div variants={itemVariants} className="space-y-1">
                        <p className="text-sm font-medium text-purple-700">🚴 Cykeltid härifrån:</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-white/60 rounded p-2 text-center">
                            <p className="text-lg">🏅</p>
                            <p className="font-bold">{afterparty.cycling_minutes_from_dessert} min</p>
                            <p className="text-gray-500">Nykter</p>
                          </div>
                          <div className="bg-white/60 rounded p-2 text-center">
                            <p className="text-lg">🍷</p>
                            <p className="font-bold">{Math.round(afterparty.cycling_minutes_from_dessert * 1.5)} min</p>
                            <p className="text-gray-500">Lagom</p>
                          </div>
                          <div className="bg-white/60 rounded p-2 text-center">
                            <p className="text-lg">🥴</p>
                            <p className="font-bold">{Math.round(afterparty.cycling_minutes_from_dessert * 2.5)} min</p>
                            <p className="text-gray-500">Efterfest-läge</p>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Map link */}
                    {(afterparty.coordinates || afterparty.location) && (
                      <motion.div variants={itemVariants}>
                        <a
                          href={afterparty.coordinates
                            ? `https://maps.google.com/?q=${afterparty.coordinates.lat},${afterparty.coordinates.lng}`
                            : `https://maps.google.com/?q=${encodeURIComponent(afterparty.location!)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full text-center bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🗺️ Öppna i kartan
                        </a>
                      </motion.div>
                    )}
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default AfterpartyCard;
