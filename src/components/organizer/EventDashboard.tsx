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

const VIEW_KEYS = ['invite', 'matching', 'live', 'after'];
const VIEW_LABELS: Record<string, string> = { invite: 'Inbjudan', matching: 'Matchning & Kuvert', live: 'Live', after: 'Efteråt' };
const VIEW_ICONS: Record<string, string> = { invite: '📨', matching: '🍽️', live: '🔴', after: '🎉' };

export function EventDashboard({
  eventId, eventSlug, eventName, shortDate, eventStatus,
  couplesCount, isPast, isToday, hasMatching,
}: Props) {
  const defaultView = useMemo(() => {
    if (isPast || eventStatus === 'completed') return 'after';
    if (isToday || eventStatus === 'active') return 'live';
    if (eventStatus === 'matched' || eventStatus === 'locked') return 'matching';
    return 'invite';
  }, [eventStatus, isPast, isToday]);

  const [activeView, setActiveView] = useState(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v && VIEW_KEYS.includes(v)) return v;
    }
    return defaultView;
  });

  // URL sync
  function changeView(view: string) {
    setActiveView(view);
    const params = new URLSearchParams(window.location.search);
    if (view === defaultView) params.delete('view');
    else params.set('view', view);
    const query = params.toString();
    window.history.pushState(null, '', `${window.location.pathname}${query ? '?' + query : ''}`);
  }

  useEffect(() => {
    function onPopState() {
      const v = new URLSearchParams(window.location.search).get('view');
      setActiveView(v && VIEW_KEYS.includes(v) ? v : defaultView);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [defaultView]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">{VIEW_ICONS[activeView]}</span>
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
              activePhase={activeView}
              onPhaseChange={changeView}
            />
          </div>
        </div>
      </header>

      {/* Sticky view title bar */}
      <div className="sticky top-[53px] z-30 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-700">
            {VIEW_ICONS[activeView]} {VIEW_LABELS[activeView]}
          </h2>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <PhaseContent
            phase={activeView}
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
