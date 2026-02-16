'use client';

import { useMemo, useState } from 'react';
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

  const phases = [
    {
      key: 'invite',
      name: 'Inbjudan',
      icon: '📨',
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
      icon: '🍽️',
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
      icon: '🌅',
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
          <div className="text-sm text-gray-500">
            {activePhaseIndex + 1}/4 klart
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          {phases.map((phase, index) => {
            const isActive = index === activePhaseIndex;
            return (
              <button
                key={phase.key}
                type="button"
                onClick={() => setActivePhaseIndex(index)}
                className={`flex-1 rounded-xl border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{phase.icon}</span>
                  <div>
                    <div className="font-semibold">{phase.name}</div>
                    <div className="text-xs text-gray-500">
                      Fas {index + 1}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{activePhase.icon}</span>
          <h2 className="text-lg font-semibold text-gray-900">
            {activePhase.name}
          </h2>
        </div>
        {activePhase.content}
      </div>
    </section>
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
