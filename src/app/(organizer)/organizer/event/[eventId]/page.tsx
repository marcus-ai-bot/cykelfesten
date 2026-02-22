import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PhasesStepper } from '@/components/organizer/PhasesStepper';
import StatusDropdown from '@/components/organizer/StatusDropdown';
import { HamburgerMenu } from '@/components/organizer/HamburgerMenu';

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
  const isFounder = access.role === 'founder';
  
  const shortDate = eventDateObj.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{event.name}</h1>
            <span className="text-sm text-gray-400 shrink-0">— {shortDate}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusDropdown eventId={eventId} currentStatus={event.status} />
            <HamburgerMenu eventId={eventId} eventSlug={event.slug} />
          </div>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-4 py-6">
        
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
// DashboardStats removed — info now shown in phase content (progress bar + filters)

