'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EnvelopeProps {
  course: 'starter' | 'main' | 'dessert';
  scheduledAt: string;
  activatedAt: string | null;
  openedAt: string | null;
  address: string;
  addressNotes?: string | null;
  isHost: boolean;
  onOpen?: () => void;
}

const courseLabels = {
  starter: { emoji: '🥗', label: 'Förrätt' },
  main: { emoji: '🍖', label: 'Huvudrätt' },
  dessert: { emoji: '🍰', label: 'Efterrätt' },
};

export function Envelope({ 
  course, 
  scheduledAt, 
  activatedAt, 
  openedAt,
  address,
  addressNotes,
  isHost,
  onOpen 
}: EnvelopeProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [isOpen, setIsOpen] = useState(!!openedAt);
  
  const now = new Date();
  const scheduled = new Date(scheduledAt);
  const isActivated = activatedAt || now >= scheduled;
  
  const { emoji, label } = courseLabels[course];
  
  const handleClick = () => {
    if (!isActivated || isOpen || isOpening) return;
    
    setIsOpening(true);
    onOpen?.();
    
    setTimeout(() => {
      setIsOpen(true);
      setIsOpening(false);
    }, 1500);
  };
  
  // Time until activation
  const msUntil = scheduled.getTime() - now.getTime();
  const hoursUntil = Math.max(0, Math.floor(msUntil / (1000 * 60 * 60)));
  const minutesUntil = Math.max(0, Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60)));
  
  return (
    <div className="relative">
      {/* Envelope container */}
      <motion.div
        className={`relative cursor-pointer select-none ${!isActivated ? 'opacity-70' : ''}`}
        onClick={handleClick}
        whileHover={isActivated && !isOpen ? { scale: 1.02 } : {}}
        whileTap={isActivated && !isOpen ? { scale: 0.98 } : {}}
      >
        {/* Closed envelope */}
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              className="bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl p-6 shadow-lg border-2 border-amber-300"
              initial={{ opacity: 1 }}
              exit={{ 
                rotateX: -180,
                opacity: 0,
                transition: { duration: 0.8 }
              }}
            >
              {/* Envelope flap */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-amber-200 to-amber-100 rounded-t-xl"
                style={{ 
                  clipPath: 'polygon(0 0, 50% 100%, 100% 0)',
                  transformOrigin: 'top center',
                }}
                animate={isOpening ? { rotateX: 180 } : {}}
                transition={{ duration: 0.5 }}
              />
              
              {/* Seal */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shadow-md z-10">
                <span className="text-2xl">{emoji}</span>
              </div>
              
              {/* Content preview */}
              <div className="mt-12 text-center">
                <div className="text-xl font-semibold text-amber-900 mb-2">{label}</div>
                
                {!isActivated ? (
                  <div className="text-amber-700">
                    <div className="text-sm mb-1">Öppnas om</div>
                    <div className="text-2xl font-mono font-bold">
                      {hoursUntil}h {minutesUntil}m
                    </div>
                  </div>
                ) : (
                  <motion.div 
                    className="text-amber-600"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    ✨ Tryck för att öppna ✨
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Opened envelope content */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="bg-white rounded-xl p-6 shadow-lg border-2 border-amber-300"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <div className="text-center mb-4">
                <span className="text-4xl">{emoji}</span>
                <h3 className="text-xl font-semibold text-amber-900 mt-2">{label}</h3>
              </div>
              
              {isHost ? (
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-green-700 font-medium mb-1">🏠 Du är värd!</div>
                  <div className="text-green-600 text-sm">Dina gäster kommer hem till dig</div>
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 rounded-lg p-4 mb-4">
                    <div className="text-sm text-amber-600 mb-1">📍 Adress</div>
                    <div className="text-lg font-medium text-amber-900">{address}</div>
                    {addressNotes && (
                      <div className="text-sm text-amber-700 mt-2">{addressNotes}</div>
                    )}
                  </div>
                  
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-amber-500 hover:bg-amber-600 text-white text-center py-3 rounded-lg font-medium transition-colors"
                  >
                    🗺️ Öppna i Google Maps
                  </a>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Opening animation overlay */}
      <AnimatePresence>
        {isOpening && (
          <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-8xl"
              animate={{ 
                scale: [1, 1.5, 1],
                rotate: [0, 10, -10, 0],
              }}
              transition={{ duration: 1.5 }}
            >
              {emoji}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
