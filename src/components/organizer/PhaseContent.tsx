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
      // Workflow: Matchning → Kuvert & Timing → Livekontroll + Live-karta
      const matchingStatus: StepStatus = hasMatching ? 'done' : isEventLocked ? 'locked' : 'active';
      const envelopeStatus: StepStatus = isActive ? 'done' : hasMatching ? 'active' : 'todo';
      const liveStatus: StepStatus = isActive ? 'active' : 'todo';

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
          {hasMatching && (
            <LiveControlPanel eventId={eventId} isActive={isActive} />
          )}
          <ActionCard
            href={`/organizer/event/${eventId}/map`}
            title="Live-karta"
            description="Följ middagen i realtid"
            icon="🗺️"
            disabled={!hasMatching}
            step={liveStatus}
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

/* ── LiveControlPanel ──────────────────────────────────── */

function LiveControlPanel({ eventId, isActive }: { eventId: string; isActive: boolean }) {
  const [delaying, setDelaying] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function adjustTimes(minutes: number) {
    setDelaying(true); setMessage('');
    try {
      const res = await fetch('/api/admin/delay-envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, delay_minutes: minutes }),
      });
      if (res.ok) {
        const dir = minutes > 0 ? 'fram' : 'tillbaka';
        setMessage(`✅ Kuverttider skjutna ${dir} ${Math.abs(minutes)} min`);
        setTimeout(() => setMessage(''), 3000);
      } else setMessage('❌ Kunde inte justera');
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setDelaying(false); }
  }

  async function activateCourse(course: string) {
    const label = course === 'starter' ? 'förrätt' : course === 'main' ? 'huvudrätt' : 'dessert';
    if (!confirm(`Aktivera kuvert för ${label} nu?`)) return;
    setActivating(course); setMessage('');
    try {
      const res = await fetch('/api/admin/activate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, course }),
      });
      if (res.ok) {
        setMessage(`✅ Kuvert för ${label} aktiverade!`);
        setTimeout(() => setMessage(''), 3000);
      } else setMessage('❌ Kunde inte aktivera');
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setActivating(null); }
  }

  return (
    <div className={`rounded-xl p-5 shadow-sm border ${
      isActive ? 'bg-white border-2 border-orange-200' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🎛️</span>
        <div>
          <h3 className="font-semibold text-gray-900">Livekontroll</h3>
          <p className="text-sm text-gray-500">Justera kuverttider och aktivera manuellt</p>
        </div>
      </div>

      {message && (
        <div className={`text-sm p-2 rounded-lg mb-3 ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      {/* Time adjustment */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 font-medium mb-2">Justera kuverttider</p>
        <div className="flex gap-2 flex-wrap">
          {[-15, -5, 5, 15, 30].map(min => (
            <button key={min} onClick={() => adjustTimes(min)} disabled={delaying || !isActive}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-40 ${
                min < 0
                  ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}>
              {min > 0 ? '+' : ''}{min} min
            </button>
          ))}
        </div>
      </div>

      {/* Manual activation */}
      <div>
        <p className="text-xs text-gray-500 font-medium mb-2">Aktivera kuvert manuellt</p>
        <div className="flex gap-2">
          {[
            { course: 'starter', label: '🥗 Förrätt' },
            { course: 'main', label: '🍖 Huvudrätt' },
            { course: 'dessert', label: '🍰 Efterrätt' },
          ].map(({ course, label }) => (
            <button key={course} onClick={() => activateCourse(course)} disabled={!!activating || !isActive}
              className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-40 text-sm font-medium transition">
              {activating === course ? '...' : label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
      <div className="bg-gray-50 rounded-xl p-5 opacity-50 cursor-not-allowed">
        <div className="flex items-center gap-4">
          <div className="text-3xl shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
          {badge && (
            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm shrink-0 ${badge.className}`}>
              {badge.icon}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      target={target}
      className={`group block relative rounded-xl p-5 shadow-sm transition-all duration-150 ${
        isActive
          ? 'bg-white border-2 border-indigo-300 shadow-md animate-subtle-pulse'
          : step === 'done'
          ? 'bg-green-50/50 border border-green-200 hover:shadow-md'
          : 'bg-white border border-gray-100 hover:shadow-md hover:border-indigo-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="text-3xl shrink-0 group-hover:scale-110 transition-transform duration-150">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
