'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import StatusDropdown from '@/components/organizer/StatusDropdown';
import { HamburgerMenu } from '@/components/organizer/HamburgerMenu';
import { PhaseContent } from '@/components/organizer/PhaseContent';

interface Props {
  eventId: string;
  eventSlug: string;
  eventName: string;
  shortDate: string;
  eventStatus: string;
  couplesCount: number;
  isPast: boolean;
  isToday: boolean;
  hasMatching: boolean;
}

const PHASE_KEYS = ['invite', 'dinner', 'after'];
const PHASE_LABELS: Record<string, string> = { invite: 'Inbjudan', dinner: 'Middag', after: 'Efteråt' };
const PHASE_ICONS: Record<string, string> = { invite: '📨', dinner: '🍽️', after: '🌅' };

export function EventDashboard({
  eventId, eventSlug, eventName, shortDate, eventStatus,
  couplesCount, isPast, isToday, hasMatching,
}: Props) {
  const defaultPhase = useMemo(() => {
    if (isPast || eventStatus === 'completed') return 'after';
    if (isToday || eventStatus === 'active') return 'dinner';
    if (eventStatus === 'matched' || eventStatus === 'locked') return 'dinner';
    return 'invite';
  }, [eventStatus, isPast, isToday]);

  const [activePhase, setActivePhase] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('phase');
      if (p && PHASE_KEYS.includes(p)) return p;
    }
    return defaultPhase;
  });

  // URL sync
  function changePhase(phase: string) {
    setActivePhase(phase);
    const params = new URLSearchParams(window.location.search);
    if (phase === defaultPhase) params.delete('phase');
    else params.set('phase', phase);
    const query = params.toString();
    window.history.pushState(null, '', `${window.location.pathname}${query ? '?' + query : ''}`);
  }

  useEffect(() => {
    function onPopState() {
      const p = new URLSearchParams(window.location.search).get('phase');
      setActivePhase(p && PHASE_KEYS.includes(p) ? p : defaultPhase);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [defaultPhase]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">{PHASE_ICONS[activePhase]}</span>
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{eventName}</h1>
              <span className="text-sm text-gray-400 shrink-0 hidden sm:inline">— {shortDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusDropdown eventId={eventId} currentStatus={eventStatus} />
            <HamburgerMenu
              eventId={eventId}
              eventSlug={eventSlug}
              activePhase={activePhase}
              onPhaseChange={changePhase}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <PhaseContent
            phase={activePhase}
            eventId={eventId}
            eventSlug={eventSlug}
            eventStatus={eventStatus}
            couplesCount={couplesCount}
            hasMatching={hasMatching}
            isPast={isPast}
          />
        </div>
      </main>
    </div>
  );
}
