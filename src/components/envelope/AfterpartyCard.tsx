'use client';

/**
 * AfterpartyCard — Dedicated card for the afterparty in the guest live view.
 * 
 * States (progressive reveal):
 *  LOCKED      — Grey card, "Kommer efter desserten"
 *  TEASING     — Active card, "Efterfesten väntar!", countdown to ZONE
 *  STREET      — ZONE: Map with ~500m radius circle, countdown to CLOSING_IN
 *  NUMBER      — CLOSING_IN: Map with ~100m radius circle, countdown to OPEN
 *  OPEN        — Full info: exact address, door code, map link, cycling distance
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { CourseEnvelopeStatus, FullAddressReveal } from '@/types/database';

interface AfterpartyCardProps {
  envelope: CourseEnvelopeStatus;
  isPreview?: boolean;
  className?: string;
  onRefresh?: () => void;
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
    transition: { duration: 0.2 },
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ============================================
// Countdown Hook
// ============================================

function useCountdown(targetIso: string | null | undefined, onZero?: () => void) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!targetIso) { setRemaining(null); return; }
    firedRef.current = false;

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
      setRemaining(diff);
      if (diff === 0 && !firedRef.current) {
        firedRef.current = true;
        onZero?.();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso, onZero]);

  if (remaining == null) return null;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return { total: remaining, minutes: m, seconds: s, display: `${m}:${String(s).padStart(2, '0')}` };
}

// ============================================
// Zone Map Component (Mapbox Static Image + CSS circle)
// ============================================

function ZoneMap({ lat, lng, radiusM, color, label }: { lat: number; lng: number; radiusM: number; color: string; label: string }) {
  // Zoom level based on radius: 500m ≈ zoom 14, 100m ≈ zoom 16
  const zoom = radiusM >= 400 ? 14 : 16;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  
  if (!token || !lat || !lng) return null;

  const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},${zoom},0/400x250@2x?access_token=${token}`;

  return (
    <div className="relative rounded-lg overflow-hidden">
      {/* Map image */}
      <img 
        src={mapUrl} 
        alt="Ungefärlig position"
        className="w-full h-auto"
        loading="eager"
      />
      {/* Circle overlay centered on map */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div 
          className="rounded-full border-4 animate-pulse"
          style={{
            width: radiusM >= 400 ? '55%' : '50%',
            height: radiusM >= 400 ? '70%' : '65%',
            borderColor: color,
            backgroundColor: `${color}18`,
            boxShadow: `0 0 20px ${color}40`,
          }}
        />
      </div>
      {/* Label */}
      <div className="absolute bottom-2 left-2 right-2">
        <div 
          className="text-white text-xs font-medium px-2 py-1 rounded-full text-center backdrop-blur-sm"
          style={{ backgroundColor: `${color}CC` }}
        >
          📍 {label}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Countdown Display
// ============================================

function CountdownDisplay({ countdown, label }: { countdown: { display: string; total: number }; label: string }) {
  const isUrgent = countdown.total < 60;
  
  return (
    <motion.div 
      variants={itemVariants}
      className={`text-center py-2 rounded-lg ${isUrgent ? 'bg-orange-50' : 'bg-white/50'}`}
    >
      <p className={`text-xs ${isUrgent ? 'text-orange-600' : 'text-purple-500'} mb-1`}>{label}</p>
      <p className={`font-mono text-2xl font-bold ${isUrgent ? 'text-orange-700 animate-pulse' : 'text-purple-800'}`}>
        {countdown.display}
      </p>
    </motion.div>
  );
}

// ============================================
// Confetti
// ============================================

function fireAfterpartyConfetti() {
  confetti({
    particleCount: 100,
    spread: 80,
    origin: { y: 0.6, x: 0.5 },
    scalar: 1.2,
    colors: ['#FFD700', '#F472B6'],
  });
}

// ============================================
// Helpers
// ============================================

function formatAddress(address: FullAddressReveal | null): string | null {
  if (!address) return null;
  const numberPart = address.number && address.number > 0 ? ` ${address.number}` : '';
  const apartment = address.apartment ? `, ${address.apartment}` : '';
  const city = address.city ? `, ${address.city}` : '';
  const base = `${address.street}${numberPart}${apartment}${city}`.trim();
  return base || null;
}

// Visual state mapping: calculateState returns STREET/NUMBER, we show ZONE/CLOSING_IN
type VisualState = 'LOCKED' | 'TEASING' | 'ZONE' | 'CLOSING_IN' | 'OPEN';

function toVisualState(apiState: string): VisualState {
  switch (apiState) {
    case 'LOCKED': return 'LOCKED';
    case 'TEASING': return 'TEASING';
    // CLUE_1/CLUE_2 shouldn't happen for afterparty (clue fields are null)
    case 'CLUE_1':
    case 'CLUE_2':
    case 'STREET': return 'ZONE';
    case 'NUMBER': return 'CLOSING_IN';
    case 'OPEN': return 'OPEN';
    default: return 'LOCKED';
  }
}

// ============================================
// Main Component
// ============================================

export function AfterpartyCard({ envelope, isPreview = false, className = '', onRefresh }: AfterpartyCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasConfettiFired, setHasConfettiFired] = useState(false);
  const visualState = toVisualState(envelope.state);
  const isClickable = visualState !== 'LOCKED';
  const timeLabel = envelope.afterparty_time ? envelope.afterparty_time.slice(0, 5) : null;
  const addressLabel = formatAddress(envelope.full_address ?? null);
  const doorCode = envelope.full_address?.door_code ?? null;
  const hostNames = envelope.afterparty_hosts
    ? envelope.afterparty_hosts.split(',').map(name => name.trim()).filter(Boolean)
    : [];
  const cyclingMinutes = envelope.cycling_meters != null
    ? Math.round((envelope.cycling_meters / 1000) * 4)
    : null;
  const coordinates = envelope.full_address?.coordinates ?? null;

  // Zone/closing data from API
  const zoneData = (envelope as any).zone as { lat: number; lng: number; radius_m: number } | undefined;
  const closingData = (envelope as any).closing as { lat: number; lng: number; radius_m: number } | undefined;
  const nextStepAt = (envelope as any).next_step_at as string | undefined;

  // Countdown timer — triggers refetch when it hits zero
  const handleCountdownZero = useCallback(() => {
    // Quick refresh, then retry if state hasn't changed
    setTimeout(() => onRefresh?.(), 500);
    setTimeout(() => onRefresh?.(), 3000);
  }, [onRefresh]);

  const countdown = useCountdown(nextStepAt, handleCountdownZero);

  // Fire confetti on OPEN state
  useEffect(() => {
    if (visualState === 'OPEN' && !hasConfettiFired && !isPreview) {
      setIsOpen(true);
      setTimeout(fireAfterpartyConfetti, 300);
      setHasConfettiFired(true);
    }
  }, [visualState, hasConfettiFired, isPreview]);

  // Auto-open for active states
  useEffect(() => {
    if (visualState !== 'LOCKED' && !isOpen) {
      setIsOpen(true);
    }
  }, [visualState]);

  const handleClick = useCallback(() => {
    if (!isClickable) return;
    setIsOpen(!isOpen);
    if (!isOpen && visualState === 'OPEN' && !isPreview) {
      setTimeout(fireAfterpartyConfetti, 300);
    }
  }, [isClickable, isOpen, visualState, isPreview]);

  // Colors based on visual state
  const getCardColor = () => {
    switch (visualState) {
      case 'LOCKED': return 'bg-gray-100 border-gray-200';
      case 'TEASING': return 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300';
      case 'ZONE': return 'bg-gradient-to-br from-blue-50 to-purple-50 border-blue-400';
      case 'CLOSING_IN': return 'bg-gradient-to-br from-orange-50 to-pink-50 border-orange-400';
      case 'OPEN': return 'bg-gradient-to-br from-purple-100 to-pink-100 border-purple-400';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const getStateMessage = () => {
    switch (visualState) {
      case 'LOCKED': return 'Kommer efter desserten';
      case 'TEASING': return 'Kvällen är inte slut! 🎶';
      case 'ZONE': return 'Någonstans i närheten... 🗺️';
      case 'CLOSING_IN': return 'Nu närmar vi oss! 🔥';
      case 'OPEN': return 'Nu kör vi! 🥳';
      default: return '';
    }
  };

  const getStateBadge = () => {
    switch (visualState) {
      case 'TEASING': return 'Nytt!';
      case 'ZONE': return '📍 Ledtråd!';
      case 'CLOSING_IN': return '🔥 Närmare!';
      default: return null;
    }
  };

  const badge = getStateBadge();

  return (
    <motion.div
      className={`relative ${className}`}
      variants={cardVariants}
      initial="idle"
      animate={visualState === 'TEASING' || visualState === 'ZONE' || visualState === 'CLOSING_IN' ? 'pulse' : 'idle'}
      whileHover={isClickable ? 'hover' : undefined}
      whileTap={isClickable ? 'tap' : undefined}
      onClick={handleClick}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <div className={`
        relative overflow-hidden rounded-xl border-2 
        ${getCardColor()}
        transition-colors duration-300
        ${visualState === 'ZONE' ? 'shadow-lg shadow-blue-200/50' : ''}
        ${visualState === 'CLOSING_IN' ? 'shadow-xl shadow-orange-300/60 animate-pulse' : ''}
      `}>
        {/* Badge for active states */}
        {badge && !isOpen && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`absolute -top-2 -right-2 text-white text-xs font-bold px-2 py-1 rounded-full z-10 ${
              visualState === 'CLOSING_IN' ? 'bg-orange-500' : 'bg-purple-500'
            }`}
          >
            {badge}
          </motion.div>
        )}

        {/* Header (always visible) */}
        <div className="p-4 flex items-center justify-between border-b border-inherit">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎉</span>
            <div>
              <h3 className={`font-semibold ${visualState === 'LOCKED' ? 'text-gray-500' : 'text-purple-800'}`}>
                Efterfest
              </h3>
              <p className={`text-xs ${visualState === 'LOCKED' ? 'text-gray-400' : 'text-purple-600'}`}>
                {getStateMessage()}
              </p>
            </div>
          </div>

          {/* Countdown in header when collapsed */}
          {!isOpen && countdown && countdown.total > 0 && (
            <span className="font-mono text-sm text-purple-600 bg-purple-100 px-2 py-1 rounded">
              {countdown.display}
            </span>
          )}

          {/* Chevron */}
          {isClickable && !countdown?.total && (
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-purple-400"
            >
              ▼
            </motion.span>
          )}

          {/* Lock icon for LOCKED */}
          {visualState === 'LOCKED' && (
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
                {/* ==================== TEASING ==================== */}
                {visualState === 'TEASING' && (
                  <>
                    <motion.div variants={itemVariants} className="text-center py-2">
                      <p className="text-3xl mb-2">🎶</p>
                      <p className="text-purple-800 font-semibold text-lg">Kvällen är inte slut!</p>
                      {timeLabel && (
                        <p className="text-purple-600 mt-1">
                          Efterfesten börjar <span className="font-bold text-purple-800">{timeLabel}</span>
                        </p>
                      )}
                    </motion.div>

                    {envelope.afterparty_byob && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3 text-center">
                        <p className="text-purple-700 text-sm">🍷 Ta med egen dryck (BYOB)</p>
                      </motion.div>
                    )}

                    {envelope.afterparty_description && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3">
                        <p className="text-purple-700 text-sm">{envelope.afterparty_description}</p>
                      </motion.div>
                    )}

                    {envelope.afterparty_notes && (
                      <motion.div variants={itemVariants} className="text-sm text-purple-600 italic text-center">
                        {envelope.afterparty_notes}
                      </motion.div>
                    )}

                    {/* Countdown to ZONE */}
                    {countdown && countdown.total > 0 ? (
                      <CountdownDisplay countdown={countdown} label="Första ledtråden om..." />
                    ) : (
                      <motion.div variants={itemVariants} className="text-center text-sm text-purple-500">
                        📍 Första ledtråden avslöjas snart...
                      </motion.div>
                    )}
                  </>
                )}

                {/* ==================== ZONE (~500m) ==================== */}
                {visualState === 'ZONE' && (
                  <>
                    <motion.div variants={itemVariants} className="text-center py-1">
                      <p className="text-blue-800 font-semibold text-lg">Någonstans i det här området!</p>
                      {timeLabel && (
                        <p className="text-blue-600 text-sm mt-1">
                          Efterfesten börjar <span className="font-bold">{timeLabel}</span>
                        </p>
                      )}
                    </motion.div>

                    {/* Zone map */}
                    {zoneData && (
                      <motion.div variants={itemVariants}>
                        <ZoneMap
                          lat={zoneData.lat}
                          lng={zoneData.lng}
                          radiusM={zoneData.radius_m}
                          color="#3B82F6"
                          label={`Inom ${zoneData.radius_m} meter härifrån`}
                        />
                      </motion.div>
                    )}

                    {envelope.afterparty_byob && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3 text-center">
                        <p className="text-blue-700 text-sm">🍷 Ta med egen dryck (BYOB)</p>
                      </motion.div>
                    )}

                    <motion.div variants={itemVariants} className="text-center text-sm text-blue-600">
                      🚴 Ca {zoneData ? Math.max(1, Math.round(zoneData.radius_m / 250)) + '-' + Math.max(2, Math.round(zoneData.radius_m / 150)) : '2-4'} min cykel härifrån — börja röra dig!
                    </motion.div>

                    {/* Countdown to CLOSING_IN */}
                    {countdown && countdown.total > 0 && (
                      <CountdownDisplay countdown={countdown} label="Nästa ledtråd om..." />
                    )}
                  </>
                )}

                {/* ==================== CLOSING_IN (~100m) ==================== */}
                {visualState === 'CLOSING_IN' && (
                  <>
                    <motion.div variants={itemVariants} className="text-center py-1">
                      <p className="text-orange-800 font-semibold text-lg">Alldeles i närheten! 🔥</p>
                      {timeLabel && (
                        <p className="text-orange-600 text-sm mt-1">
                          Bara minuter kvar till <span className="font-bold">{timeLabel}</span>
                        </p>
                      )}
                    </motion.div>

                    {/* Closing map */}
                    {closingData && (
                      <motion.div variants={itemVariants}>
                        <ZoneMap
                          lat={closingData.lat}
                          lng={closingData.lng}
                          radiusM={closingData.radius_m}
                          color="#F97316"
                          label={`Inom ${closingData.radius_m} meter!`}
                        />
                      </motion.div>
                    )}

                    {envelope.afterparty_byob && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3 text-center">
                        <p className="text-orange-700 text-sm">🍷 Ta med egen dryck!</p>
                      </motion.div>
                    )}

                    <motion.div variants={itemVariants} className="text-center text-sm text-orange-600">
                      🚴 Mindre än 1 min cykel — du är nära!
                    </motion.div>

                    {/* Countdown to OPEN */}
                    {countdown && countdown.total > 0 && (
                      <CountdownDisplay countdown={countdown} label="Exakt adress om..." />
                    )}
                  </>
                )}

                {/* ==================== OPEN ==================== */}
                {visualState === 'OPEN' && (
                  <>
                    <motion.div variants={itemVariants} className="text-center py-2">
                      <p className="text-4xl mb-2">🥳</p>
                      <p className="text-purple-800 font-bold text-xl">Efterfesten väntar!</p>
                      {timeLabel && (
                        <p className="text-purple-600 mt-1">
                          Klockan <span className="font-bold">{timeLabel}</span>
                        </p>
                      )}
                    </motion.div>

                    {/* Address */}
                    {addressLabel && (
                      <motion.div variants={itemVariants} className="bg-white/70 rounded-lg p-4 space-y-2">
                        <p className="text-purple-900 font-bold text-lg">📍 {addressLabel}</p>
                        {hostNames.length > 0 && (
                          <p className="text-purple-700 text-sm">
                            👋 {hostNames.length === 1 ? 'Värd' : 'Värdar'}:{' '}
                            {hostNames.join(' & ')}
                          </p>
                        )}
                        {doorCode && (
                          <p className="text-purple-700 text-sm">
                            🔑 Portkod: <span className="font-mono font-bold text-purple-900">{doorCode}</span>
                          </p>
                        )}
                      </motion.div>
                    )}

                    {/* BYOB + notes */}
                    <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
                      {envelope.afterparty_byob && (
                        <span className="inline-flex items-center gap-1 bg-purple-200 text-purple-800 text-sm px-3 py-1.5 rounded-full">
                          🍷 BYOB
                        </span>
                      )}
                      {envelope.afterparty_notes && (
                        <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-sm px-3 py-1.5 rounded-full">
                          💡 {envelope.afterparty_notes}
                        </span>
                      )}
                    </motion.div>

                    {envelope.afterparty_description && (
                      <motion.div variants={itemVariants} className="bg-white/60 rounded-lg p-3">
                        <p className="text-purple-700 text-sm">{envelope.afterparty_description}</p>
                      </motion.div>
                    )}

                    {/* Cycling distance */}
                    {cyclingMinutes != null && cyclingMinutes > 0 && (
                      <motion.div variants={itemVariants} className="space-y-1">
                        <p className="text-sm font-medium text-purple-700">🚴 Cykeltid härifrån:</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-white/60 rounded p-2 text-center">
                            <p className="text-lg">🏅</p>
                            <p className="font-bold">{cyclingMinutes} min</p>
                            <p className="text-gray-500">Nykter</p>
                          </div>
                          <div className="bg-white/60 rounded p-2 text-center">
                            <p className="text-lg">🍷</p>
                            <p className="font-bold">{Math.round(cyclingMinutes * 1.5)} min</p>
                            <p className="text-gray-500">Lagom</p>
                          </div>
                          <div className="bg-white/60 rounded p-2 text-center">
                            <p className="text-lg">🥴</p>
                            <p className="font-bold">{Math.round(cyclingMinutes * 2.5)} min</p>
                            <p className="text-gray-500">Efterfest-läge</p>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Map link */}
                    {(coordinates || addressLabel) && (
                      <motion.div variants={itemVariants}>
                        <a
                          href={coordinates
                            ? `https://maps.google.com/?q=${coordinates.lat},${coordinates.lng}`
                            : `https://maps.google.com/?q=${encodeURIComponent(addressLabel!)}`
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
