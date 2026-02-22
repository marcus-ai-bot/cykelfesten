import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PhasesStepper } from '@/components/organizer/PhasesStepper';
import StatusDropdown from '@/components/organizer/StatusDropdown';
import { HamburgerMenu } from '@/components/organizer/HamburgerMenu';
import { CollapsibleHeader } from '@/components/organizer/CollapsibleHeader';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function OrganizerEventPage({ params }: Props) {
  const { eventId } = await params;
  const organizer = await requireOrganizer();
  
  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) notFound();
  
  const supabase = createAdminClient();
  
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();
  
  if (!event) notFound();
  
  const { data: organizers } = await supabase
    .from('event_organizers')
    .select(`*, organizer:organizers(id, name, email)`)
    .eq('event_id', eventId)
    .is('removed_at', null)
    .order('role', { ascending: true });
  
  const { count: couplesCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('cancelled', true);

  const { count: confirmedCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('confirmed', true)
    .neq('cancelled', true);

  const { count: hostCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('role', 'host')
    .neq('cancelled', true);

  const { count: pairsCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('cancelled', true)
    .not('partner_name', 'is', null);

  const singlesCount = (couplesCount || 0) - (pairsCount || 0);

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

  let envelopeCount = 0;
  if (matchPlan) {
    const { count: envCount } = await supabase
      .from('envelopes')
      .select('*', { count: 'exact', head: true })
      .eq('match_plan_id', matchPlan.id);
    envelopeCount = envCount || 0;
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
  const daysUntilEvent = Math.ceil((eventDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/organizer" className="text-gray-500 hover:text-gray-700 text-sm">
            ← Alla fester
          </Link>
          <HamburgerMenu eventId={eventId} />
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Expanded Event Header */}
        <CollapsibleHeader
          eventName={event.name}
          eventDate={eventDate}
          city={event.city}
          eventId={eventId}
          eventSlug={event.slug}
          status={event.status}
          couplesCount={couplesCount || 0}
          hostCount={hostCount || 0}
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
          pairsCount={pairsCount || 0}
          singlesCount={singlesCount}
          geocodedCount={geocodedCount || 0}
          hostCount={hostCount || 0}
          envelopeCount={envelopeCount}
          daysUntilEvent={daysUntilEvent}
          maxCouples={event.max_couples}
        />
      </main>
    </div>
  );
}
