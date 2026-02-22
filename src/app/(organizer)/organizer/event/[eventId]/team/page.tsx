import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { InviteTeamSection } from '@/components/organizer/InviteTeamSection';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function TeamPage({ params }: Props) {
  const { eventId } = await params;
  const organizer = await requireOrganizer();

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) notFound();

  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();

  if (!event) notFound();

  const { data: organizers } = await supabase
    .from('event_organizers')
    .select(`*, organizer:organizers(id, name, email)`)
    .eq('event_id', eventId)
    .is('removed_at', null)
    .order('role', { ascending: true });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-500 hover:text-gray-700 text-sm">
            ← {event.name}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Arrangörsteam</h1>
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <InviteTeamSection
            eventId={eventId}
            organizers={organizers || []}
            isFounder={access.role === 'founder'}
            currentOrganizerId={organizer.id}
          />
        </div>
      </main>
    </div>
  );
}
