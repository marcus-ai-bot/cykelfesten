'use client';

import { useState, useEffect, useCallback } from 'react';

/* ── Types ────────────────────────────────────────────── */

interface HostOption {
  couple_id: string;
  name: string;
  address: string;
  current_guests: number;
  max_guests: number;
}

interface MissingCouple {
  id: string;
  name: string;
  person_count: number;
}

interface UnplacedData {
  unplaced: Array<{ id: string; name: string; person_count: number }>;
  missingByCourse: Record<string, MissingCouple[]>;
  hostsByCourse: Record<string, HostOption[]>;
  potentialHosts?: Record<string, Array<{ couple_id: string; name: string; address: string }>>;
}

interface FreedGuest {
  id: string;
  name: string;
}

interface ResignResult {
  courses: string[];
  freed_guests: FreedGuest[];
}

const COURSE_LABELS: Record<string, string> = {
  starter: '🥗 Förrätt',
  main: '🍖 Huvudrätt',
  dessert: '🍰 Dessert',
};

/* ── Component ────────────────────────────────────────── */

interface SplitWizardProps {
  eventId: string;
  coupleId: string;
  invitedName: string;
  partnerName: string;
  onClose: () => void;
  onComplete: () => void;
}

export function SplitWizard({
  eventId,
  coupleId,
  invitedName,
  partnerName,
  onClose,
  onComplete,
}: SplitWizardProps) {
  type Step = 'confirm' | 'splitting' | 'transfer-host' | 'choose-invited' | 'choose-partner' | 'place-orphans' | 'summary';

  const [step, setStep] = useState<Step>('confirm');
  const [error, setError] = useState('');
  const [newCoupleId, setNewCoupleId] = useState<string | null>(null);

  // Decisions
  const [invitedAction, setInvitedAction] = useState<'keep' | 'cancel' | 'resign' | null>(null);
  const [partnerAction, setPartnerAction] = useState<'keep' | 'cancel' | 'resign' | null>(null);

  // Host info — NOTE: after split, original couple (invitedName) keeps ALL assignments
  const [invitedIsHost, setInvitedIsHost] = useState(false);
  const [partnerIsHost, setPartnerIsHost] = useState(false);
  const [invitedHostCourses, setInvitedHostCourses] = useState<string[]>([]);
  const [partnerHostCourses, setPartnerHostCourses] = useState<string[]>([]);

  // Transfer host: who should take over hosting?
  const [hostTransferTo, setHostTransferTo] = useState<'invited' | 'partner' | 'neither' | null>(null);

  // Freed guests from resign
  const [freedGuests, setFreedGuests] = useState<FreedGuest[]>([]);

  // Unplaced data for orphan placement
  const [unplacedData, setUnplacedData] = useState<UnplacedData | null>(null);
  const [orphanSelections, setOrphanSelections] = useState<Record<string, string>>({});

  // Summary
  const [actions, setActions] = useState<string[]>([]);

  const addAction = (msg: string) => setActions(prev => [...prev, msg]);

  // Fetch host assignments for both people after split
  // Returns the host courses for the original couple
  const fetchAssignments = useCallback(async (origId: string, newId: string | null): Promise<string[]> => {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/unplaced`);
      if (!res.ok) return [];
      const data: UnplacedData = await res.json();
      setUnplacedData(data);

      // Check hostsByCourse to see if either couple is a host
      const courses = ['starter', 'main', 'dessert'];
      const origHostCourses: string[] = [];
      const newHostCourses: string[] = [];

      for (const course of courses) {
        const hosts = data.hostsByCourse[course] || [];
        if (hosts.some(h => h.couple_id === origId)) origHostCourses.push(course);
        if (newId && hosts.some(h => h.couple_id === newId)) newHostCourses.push(course);
      }

      setInvitedIsHost(origHostCourses.length > 0);
      setInvitedHostCourses(origHostCourses);
      setPartnerIsHost(newHostCourses.length > 0);
      setPartnerHostCourses(newHostCourses);
      return origHostCourses;
    } catch { return []; }
  }, [eventId]);

  // Step 1: Confirm & execute split
  const handleSplit = async () => {
    setStep('splitting');
    setError('');
    try {
      const res = await fetch(`/api/organizer/couples/${coupleId}/split`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Kunde inte koppla isär');
        setStep('confirm');
        return;
      }
      setNewCoupleId(data.new_id);
      addAction(`✂️ ${invitedName} och ${partnerName} isärkopplade`);

      // Fetch assignments to know who is host
      // NOTE: After split, ALL assignments belong to the original couple (invitedName)
      const hostCourses = await fetchAssignments(coupleId, data.new_id);
      
      if (hostCourses.length > 0) {
        // The original couple was a host — ask who takes over
        setStep('transfer-host');
      } else {
        // Not a host — skip to per-person decisions
        setStep('choose-invited');
      }
    } catch {
      setError('Nätverksfel');
      setStep('confirm');
    }
  };

  // Execute action for a person
  // Handle host transfer decision
  const handleTransferHost = async () => {
    if (!hostTransferTo) return;
    setError('');

    try {
      if (hostTransferTo === 'partner' && newCoupleId) {
        // Transfer hosting from original (invitedName) to partner's new entry
        const res = await fetch(`/api/organizer/events/${eventId}/transfer-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_couple_id: coupleId,
            to_couple_id: newCoupleId,
            courses: invitedHostCourses,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Kunde inte överföra värdskap');
          return;
        }
        const courseLabels = invitedHostCourses.map(c => COURSE_LABELS[c] || c).join(', ');
        addAction(`🏠 ${partnerName} tar över värdskapet (${courseLabels})`);
        // Update state: partner is now host, invited is not
        setPartnerIsHost(true);
        setPartnerHostCourses(invitedHostCourses);
        setInvitedIsHost(false);
        setInvitedHostCourses([]);
      } else if (hostTransferTo === 'invited') {
        // Original keeps hosting — nothing to do
        const courseLabels = invitedHostCourses.map(c => COURSE_LABELS[c] || c).join(', ');
        addAction(`🏠 ${invitedName} behåller värdskapet (${courseLabels})`);
      } else if (hostTransferTo === 'neither') {
        // Neither keeps hosting — resign
        const res = await fetch(`/api/organizer/couples/${coupleId}/resign-host`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Kunde inte avsäga värdskap');
          return;
        }
        const courseLabels = invitedHostCourses.map(c => COURSE_LABELS[c] || c).join(', ');
        addAction(`🏠 Värdskap avsagt (${courseLabels})`);
        if (data.freed_guests?.length > 0) {
          setFreedGuests(data.freed_guests);
          addAction(`👥 ${data.freed_guests.length} gäster behöver ny placering`);
        }
        setInvitedIsHost(false);
        setInvitedHostCourses([]);
      }

      setStep('choose-invited');
    } catch {
      setError('Nätverksfel');
    }
  };

  const executeAction = async (
    targetCoupleId: string,
    targetName: string,
    action: 'keep' | 'cancel' | 'resign',
    isHost: boolean
  ): Promise<ResignResult | null> => {
    if (action === 'keep') {
      addAction(`✅ ${targetName} behåller sina placeringar`);
      return null;
    }

    if (action === 'cancel') {
      const res = await fetch('/api/dropout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couple_id: targetCoupleId,
          reason: 'Separation — avhopp',
          is_host_dropout: false, // Don't trigger rematch!
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Kunde inte registrera avhopp');
      }
      addAction(`❌ ${targetName} avhoppad`);
      return null;
    }

    if (action === 'resign' && isHost) {
      const res = await fetch(`/api/organizer/couples/${targetCoupleId}/resign-host`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunde inte avsäga värdskap');

      const result: ResignResult = {
        courses: data.courses || [],
        freed_guests: data.freed_guests || [],
      };

      const courseLabels = result.courses.map(c => COURSE_LABELS[c] || c).join(', ');
      addAction(`🏠 ${targetName} avsade värdskap (${courseLabels})`);
      if (result.freed_guests.length > 0) {
        addAction(`👥 ${result.freed_guests.length} gäster behöver ny placering`);
      }
      return result;
    }

    return null;
  };

  // Handle invited person decision
  const handleInvitedDecision = async () => {
    if (!invitedAction) return;
    setError('');
    try {
      const result = await executeAction(coupleId, invitedName, invitedAction, invitedIsHost);
      if (result) {
        setFreedGuests(prev => [...prev, ...result.freed_guests]);
      }
      setStep('choose-partner');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fel');
    }
  };

  // Handle partner decision
  const handlePartnerDecision = async () => {
    if (!partnerAction || !newCoupleId) return;
    setError('');
    try {
      const result = await executeAction(newCoupleId, partnerName, partnerAction, partnerIsHost);
      if (result) {
        setFreedGuests(prev => [...prev, ...result.freed_guests]);
      }

      // If there are freed guests, go to placement step
      // Refresh unplaced data first
      const res = await fetch(`/api/organizer/events/${eventId}/unplaced`);
      if (res.ok) {
        const data: UnplacedData = await res.json();
        setUnplacedData(data);
      }

      if (freedGuests.length > 0 || (result?.freed_guests?.length ?? 0) > 0) {
        setStep('place-orphans');
      } else {
        setStep('summary');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fel');
    }
  };

  // Handle orphan placement
  const handlePlaceOrphans = async () => {
    setError('');
    const entries = Object.entries(orphanSelections).filter(([, hostId]) => hostId);
    if (entries.length === 0) {
      setStep('summary');
      return;
    }

    try {
      for (const [key, hostId] of entries) {
        // key format: "coupleId:course"
        const [guestCoupleId, course] = key.split(':');
        const res = await fetch(`/api/organizer/events/${eventId}/reassign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guest_couple_id: guestCoupleId,
            course,
            new_host_couple_id: hostId,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error || 'Kunde inte placera');
          return;
        }
      }
      addAction(`📍 ${entries.length} gäst${entries.length > 1 ? 'er' : ''} omplacerad${entries.length > 1 ? 'e' : ''}`);
      setStep('summary');
    } catch {
      setError('Nätverksfel');
    }
  };

  const courses = ['starter', 'main', 'dessert'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">✂️ Koppla isär par</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
          )}

          {/* Step: Confirm */}
          {step === 'confirm' && (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="font-medium text-orange-900">
                  Koppla isär {invitedName} &amp; {partnerName}?
                </p>
                <p className="text-sm text-orange-700 mt-2">
                  De blir två separata anmälningar. Befintliga placeringar behålls tills du ändrar dem i nästa steg.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                  Avbryt
                </button>
                <button onClick={handleSplit} className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm hover:bg-orange-700">
                  ✂️ Koppla isär
                </button>
              </div>
            </>
          )}

          {/* Step: Splitting (loading) */}
          {step === 'splitting' && (
            <div className="text-center py-8">
              <div className="animate-spin text-3xl mb-3">⚙️</div>
              <p className="text-gray-500">Kopplar isär...</p>
            </div>
          )}

          {/* Step: Transfer host */}
          {step === 'transfer-host' && (
            <>
              <StepIndicator current={1} total={4} />
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <h3 className="font-semibold text-indigo-900 mb-1">
                  🏠 Vem tar över värdskapet?
                </h3>
                <p className="text-sm text-indigo-700">
                  {invitedName} & {partnerName} var värd för{' '}
                  {invitedHostCourses.map(c => COURSE_LABELS[c] || c).join(', ')}.
                  Vem ska fortsätta som värd?
                </p>
              </div>

              <div className="space-y-2">
                <ActionOption
                  selected={hostTransferTo === 'invited'}
                  onClick={() => setHostTransferTo('invited')}
                  icon="👤"
                  label={`${invitedName} behåller värdskapet`}
                  description="Gästerna stannar, adressen behålls"
                />
                <ActionOption
                  selected={hostTransferTo === 'partner'}
                  onClick={() => setHostTransferTo('partner')}
                  icon="👤"
                  label={`${partnerName} tar över värdskapet`}
                  description="Värdskap, gäster och kuvert överförs"
                />
                <ActionOption
                  selected={hostTransferTo === 'neither'}
                  onClick={() => setHostTransferTo('neither')}
                  icon="🚪"
                  label="Ingen — avsäg värdskapet"
                  description="Gästerna frigörs och behöver ny värd"
                  danger
                />
              </div>

              <button
                onClick={handleTransferHost}
                disabled={!hostTransferTo}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                Nästa →
              </button>
            </>
          )}

          {/* Step: Choose action for invited person */}
          {step === 'choose-invited' && (
            <>
              <StepIndicator current={2} total={4} />
              <PersonActionCard
                name={invitedName}
                isHost={invitedIsHost}
                hostCourses={invitedHostCourses}
                action={invitedAction}
                setAction={setInvitedAction}
              />
              <button
                onClick={handleInvitedDecision}
                disabled={!invitedAction}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                Nästa →
              </button>
            </>
          )}

          {/* Step: Choose action for partner */}
          {step === 'choose-partner' && (
            <>
              <StepIndicator current={3} total={4} />
              <PersonActionCard
                name={partnerName}
                isHost={partnerIsHost}
                hostCourses={partnerHostCourses}
                action={partnerAction}
                setAction={setPartnerAction}
              />
              <button
                onClick={handlePartnerDecision}
                disabled={!partnerAction}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                {freedGuests.length > 0 ? 'Nästa → Placera gäster' : 'Slutför'}
              </button>
            </>
          )}

          {/* Step: Place orphaned guests */}
          {step === 'place-orphans' && (
            <>
              <StepIndicator current={4} total={4} />
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="font-semibold text-amber-900 mb-1">
                  👥 Gäster utan värd
                </h3>
                <p className="text-sm text-amber-700">
                  Dessa gäster tappade sin värd. Välj ny värd per rätt, eller hoppa över för att hantera det senare.
                </p>
              </div>

              {/* Refresh unplaced data */}
              <OrphanPlacement
                eventId={eventId}
                freedGuests={freedGuests}
                unplacedData={unplacedData}
                selections={orphanSelections}
                setSelections={setOrphanSelections}
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('summary')}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200"
                >
                  Hoppa över
                </button>
                <button
                  onClick={handlePlaceOrphans}
                  disabled={Object.values(orphanSelections).filter(Boolean).length === 0}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  💾 Placera valda
                </button>
              </div>
            </>
          )}

          {/* Step: Summary */}
          {step === 'summary' && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h3 className="font-semibold text-green-900 mb-2">✅ Klart!</h3>
                <ul className="space-y-1">
                  {actions.map((a, i) => (
                    <li key={i} className="text-sm text-green-800">{a}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={onComplete}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700"
              >
                Stäng
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < current ? 'bg-indigo-500' : 'bg-gray-200'
          }`}
        />
      ))}
      <span className="ml-1">{current}/{total}</span>
    </div>
  );
}

