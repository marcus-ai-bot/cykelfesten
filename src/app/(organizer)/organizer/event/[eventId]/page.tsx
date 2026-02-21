import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PhasesStepper } from '@/components/organizer/PhasesStepper';

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
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
                {isPast && (
                  <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Avslutad
                  </span>
                )}
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
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard 
            label="Par/Gäster" 
            value={couplesCount || 0}
            icon="👥"
          />
          <StatCard 
            label="Arrangörer" 
            value={organizers?.filter(o => o.accepted_at).length || 0}
            icon="🎯"
          />
          <StatCard 
            label="Bekräftade" 
            value="—"
            icon="✅"
          />
          <StatCard 
            label="Värdar" 
            value="—"
            icon="🏠"
          />
        </div>
        
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

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
