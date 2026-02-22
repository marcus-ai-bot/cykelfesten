'use client';

import { useRouter } from 'next/navigation';
import { HamburgerMenu } from '@/components/organizer/HamburgerMenu';

interface Props {
  eventId: string;
  title: string;
  /** Which view this sub-page belongs to (for hamburger highlight) */
  parentView?: 'invite' | 'matching' | 'live' | 'after';
}

export function SubPageHeader({ eventId, title, parentView }: Props) {
  const router = useRouter();

  function handleViewChange(view: string) {
    router.push(`/organizer/event/${eventId}?view=${view}`);
  }

  return (
    <header className="bg-white border-b sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-700 transition shrink-0"
            aria-label="Tillbaka"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10H5M5 10l5-5M5 10l5 5" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
        </div>
        <HamburgerMenu
          eventId={eventId}
          activePhase={parentView}
          onPhaseChange={handleViewChange}
        />
      </div>
    </header>
  );
}
