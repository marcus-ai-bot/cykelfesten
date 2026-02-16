'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { InviteTeamSection } from '@/components/organizer/InviteTeamSection';
import { GuestPreviewSection } from '@/components/organizer/GuestPreviewSection';
import { InviteLinkSection } from '@/components/organizer/InviteLinkSection';

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

interface Props {
  eventId: string;
  eventSlug: string;
  couplesCount: number;
  isPast: boolean;
  hasMatching: boolean;
  organizers: OrganizerRow[];
  isFounder: boolean;
  currentOrganizerId: string;
}

export function PhasesStepper({
  eventId,
  eventSlug,
  couplesCount,
  isPast,
  hasMatching,
  organizers,
  isFounder,
  currentOrganizerId,
}: Props) {
  const defaultPhaseIndex = useMemo(() => {
    if (isPast) return 2;
    if (hasMatching) return 1;
    return 0;
  }, [hasMatching, isPast]);

  const [activePhaseIndex, setActivePhaseIndex] = useState(defaultPhaseIndex);
  const [contentVisible, setContentVisible] = useState(true);

  useEffect(() => {
    setContentVisible(false);
    const timeout = setTimeout(() => setContentVisible(true), 20);
    return () => clearTimeout(timeout);
  }, [activePhaseIndex]);

  const phases = [
    {
      key: 'invite',
      name: 'Inbjudan',
      status: couplesCount === 0 ? 'not_started' : 'in_progress',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <ActionCard
              href={`/organizer/event/${eventId}/guests`}
              title="Gästlista"
              description="Hantera registreringar och bekräftelser"
              icon="👥"
              count={couplesCount}
            />
            <ActionCard
              href={`/e/${eventSlug}`}
              title="Förhandsgranska"
              description="Se gästsidan som dina gäster"
              icon="👁️"
              target="_blank"
            />
          </div>
          <InviteLinkSection eventId={eventId} />
          <div id="invite-team" className="scroll-mt-24">
            <InviteTeamSection
              eventId={eventId}
              organizers={organizers}
              isFounder={isFounder}
              currentOrganizerId={currentOrganizerId}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'dinner',
      name: 'Middag',
      status: !hasMatching ? 'not_started' : isPast ? 'complete' : 'in_progress',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <ActionCard
              href={`/organizer/event/${eventId}/matching`}
              title="Matchning"
              description="Koppla ihop gäster med värdar"
              icon="🔀"
              disabled={!couplesCount}
            />
            <ActionCard
              href={`/organizer/event/${eventId}/timing`}
              title="Kuvert & Timing"
              description="Justera tider och kuvert"
              icon="⏰"
            />
            <ActionCard
              href={`/organizer/event/${eventId}/messages`}
              title="Meddelanden"
              description="Skicka info till gästerna"
              icon="💬"
            />
          </div>
          <GuestPreviewSection eventId={eventId} slug={eventSlug} />
        </div>
      ),
    },
    {
      key: 'after',
      name: 'Dagen efter',
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
            href="#invite-team"
            title="Team"
            description="Hantera arrangörer och roller"
            icon="👥"
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
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500">Faser</div>
        </div>
        <div className="flex gap-2 overflow-x-auto flex-nowrap">
          {phases.map((phase, index) => {
            const isActive = index === activePhaseIndex;
            return (
              <button
                key={phase.key}
                type="button"
                onClick={() => setActivePhaseIndex(index)}
                className={`relative flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm scale-[1.02]'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {phase.key === 'settings' && (
                  <span className="text-base">{phase.icon}</span>
                )}
                <span>{phase.name}</span>
                {phase.key !== 'settings' && (
                  <span className="absolute -top-1 -right-1">
                    <StatusDot status={phase.status} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 transition-all duration-300">
        <div className="flex items-center gap-2 mb-4">
          {activePhase.key === 'settings' ? (
            <span className="text-2xl">{activePhase.icon}</span>
          ) : (
            <StatusDot status={activePhase.status} />
          )}
          <h2 className="text-lg font-semibold text-gray-900">
            {activePhase.name}
          </h2>
        </div>
        <div
          className={`transition-all duration-300 ${
            contentVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {activePhase.content}
        </div>
      </div>
    </section>
  );
}

function StatusDot({
  status,
}: {
  status: 'not_started' | 'in_progress' | 'complete' | 'needs_action';
}) {
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px]">
        ✓
      </span>
    );
  }

  if (status === 'needs_action') {
    return (
      <span className="inline-flex w-3 h-3 rounded-full bg-red-500 animate-pulse" />
    );
  }

  return (
    <span
      className={`inline-flex w-3 h-3 rounded-full ${
        status === 'in_progress' ? 'bg-amber-400' : 'bg-gray-300'
      }`}
    />
  );
}

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
      <div className="bg-gray-100 rounded-xl p-6 opacity-50 cursor-not-allowed">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl mb-3">{icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      target={target}
      className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-indigo-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl mb-3">{icon}</div>
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        {count !== undefined && (
          <div className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-sm font-medium">
            {count}
          </div>
        )}
      </div>
    </Link>
  );
}
