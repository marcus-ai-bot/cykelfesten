'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { MealGroup, CourseConfig } from './types';

/** Haversine between two [lng,lat] points */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface Props {
  group: MealGroup;
  cfg: CourseConfig;
  courseName: string;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  groupIndex: number;
  groupTotal: number;
}

export function MealGroupCard(props: Props) {
  return (
    <>
      <div className="hidden md:block absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-180px)] overflow-y-auto">
        <FullCard {...props} />
      </div>
      <MobileDrawer {...props} />
    </>
  );
}

/* ── Mobile Drawer ──────────────────────────────── */

const PEEK_HEIGHT = 96;
const SNAP_THRESHOLD = 40;

function MobileDrawer(props: Props) {
  const { group, cfg, onClose } = props;
  const [expanded, setExpanded] = useState(false);
  const [pulsed, setPulsed] = useState(false);

  // Direct DOM refs for buttery-smooth dragging
  const drawerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const expandedRef = useRef(false);

  // Keep ref in sync
  expandedRef.current = expanded;

  // Reset on new group
  useEffect(() => {
    setPulsed(false);
    setExpanded(false);
    const t = setTimeout(() => setPulsed(true), 100);
    return () => clearTimeout(t);
  }, [group.hostId]);

  // Touch handling directly on DOM for zero-lag
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    function onTouchStart(e: TouchEvent) {
      isDraggingRef.current = true;
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = 0;
      if (drawerRef.current) {
        drawerRef.current.style.transition = 'none';
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isDraggingRef.current) return;
      e.preventDefault(); // Prevent scroll
      const dy = e.touches[0].clientY - startYRef.current;
      currentYRef.current = dy;

      if (drawerRef.current) {
        if (expandedRef.current) {
          // When expanded: only allow dragging down (positive dy)
          const clampedDy = Math.max(0, dy);
          drawerRef.current.style.transform = `translateY(${clampedDy}px)`;
        } else {
          // When peeking: allow drag up (negative dy shows more) and down (positive hides)
          // Clamp so we don't drag above fully expanded
          const maxUp = -(window.innerHeight * 0.8 - PEEK_HEIGHT);
          const clampedDy = Math.max(maxUp, dy);
          drawerRef.current.style.transform = `translateY(calc(100% - ${PEEK_HEIGHT}px + ${clampedDy}px))`;
        }
      }
    }

    function onTouchEnd() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const dy = currentYRef.current;

      if (drawerRef.current) {
        drawerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
      }

      if (expandedRef.current) {
        if (dy > SNAP_THRESHOLD) {
          // Swipe down from expanded → collapse to peek
          setExpanded(false);
        } else {
          // Snap back to expanded
          if (drawerRef.current) drawerRef.current.style.transform = 'translateY(0)';
        }
      } else {
        if (dy < -SNAP_THRESHOLD) {
          // Swipe up from peek → expand
          setExpanded(true);
        } else if (dy > SNAP_THRESHOLD * 2) {
          // Big swipe down from peek → close
          onClose();
        } else {
          // Snap back to peek
          if (drawerRef.current) {
            drawerRef.current.style.transform = `translateY(calc(100% - ${PEEK_HEIGHT}px))`;
          }
        }
      }
    }

    handle.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      handle.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onClose]);

  // Snap to correct position when expanded state changes (from tap or swipe)
  useEffect(() => {
    if (!drawerRef.current) return;
    drawerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
    if (expanded) {
      drawerRef.current.style.transform = 'translateY(0)';
    } else {
      drawerRef.current.style.transform = `translateY(calc(100% - ${PEEK_HEIGHT}px))`;
    }
  }, [expanded]);

  return (
    <div
      ref={drawerRef}
      className="md:hidden fixed bottom-0 left-0 right-0 z-20"
      style={{
        transform: `translateY(calc(100% - ${PEEK_HEIGHT}px))`,
        transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Backdrop when expanded */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/20 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}

      <div className="bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 max-h-[80vh] flex flex-col">
        {/* Drag handle — touch target */}
        <div
          ref={handleRef}
          className="flex flex-col items-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <div className={`w-10 h-1.5 rounded-full bg-gray-300 ${
            pulsed ? 'animate-pulse-once' : ''
          }`} />
        </div>

        {/* Peek content — always visible */}
        <div
          className="px-5 py-2 flex items-center justify-between"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">{cfg.emoji}</span>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 text-sm truncate">
                Hos {group.hostName}
              </div>
              <div className="text-xs text-gray-500">
                {group.totalPeople} pers · {group.guests.length} gästpar · {cfg.time}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-gray-400 text-xs transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              ▲
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              aria-label="Stäng"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Expanded content — scrollable */}
        <div className={`overflow-y-auto overscroll-contain transition-all duration-300 ease-out ${
          expanded ? 'max-h-[calc(80vh-96px)] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}>
          <ExpandedContent {...props} />
        </div>
      </div>
    </div>
  );
}

