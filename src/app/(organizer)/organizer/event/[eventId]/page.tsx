import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PhasesStepper } from '@/components/organizer/PhasesStepper';
import StatusDropdown from '@/components/organizer/StatusDropdown';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function OrganizerEventPage({ params }: Props) {
  const { eventId } = await params;
  const organizer = await requireOrganizer();
  
  // Check access
  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) {
    notFound();
  }
  
  const supabase = createAdminClient();
  
  // Get event details
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();
  
  if (!event) {
    notFound();
  }
  
  // Get organizers
  const { data: organizers } = await supabase
    .from('event_organizers')
    .select(`
      *,
      organizer:organizers(id, name, email)
    `)
    .eq('event_id', eventId)
    .is('removed_at', null)
    .order('role', { ascending: true }); // founder first
  
  // Get couples count
  const { count: couplesCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('cancelled', true);

  // Get confirmed count
  const { count: confirmedCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('confirmed', true)
    .neq('cancelled', true);

  // Get host count (from latest matching)
  const { count: hostCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('role', 'host')
    .neq('cancelled', true);

  // Par vs singlar
  const { count: pairsCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('cancelled', true)
    .not('partner_name', 'is', null);

  const singlesCount = (couplesCount || 0) - (pairsCount || 0);

  // Geocoded addresses
  const { count: geocodedCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('cancelled', true)
    .not('coordinates', 'is', null);

  const { data: matchPlan } = await supabase
    .from('match_plans')
    .select('id')
    .eq('event_id', eventId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Post-matching stats (only query if matching exists)
  let envelopeCount = 0;
  let distanceWarnings = 0;
  if (matchPlan) {
    const { count: envCount } = await supabase
      .from('envelopes')
      .select('*', { count: 'exact', head: true })
      .eq('match_plan_id', matchPlan.id);
    envelopeCount = envCount || 0;

    const { count: distCount } = await supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('match_plan_id', matchPlan.id)
      .gt('cycling_distance_km', 2);
    distanceWarnings = distCount || 0;
  }
  
  const eventDateObj = new Date(event.event_date);
  const today = new Date();
  const eventDate = eventDateObj.toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const isPast = eventDateObj < today && eventDateObj.toDateString() !== today.toDateString();
  const isToday = eventDateObj.toDateString() === today.toDateString();
  const isFounder = access.role === 'founder';
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href="/organizer" className="text-gray-500 hover:text-gray-700">
            ← Alla fester
          </Link>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Event Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
                <StatusDropdown eventId={eventId} currentStatus={event.status} />
              </div>
              <p className="text-gray-600 capitalize">{eventDate}</p>
              {event.city && <p className="text-gray-500 text-sm">{event.city}</p>}
            </div>
            
            <Link
              href={`/e/${event.slug}`}
              target="_blank"
              className="text-indigo-600 hover:text-indigo-700 text-sm"
            >
              Öppna gästsida →
            </Link>
          </div>
        </div>
        
        {/* Phase-aware Stats */}
        <DashboardStats
          couplesCount={couplesCount || 0}
          pairsCount={pairsCount || 0}
          singlesCount={singlesCount}
          geocodedCount={geocodedCount || 0}
          hostCount={hostCount || 0}
          envelopeCount={envelopeCount}
          distanceWarnings={distanceWarnings}
          maxCouples={event.max_couples}
          eventDate={eventDateObj}
          hasMatching={!!matchPlan}
          isPast={isPast}
          isToday={isToday}
          status={event.status}
        />
        
        <PhasesStepper
          eventId={eventId}
          eventSlug={event.slug}
          eventStatus={event.status}
          couplesCount={couplesCount || 0}
          isPast={isPast}
          isToday={isToday}
          hasMatching={!!matchPlan}
          organizers={organizers || []}
          isFounder={isFounder}
          currentOrganizerId={organizer.id}
        />
      </main>
    </div>
  );
}

// --- Phase-aware dashboard ---

type Phase = 'invite' | 'matched' | 'active' | 'past';

function getPhase(opts: { hasMatching: boolean; isPast: boolean; isToday: boolean; status: string }): Phase {
  if (opts.isPast || opts.status === 'completed') return 'past';
  if (opts.isToday || opts.status === 'active') return 'active';
  if (opts.status === 'matched' || opts.status === 'locked') return 'matched';
  return 'invite';
}

interface DashboardStatsProps {
  couplesCount: number;
  pairsCount: number;
  singlesCount: number;
  geocodedCount: number;
  hostCount: number;
  envelopeCount: number;
  distanceWarnings: number;
  maxCouples: number | null;
  eventDate: Date;
  hasMatching: boolean;
  isPast: boolean;
  isToday: boolean;
  status: string;
}

function DashboardStats(props: DashboardStatsProps) {
  const phase = getPhase(props);
  const { couplesCount, pairsCount, singlesCount, geocodedCount, hostCount, envelopeCount, distanceWarnings, maxCouples, eventDate } = props;

  const daysUntil = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const daysLabel = daysUntil === 0 ? 'Idag!' : daysUntil === 1 ? 'Imorgon!' : daysUntil > 0 ? `${daysUntil} dagar` : 'Avslutad';
  const missingGeo = couplesCount - geocodedCount;

  const cards: StatCardProps[] = (() => {
    switch (phase) {
      case 'invite':
        return [
          {
            icon: '👥', label: 'Anmälda',
            value: maxCouples ? `${couplesCount} / ${maxCouples}` : String(couplesCount),
            progress: maxCouples ? couplesCount / maxCouples : undefined,
            variant: maxCouples && couplesCount >= maxCouples ? 'success' as const : 'default' as const,
            subtitle: `${pairsCount} par · ${singlesCount} singlar`,
          },
          {
            icon: '📍', label: 'Adresser',
            value: `${geocodedCount} / ${couplesCount}`,
            variant: missingGeo > 0 ? 'warning' as const : 'success' as const,
            subtitle: missingGeo > 0 ? `⚠️ ${missingGeo} saknar position` : 'redo för matchning ✅',
          },
          {
            icon: '📅', label: 'Dagar kvar',
            value: daysLabel,
            variant: daysUntil <= 7 && daysUntil > 0 ? 'warning' as const : 'default' as const,
          },
        ];

      case 'matched':
        return [
          { icon: '👥', label: 'Anmälda', value: String(couplesCount), subtitle: 'inbjudan stängd' },
          { icon: '🏠', label: 'Värdar', value: String(hostCount), subtitle: 'tilldelade' },
          { icon: '✉️', label: 'Kuvert', value: String(envelopeCount) },
          {
            icon: '🚴', label: 'Avstånd',
            value: distanceWarnings === 0 ? '0 varningar' : `${distanceWarnings} > 2km`,
            variant: distanceWarnings === 0 ? 'success' as const : 'warning' as const,
            subtitle: distanceWarnings === 0 ? 'alla inom 2 km ✅' : '⚠️ kolla kartan',
          },
        ];

      case 'active':
        return [
          { icon: '🎉', label: 'Gäster ikväll', value: `${couplesCount} par` },
          { icon: '🏠', label: 'Värdar', value: String(hostCount) },
          { icon: '✉️', label: 'Kuvert', value: String(envelopeCount) },
          { icon: '🔥', label: 'Status', value: 'Pågår!', variant: 'success' as const },
        ];

      case 'past':
        return [
          { icon: '👥', label: 'Deltagare', value: String(couplesCount) },
          { icon: '🏠', label: 'Värdar', value: String(hostCount) },
          { icon: '✉️', label: 'Kuvert', value: String(envelopeCount) },
          {
            icon: '📅', label: 'Datum',
            value: eventDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }),
          },
        ];
    }
  })();

  return (
    <div className={`grid gap-4 mb-6 ${cards.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
      {cards.map((card, i) => (
        <StatCard key={i} {...card} />
      ))}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  subtitle?: string;
  progress?: number;
  variant?: 'default' | 'warning' | 'success';
}

function StatCard({ label, value, icon, subtitle, progress, variant = 'default' }: StatCardProps) {
  const bg = variant === 'warning' ? 'bg-amber-50 border border-amber-200'
    : variant === 'success' ? 'bg-emerald-50 border border-emerald-200'
    : 'bg-white shadow-sm';

  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