function PersonActionCard({
  name,
  isHost,
  hostCourses,
  action,
  setAction,
}: {
  name: string;
  isHost: boolean;
  hostCourses: string[];
  action: string | null;
  setAction: (a: 'keep' | 'cancel' | 'resign') => void;
}) {
  const courseLabels = hostCourses.map(c => COURSE_LABELS[c] || c).join(', ');

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-gray-900">{name}</h3>
      {isHost && (
        <p className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg inline-block">
          🏠 Värd för {courseLabels}
        </p>
      )}

      <div className="space-y-2">
        <ActionOption
          selected={action === 'keep'}
          onClick={() => setAction('keep')}
          icon="✅"
          label="Behåll placeringar"
          description={isHost ? 'Behåller värdskap och gäst-placeringar' : 'Fortsätter som gäst hos samma värdar'}
        />

        {isHost && (
          <ActionOption
            selected={action === 'resign'}
            onClick={() => setAction('resign')}
            icon="🏠"
            label="Avsäg värdskap"
            description="Gästerna frigörs och behöver ny värd. Kvar som gäst på andra rätter."
          />
        )}

        <ActionOption
          selected={action === 'cancel'}
          onClick={() => setAction('cancel')}
          icon="❌"
          label="Hoppa av helt"
          description="Avhoppad — alla placeringar rensas"
          danger
        />
      </div>
    </div>
  );
}

