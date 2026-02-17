import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { MapView } from './MapView';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function MapPage({ params }: Props) {
  const { eventId } = await params;
  const organizer = await requireOrganizer();
  const access = await checkEventAccess(organizer.id, eventId);

  if (!access.hasAccess) {
    notFound();
  }

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .single();

  if (!event) {
    notFound();
  }

  return <MapView eventId={eventId} eventName={event.name} />;
}