/* ── Expanded content (shared) ────────────────────── */

function ExpandedContent({ group, cfg, onPrev, onNext, groupIndex, groupTotal }: Props) {
  const [direction, setDirection] = useState<'from' | 'to'>('from');
  const allAllergies = [
    ...group.hostAllergies,
    ...group.guests.flatMap((g) => g.allergies),
  ].filter(Boolean);
  const uniqueAllergies = [...new Set(allAllergies)];

  const hasNextData = group.guests.some((g) => g.toAddress);

  return (
    <>
      {/* Host */}
      <div className="px-5 py-3 border-t border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm mt-0.5" style={{ backgroundColor: cfg.color }}>
            🏠
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{group.hostName}</div>
            <div className="text-xs text-gray-500 mt-0.5">{group.hostAddress}</div>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white mt-1 inline-block" style={{ backgroundColor: cfg.color }}>
              Värd · {group.totalPeople} pers
            </span>
            {direction === 'to' && group.hostNextHostName && (
              <div className="text-xs text-gray-500 mt-1">
                → Ska till {group.hostNextHostName}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Direction toggle */}
      {hasNextData && (
        <div className="px-5 py-2 border-t border-gray-50">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setDirection('from')}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                direction === 'from'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ← Kommer från
            </button>
            <button
              onClick={() => setDirection('to')}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                direction === 'to'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Ska till →
            </button>
          </div>
        </div>
      )}

      {/* Guests */}
      <div className="px-5 py-3">
        {direction === 'from' ? (
          <>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              🚲 {group.guests[0]?.fromHostName ? 'Cyklar hit från föregående rätt' : 'Cyklar hit hemifrån'} ({group.guests.length} par)
            </div>
            <div className="space-y-2.5">
              {group.guests.map((guest) => {
                const routeDist = guest.routeDistanceKm;
                const birdDist = haversineKm(guest.fromCoords, group.hostCoords);
                const dist = routeDist ?? birdDist;
                const isRoute = routeDist != null;
                const minutes = Math.round(dist / 0.25);
                const fromLabel = guest.fromHostName
                  ? `Från ${guest.fromHostName.split(' & ')[0]}`
                  : 'Hemifrån';
                return (
                  <div key={guest.id} className="flex items-start gap-3 py-1">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs mt-0.5 shrink-0">
                      🚲
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{guest.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {fromLabel} · {guest.fromAddress}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {dist < 0.1 ? '< 100 m' : `${dist.toFixed(1)} km`}
                        {isRoute ? ' cykelväg' : ' fågelvägen'}
                        {' · ~'}{Math.max(1, minutes)} min
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              🚲 Cyklar härifrån till nästa rätt ({group.guests.length} par)
            </div>
            <div className="space-y-2.5">
              {group.guests.map((guest) => {
                const dist = guest.toDistanceKm;
                const toLabel = guest.toHostName
                  ? `Till ${guest.toHostName.split(' & ')[0]}`
                  : 'Hem';
                const minutes = dist ? Math.round(dist / 0.25) : null;
                return (
                  <div key={guest.id} className="flex items-start gap-3 py-1">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs mt-0.5 shrink-0">
                      🚲
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{guest.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {toLabel}{guest.toAddress ? ` · ${guest.toAddress}` : ''}
                      </div>
                      {dist != null && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {dist < 0.1 ? '< 100 m' : `${dist.toFixed(1)} km`} fågelvägen
                          {minutes ? ` · ~${Math.max(1, minutes)} min` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {group.guests.length === 0 && (
          <div className="text-xs text-gray-400 italic py-2">Inga gäster tilldelade</div>
        )}
      </div>

      {/* Allergies */}
      {uniqueAllergies.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-50 bg-red-50/50">
          <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1.5">
            ⚠️ Allergier i gruppen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {uniqueAllergies.map((a) => (
              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition px-2 py-1 rounded hover:bg-gray-50"
        >
          ← Föregående
        </button>
        <span className="text-xs text-gray-400">
          {groupIndex + 1} / {groupTotal}
        </span>
        <button
          onClick={onNext ?? undefined}
          disabled={!onNext}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition px-2 py-1 rounded hover:bg-gray-50"
        >
          Nästa →
        </button>
      </div>
    </>
  );
}

/* ── Full Card (Desktop) ─────────────────────────── */

function FullCard(props: Props) {
  const { group, cfg, courseName, onClose } = props;

  return (
    <div className="bg-white shadow-xl border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: `${cfg.color}08` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{cfg.emoji}</span>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: cfg.color }}>
                {courseName} · {cfg.time}
              </div>
              <div className="font-semibold text-gray-900 text-sm mt-0.5">
                Hos {group.hostName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>
      </div>
      <ExpandedContent {...props} />
    </div>
  );
}
