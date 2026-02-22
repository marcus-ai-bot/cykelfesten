import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { EventDashboard } from '@/components/organizer/EventDashboard';

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
  
  const { count: couplesCount } = await supabase
    .from('couples')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('cancelled', true);

  const { data: matchPlan } = await supabase
    .from('match_plans')
    .select('id')
    .eq('event_id', eventId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const eventDateObj = new Date(event.event_date);
  const today = new Date();
  const isPast = eventDateObj < today && eventDateObj.toDateString() !== today.toDateString();
  const isToday = eventDateObj.toDateString() === today.toDateString();

  const shortDate = eventDateObj.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <EventDashboard
      eventId={eventId}
      eventSlug={event.slug}
      eventName={event.name}
      shortDate={shortDate}
      eventStatus={event.status}
      couplesCount={couplesCount || 0}
      isPast={isPast}
      isToday={isToday}
      hasMatching={!!matchPlan}
    />
  );
}
