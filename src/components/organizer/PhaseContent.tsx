'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InviteLinkSection } from '@/components/organizer/InviteLinkSection';
import { InlineGuestList } from '@/components/organizer/InlineGuestList';

interface Props {
  phase: string;
  eventId: string;
  eventSlug: string;
  eventStatus: string;
  couplesCount: number;
  hasMatching: boolean;
  isPast: boolean;
}

export function PhaseContent({ phase, eventId, eventSlug, eventStatus, couplesCount, hasMatching, isPast }: Props) {
  const isEventLocked = eventStatus === 'locked' || eventStatus === 'active' || eventStatus === 'completed';
  const isInviteOpen = eventStatus === 'draft' || eventStatus === 'open';

  switch (phase) {
    case 'invite':
      return (
        <div className="space-y-6">
          {(eventStatus === 'matched' || eventStatus === 'locked') && (
            <InviteLockedBanner eventId={eventId} />
          )}
          {isInviteOpen && <InviteLinkSection eventId={eventId} />}
          <InlineGuestList eventId={eventId} />
        </div>
      );

    case 'dinner': {
      const isActive = eventStatus === 'active';
      // Workflow: Matchning → Kuvert & Timing → Live-karta
      const matchingStatus: StepStatus = hasMatching ? 'done' : isEventLocked ? 'locked' : 'active';
      const envelopeStatus: StepStatus = isActive ? 'done' : hasMatching ? 'active' : 'todo';
      const mapStatus: StepStatus = isActive ? 'active' : 'todo';

      return (
        <div className="space-y-4">
          <ActionCard
            href={`/organizer/event/${eventId}/matching`}
            title={isEventLocked ? 'Matchning 🔒' : 'Matchning'}
            description={isEventLocked ? 'Ändra status för att låsa upp' : 'Koppla ihop gäster med värdar'}
            icon="🔀"
            disabled={isEventLocked}
            step={matchingStatus}
          />
          <ActionCard
            href={`/organizer/event/${eventId}/envelopes`}
            title="Kuvert & Timing"
            description="Tider, reveals, texter och utskick"
            icon="✉️"
            disabled={!hasMatching}
            step={envelopeStatus}
          />
          <ActionCard
            href={`/organizer/event/${eventId}/map`}
            title="Live-karta"
            description="Följ middagen i realtid"
            icon="🗺️"
            disabled={!hasMatching}
            step={mapStatus}
          />
        </div>
      );
    }

    case 'after':
      return (
        <div className="space-y-6">
          {!isPast && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              ⏳ Dessa funktioner blir tillgängliga efter eventet. Du kan förbereda redan nu.
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-6">
            <ActionCard
              href={`/organizer/event/${eventId}/wrap`}
              title="Wraps"
              description="Statistik, preview och utskick"
              icon="🎬"
            />
            <ActionCard
              href={`/organizer/event/${eventId}/awards`}
              title="Awards"
              description="Skapa och dela ut priser"
              icon="🏆"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

/* ── ActionCard ────────────────────────────────────────── */

type StepStatus = 'todo' | 'active' | 'done' | 'locked';

const STEP_BADGE: Record<StepStatus, { icon: string; className: string } | null> = {
  todo: null,
  active: { icon: '👉', className: 'bg-indigo-100 text-indigo-600' },
  done: { icon: '✅', className: 'bg-green-100 text-green-600' },
  locked: { icon: '🔒', className: 'bg-gray-100 text-gray-500' },
};

function ActionCard({ href, title, description, icon, count, disabled, target, step }: {
  href: string; title: string; description: string; icon: string; count?: number; disabled?: boolean; target?: string; step?: StepStatus;
}) {
  const badge = step ? STEP_BADGE[step] : null;
  const isActive = step === 'active';

  if (disabled) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 opacity-50 cursor-not-allowed relative">
        <div className="text-3xl mb-3">{icon}</div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
        {badge && (
          <span className={`absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-sm ${badge.className}`}>
            {badge.icon}
          </span>
        )}
      </div>
    );
  }

  return (
    <Link
      href={href}
      target={target}
      className={`group relative rounded-xl p-6 shadow-sm transition-all duration-150 ${
        isActive
          ? 'bg-white border-2 border-indigo-300 shadow-md animate-subtle-pulse'
          : step === 'done'
          ? 'bg-green-50/50 border border-green-200 hover:shadow-md'
          : 'bg-white border border-gray-100 hover:shadow-md hover:border-indigo-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-150 inline-block">{icon}</div>
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-sm font-semibold">{count}</span>
          )}
          {badge && (
            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${badge.className}`}>
              {badge.icon}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes subtle-pulse {
          0%, 100% { box-shadow: 0 1px 3px rgba(99,102,241,0.1); }
          50% { box-shadow: 0 4px 14px rgba(99,102,241,0.25); }
        }
        .animate-subtle-pulse { animation: subtle-pulse 2s ease-in-out infinite; }
      `}</style>
    </Link>
  );
}

/* ── InviteLockedBanner ────────────────────────────────── */

function InviteLockedBanner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = useCallback(async () => {
    if (!confirm('Lås upp inbjudan? Matchningen kan behöva köras om om du ändrar gästlistan.')) return;
    setUnlocking(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/unlock-invite`, { method: 'POST' });
      if (!res.ok) { const data = await res.json(); alert(data.error || 'Kunde inte låsa upp'); return; }
      router.refresh();
    } catch { alert('Något gick fel'); }
    finally { setUnlocking(false); }
  }, [eventId, router]);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔒</span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">Inbjudan är låst</div>
          <div className="text-xs text-gray-500">Matchningen är klar. Lås upp för att ändra gästlistan.</div>
        </div>
      </div>
      <button onClick={handleUnlock} disabled={unlocking}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 transition disabled:opacity-50 shrink-0">
        {unlocking ? 'Låser upp…' : 'Lås upp'}
      </button>
    </div>
  );
}
