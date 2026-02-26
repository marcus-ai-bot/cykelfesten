import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';
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

  // Fetch last active session per organizer
  const organizerIds = (organizers || []).map(o => o.organizer_id);
  let lastActiveMap: Record<string, string> = {};

  if (organizerIds.length > 0) {
    const { data: sessions } = await supabase
      .from('organizer_sessions')
      .select('organizer_id, last_used_at')
      .in('organizer_id', organizerIds)
      .order('last_used_at', { ascending: false });

    // Keep only the most recent per organizer
    for (const s of sessions || []) {
      if (s.last_used_at && !lastActiveMap[s.organizer_id]) {
        lastActiveMap[s.organizer_id] = s.last_used_at;
      }
    }
  }

  // Merge last_active_at into organizers
  const enrichedOrganizers = (organizers || []).map(o => ({
    ...o,
    last_active_at: lastActiveMap[o.organizer_id] || null,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="👥 Arrangörsteam" parentView="invite" />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Arrangörsteam</h1>
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <InviteTeamSection
            eventId={eventId}
            organizers={enrichedOrganizers}
            isFounder={access.role === 'founder'}
            currentOrganizerId={organizer.id}
          />
        </div>
      </main>
    </div>
  );
}
