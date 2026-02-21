'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InviteTeamSection } from '@/components/organizer/InviteTeamSection';
import { GuestPreviewSection } from '@/components/organizer/GuestPreviewSection';
import { InviteLinkSection } from '@/components/organizer/InviteLinkSection';

/* ── Types ─────────────────────────────────────────────── */

type PhaseStatus = 'not_started' | 'in_progress' | 'complete';

type OrganizerRow = {
  id: string;
  organizer_id: string;
  role: 'founder' | 'co-organizer';
  accepted_at: string | null;
  organizer: {
    id: string;
    name: string | null;
    email: string;
  };
};

type PhaseVisual = 'not_started' | 'in_progress' | 'complete' | 'locked';

interface Props {
  eventId: string;
  eventSlug: string;
  eventStatus: string;
  couplesCount: number;
  isPast: boolean;
  isToday: boolean;
  hasMatching: boolean;
  organizers: OrganizerRow[];
  isFounder: boolean;
  currentOrganizerId: string;
}

interface Phase {
  key: string;
  name: string;
  icon: string;
  status: PhaseVisual;
  content: React.ReactNode;
}

/* ── Main component ────────────────────────────────────── */

export function PhasesStepper({
  eventId,
  eventSlug,
  eventStatus,
  couplesCount,
  isPast,
  isToday,
  hasMatching,
  organizers,
  isFounder,
  currentOrganizerId,
}: Props) {
  const defaultPhaseIndex = useMemo(() => {
    if (isPast || eventStatus === 'completed') return 2;
    if (isToday || eventStatus === 'active') return 1;
    if (eventStatus === 'matched' || eventStatus === 'locked') return 1;
    return 0; // draft, open → Inbjudan
  }, [eventStatus, isPast, isToday]);

  const [activePhaseIndex, setActivePhaseIndex] = useState(defaultPhaseIndex);
  const [manuallySelected, setManuallySelected] = useState(false);

  // Follow status-driven default unless user manually picked a tab
  useEffect(() => {
    if (!manuallySelected) {
      setActivePhaseIndex(defaultPhaseIndex);
    }
  }, [defaultPhaseIndex, manuallySelected]);

  const phases: Phase[] = [
    {
      key: 'invite',
      name: 'Inbjudan',
      icon: '📨',
      status: (eventStatus === 'matched' || eventStatus === 'locked') ? 'locked'
        : hasMatching ? 'complete'
        : couplesCount === 0 ? 'not_started'
        : 'in_progress',
      content: (() => {
        const isEventLocked = eventStatus === 'locked' || eventStatus === 'active' || eventStatus === 'completed';
        const isInviteOpen = eventStatus === 'draft' || eventStatus === 'open';
        return (
          <div className="space-y-6">
            {(eventStatus === 'matched' || eventStatus === 'locked') && (
              <InviteLockedBanner eventId={eventId} />
            )}

            {/* Gästlista — always visible */}
            <ActionCard
              href={`/organizer/event/${eventId}/guests`}
              title="Gästlista"
              description="Hantera registreringar och bekräftelser"
              icon="👥"
              count={couplesCount}
            />

            {/* Invite-only cards */}
            {isInviteOpen && (
              <ActionCard
                href={`/e/${eventSlug}`}
                title="Förhandsgranska"
                description="Se gästsidan som dina gäster"
                icon="👁️"
                target="_blank"
              />
            )}

            {/* Matchning + Karta — paired */}
            {couplesCount > 0 && (
              <div className="grid md:grid-cols-2 gap-6">
                <ActionCard
                  href={`/organizer/event/${eventId}/matching`}
                  title={isEventLocked ? '🔒 Matchning låst' : 'Kör matchning'}
                  description={isEventLocked ? 'Ändra status för att låsa upp' : 'Koppla ihop gäster med värdar'}
                  icon="🔀"
                  disabled={isEventLocked}
                />
                <ActionCard
                  href={`/organizer/event/${eventId}/map`}
                  title="Karta"
                  description="Se matchade grupper på kartan"
                  icon="🗺️"
                />
              </div>
            )}

            {/* Inbjudningslänk — bara vid öppen/utkast */}
            {isInviteOpen && <InviteLinkSection eventId={eventId} />}

            {/* Arrangörsteam */}
            <div id="invite-team" className="scroll-mt-24 border-t pt-6">
              <InviteTeamSection
                eventId={eventId}
                organizers={organizers}
                isFounder={isFounder}
                currentOrganizerId={currentOrganizerId}
              />
            </div>
          </div>
        );
      })(),
    },
    {
      key: 'dinner',
      name: 'Middag',
      icon: '🍽️',
      status: !hasMatching ? 'not_started' : isPast ? 'complete' : 'in_progress',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <ActionCard
              href={`/organizer/event/${eventId}/timing`}
              title="Kuvert & Timing"
              description="Justera tider och kuvert"
              icon="⏰"
              disabled={!hasMatching}
            />
            <ActionCard
              href={`/organizer/event/${eventId}/messages`}
              title="Kuvertmeddelanden"
              description="Texter som visas i kuvertet"
              icon="💬"
              disabled={!hasMatching}
            />
            <ActionCard
              href={`/organizer/event/${eventId}/map`}
              title="Live-karta"
              description="Följ middagen i realtid"
              icon="🗺️"
              disabled={!hasMatching}
            />
          </div>
          {hasMatching && <GuestPreviewSection eventId={eventId} slug={eventSlug} />}
        </div>
      ),
    },
    {
      key: 'after',
      name: 'Efteråt',
      icon: '🌅',
      status: !isPast ? 'not_started' : 'in_progress',
      content: (
        <div className="grid md:grid-cols-2 gap-6">
          <ActionCard
            href={`/organizer/event/${eventId}/wrap`}
            title="Wraps"
            description="Skicka personliga sammanfattningar"
            icon="📧"
          />
          <ActionCard
            href={`/organizer/event/${eventId}/awards`}
            title="Awards"
            description="Skapa och dela ut priser"
            icon="🏆"
          />
          <ActionCard
            href={`/e/${eventSlug}/memories`}
            title="Memories"
            description="Se statistik och hälsningar"
            icon="📸"
            target="_blank"
          />
        </div>
      ),
    },
    {
      key: 'settings',
      name: 'Inställningar',
      icon: '⚙️',
      status: 'not_started',
      content: (
        <div className="grid md:grid-cols-2 gap-6">
          <ActionCard
            href={`/organizer/event/${eventId}/settings`}
            title="Eventinställningar"
            description="Datum, tider och kuvert"
            icon="⚙️"
          />
          <ActionCard
            href={`/organizer/event/${eventId}/notifications`}
            title="Notifieringar"
            description="Ställ in påminnelser"
            icon="🔔"
          />
        </div>
      ),
    },
  ];

  const activePhase = phases[activePhaseIndex];

  return (
    <section className="space-y-6">
      {/* ── Pill navigation ──────────────────────────── */}
      <nav className="bg-white rounded-2xl shadow-sm px-3 py-3 md:px-5">
        <div className="flex gap-1.5 overflow-x-auto flex-nowrap scrollbar-hide">
          {phases.map((phase, index) => {
            const isActive = index === activePhaseIndex;
            // Status ring: complete=green, in_progress=amber, not_started=none
            const statusRing = !isActive && phase.status === 'locked'
              ? 'ring-2 ring-gray-400 bg-gray-100 text-gray-500'
              : !isActive && phase.status === 'complete'
              ? 'ring-2 ring-emerald-400 bg-emerald-50 text-emerald-700'
              : !isActive && phase.status === 'in_progress'
              ? 'ring-2 ring-amber-300 bg-amber-50 text-amber-700'
              : !isActive
              ? 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              : '';
            return (
              <button
                key={phase.key}
                type="button"
                onClick={() => { setActivePhaseIndex(index); setManuallySelected(true); }}
                className={`
                  flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-2
                  text-sm font-semibold whitespace-nowrap
                  transition-all duration-200 ease-out
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : statusRing
                  }
                `}
              >
                <span className="text-base leading-none">{phase.icon}</span>
                {phase.key === 'settings'
                  ? <span className="hidden sm:inline">{phase.name}</span>
                  : <span className="text-xs sm:text-sm">{phase.name}</span>
                }
                {phase.status === 'locked' && (
                  <span className="text-xs">🔒</span>
                )}
                {isActive && phase.status === 'complete' && (
                  <span className="text-white/80 text-xs">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Content panel ────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl leading-none">{activePhase.icon}</span>
          <h2 className="text-lg font-semibold text-gray-900">
            {activePhase.name}
          </h2>
          {activePhase.key !== 'settings' && activePhase.status !== 'not_started' && (
            <StatusDot status={activePhase.status} size="md" />
          )}
        </div>
        <div
          key={activePhase.key}
          className="animate-fade-in"
        >
          {activePhase.content}
        </div>
      </div>

      {/* CSS animation — no setTimeout hack */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeSlideIn 0.25s ease-out both;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}

/* ── StatusDot ─────────────────────────────────────────── */

function StatusDot({
  status,
  size = 'sm',
  className = '',
}: {
  status: PhaseVisual;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dims = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';

  if (status === 'complete') {
    const completeDims = size === 'sm' ? 'w-3.5 h-3.5 text-[9px]' : 'w-5 h-5 text-xs';
    return (
      <span className={`inline-flex items-center justify-center rounded-full bg-emerald-500 text-white font-bold ${completeDims} ${className}`}>
        ✓
      </span>
    );
  }

  if (status === 'in_progress') {
    return <span className={`inline-flex rounded-full bg-amber-400 ${dims} ${className}`} />;
  }

  // not_started — shouldn't render but just in case
  return <span className={`inline-flex rounded-full bg-gray-300 ${dims} ${className}`} />;
}

/* ── ActionCard ────────────────────────────────────────── */

function ActionCard({
  href,
  title,
  description,
  icon,
  count,
  disabled,
  target,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  count?: number;
  disabled?: boolean;
  target?: string;
}) {
  if (disabled) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 opacity-50 cursor-not-allowed">
        <div className="text-3xl mb-3">{icon}</div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      target={target}
      className="group bg-white rounded-xl p-6 shadow-sm border border-gray-100
                 hover:shadow-md hover:border-indigo-200 transition-all duration-150"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-150 inline-block">{icon}</div>
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        {count !== undefined && (
          <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-sm font-semibold">
            {count}
          </span>
        )}
      </div>
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
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Kunde inte låsa upp');
        return;
      }
      router.refresh();
    } catch {
      alert('Något gick fel');
    } finally {
      setUnlocking(false);
    }
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
      <button
        onClick={handleUnlock}
        disabled={unlocking}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 transition disabled:opacity-50 shrink-0"
      >
        {unlocking ? 'Låser upp…' : 'Lås upp'}
      </button>
    </div>
  );
}
