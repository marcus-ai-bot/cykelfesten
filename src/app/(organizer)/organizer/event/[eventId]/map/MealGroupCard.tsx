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

/* ── Desktop Card ───────────────────────────────── */

export function MealGroupCard(props: Props) {
  return (
    <>
      {/* Desktop: left panel */}
      <div className="hidden md:block absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-180px)] overflow-y-auto">
        <FullCard {...props} />
      </div>
      {/* Mobile: bottom drawer */}
      <MobileDrawer {...props} />
    </>
  );
}

/* ── Mobile Drawer with peek + swipe ────────────── */

const PEEK_HEIGHT = 96; // px shown in peek state
const SNAP_THRESHOLD = 60; // px drag to trigger snap

function MobileDrawer(props: Props) {
  const { group, cfg, onClose } = props;
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [pulsed, setPulsed] = useState(false);
  const startY = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Pulse animation on mount
  useEffect(() => {
    setPulsed(false);
    setExpanded(false);
    const t = setTimeout(() => setPulsed(true), 100);
    return () => clearTimeout(t);
  }, [group.hostId]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setDragging(true);
    setDragY(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY.current;
    setDragY(dy);
  }, [dragging]);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    if (!expanded && dragY < -SNAP_THRESHOLD) {
      // Swipe up → expand
      setExpanded(true);
    } else if (expanded && dragY > SNAP_THRESHOLD) {
      // Swipe down → collapse or close
      setExpanded(false);
    } else if (!expanded && dragY > SNAP_THRESHOLD) {
      // Swipe down from peek → close
      onClose();
    }
    setDragY(0);
  }, [expanded, dragY, onClose]);

  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 z-20 transition-transform ${
        dragging ? 'duration-0' : 'duration-300 ease-out'
      }`}
      style={{
        transform: expanded
          ? `translateY(${Math.max(0, dragY)}px)`
          : `translateY(calc(100% - ${PEEK_HEIGHT}px + ${Math.min(0, dragY)}px))`,
      }}
    >
      {/* Backdrop when expanded */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/20 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        ref={contentRef}
        className="bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 max-h-[80vh] flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
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
            <span className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
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

        {/* Expanded content */}
        <div className={`overflow-y-auto transition-all duration-300 ${
          expanded ? 'max-h-[calc(80vh-96px)] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <ExpandedContent {...props} />
        </div>
      </div>
    </div>
  );
}

/* ── Expanded content (shared between mobile expanded + desktop) ── */

function ExpandedContent({ group, cfg, onPrev, onNext, groupIndex, groupTotal }: Props) {
  const allAllergies = [
    ...group.hostAllergies,
    ...group.guests.flatMap((g) => g.allergies),
  ].filter(Boolean);
  const uniqueAllergies = [...new Set(allAllergies)];

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
          </div>
        </div>
      </div>

      {/* Guests */}
      <div className="px-5 py-3">
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
          {group.guests.length === 0 && (
            <div className="text-xs text-gray-400 italic py-2">Inga gäster tilldelade</div>
          )}
        </div>
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
      {/* Header */}
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