function ActionOption({
  selected,
  onClick,
  icon,
  label,
  description,
  danger = false,
}: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
        selected
          ? danger
            ? 'border-red-500 bg-red-50'
            : 'border-indigo-500 bg-indigo-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className={`text-sm font-medium ${danger && selected ? 'text-red-700' : 'text-gray-900'}`}>
          {label}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1 pl-6">{description}</p>
    </button>
  );
}

function OrphanPlacement({
  eventId,
  freedGuests,
  unplacedData,
  selections,
  setSelections,
}: {
  eventId: string;
  freedGuests: FreedGuest[];
  unplacedData: UnplacedData | null;
  selections: Record<string, string>;
  setSelections: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const courses = ['starter', 'main', 'dessert'];
  const freedIds = new Set(freedGuests.map(g => g.id));

  if (!unplacedData) {
    return <p className="text-sm text-gray-400">Laddar...</p>;
  }

  // Find freed guests that are now missing per course
  const missingFreed: Array<{ guestId: string; guestName: string; course: string }> = [];

  for (const course of courses) {
    const missing = unplacedData.missingByCourse?.[course] ?? [];
    for (const m of missing) {
      if (freedIds.has(m.id)) {
        missingFreed.push({
          guestId: m.id,
          guestName: m.name,
          course,
        });
      }
    }
  }

  // Also check fully unplaced
  for (const u of unplacedData.unplaced) {
    if (freedIds.has(u.id)) {
      for (const course of courses) {
        if (!missingFreed.some(m => m.guestId === u.id && m.course === course)) {
          missingFreed.push({
            guestId: u.id,
            guestName: u.name,
            course,
          });
        }
      }
    }
  }

  if (missingFreed.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Inga frigjorda gäster behöver omplaceras just nu.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {courses.map(course => {
        const items = missingFreed.filter(m => m.course === course);
        if (items.length === 0) return null;
        const hosts = unplacedData.hostsByCourse[course] || [];

        return (
          <div key={course} className="bg-white rounded-lg border border-gray-100 p-3">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">
              {COURSE_LABELS[course]}
            </h4>
            <div className="space-y-2">
              {items.map(item => {
                const key = `${item.guestId}:${course}`;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-900 flex-1 truncate">{item.guestName}</span>
                    <select
                      value={selections[key] || ''}
                      onChange={e => setSelections(prev => ({ ...prev, [key]: e.target.value }))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-[220px]"
                    >
                      <option value="">Välj värd...</option>
                      {hosts.map(h => (
                        <option key={h.couple_id} value={h.couple_id}>
                          {h.name} ({h.current_guests}/{h.max_guests})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
