'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Props {
  eventId: string;
  eventSlug?: string;
  activePhase?: string;
  onPhaseChange?: (phase: string) => void;
}

const VIEWS = [
  { key: 'invite', icon: '📨', label: 'Inbjudan' },
  { key: 'matching', icon: '🍽️', label: 'Matchning & Kuvert' },
  { key: 'live', icon: '🔴', label: 'Live' },
  { key: 'after', icon: '🎉', label: 'Efteråt' },
];

export function HamburgerMenu({ eventId, eventSlug, activePhase, onPhaseChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-gray-700"
        aria-label="Meny"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 max-h-[70vh] overflow-y-auto">
          {/* Phase navigation */}
          {onPhaseChange && (
            <>
              {VIEWS.map(view => (
                <button
                  key={view.key}
                  onClick={() => { onPhaseChange(view.key); setOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm w-full text-left transition ${
                    activePhase === view.key
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{view.icon}</span> {view.label}
                </button>
              ))}
              <div className="border-t border-gray-100 my-1" />
            </>
          )}

          {/* Tools */}
          <Link
            href={`/organizer/event/${eventId}/settings`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <span>⚙️</span> Inställningar
          </Link>
          <Link
            href={`/organizer/event/${eventId}/preview`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <span>👁️</span> Gästperspektiv
          </Link>
          <div className="border-t border-gray-100 my-1" />
          <Link
            href="/organizer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition"
          >
            ← Alla fester
          </Link>
        </div>
      )}
    </div>
  );
}
