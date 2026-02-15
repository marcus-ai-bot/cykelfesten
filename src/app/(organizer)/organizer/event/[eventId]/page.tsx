import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { InviteTeamSection } from '@/components/organizer/InviteTeamSection';
import { GuestPreviewSection } from '@/components/organizer/GuestPreviewSection';

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
    .is('cancelled', null);
  
  const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const isPast = new Date(event.event_date) < new Date();
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
        
        {/* Main Actions Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Guests */}
          <ActionCard
            href={`/organizer/event/${eventId}/guests`}
            title="Gästlista"
            description="Hantera registreringar och bekräftelser"
            icon="👥"
            count={couplesCount || 0}
          />
          
          {/* Matching */}
          <ActionCard
            href={`/organizer/event/${eventId}/matching`}
            title="Matchning"
            description="Koppla ihop gäster med värdar"
            icon="🔀"
            disabled={!couplesCount}
          />
          
          {/* Envelopes */}
          <ActionCard
            href={`/organizer/event/${eventId}/envelopes`}
            title="Kuvert"
            description="Hantera digitala kuvert och timing"
            icon="✉️"
          />
          
          {/* Settings */}
          <ActionCard
            href={`/organizer/event/${eventId}/settings`}
            title="Inställningar"
            description="Datum, tider och features"
            icon="⚙️"
          />
        </div>
        
        {/* Guest Preview Section */}
        <GuestPreviewSection eventId={eventId} slug={event.slug} />
        
        {/* Team Section */}
        <InviteTeamSection 
          eventId={eventId} 
          organizers={organizers || []}
          isFounder={isFounder}
          currentOrganizerId={organizer.id}
        />
        
        {/* Post-Event Actions (if past) */}
        {isPast && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-6 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              🎬 Efterfest & Wraps
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Link
                href={`/organizer/event/${eventId}/wraps`}
                className="bg-white rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="text-2xl mb-2">📧</div>
                <div className="font-medium">Skicka Wraps</div>
                <div className="text-sm text-gray-500">Personliga sammanfattningar</div>
              </Link>
              <Link
                href={`/e/${event.slug}/memories`}
                target="_blank"
                className="bg-white rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="text-2xl mb-2">📸</div>
                <div className="font-medium">Se Memories</div>
                <div className="text-sm text-gray-500">Statistik och hälsningar</div>
              </Link>
            </div>
          </div>
        )}
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

function ActionCard({ 
  href, 
  title, 
  description, 
  icon, 
  count,
  disabled 
}: { 
  href: string; 
  title: string; 
  description: string; 
  icon: string;
  count?: number;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="bg-gray-100 rounded-xl p-6 opacity-50 cursor-not-allowed">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl mb-3">{icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <Link
      href={href}
      className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-indigo-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl mb-3">{icon}</div>
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        {count !== undefined && (
          <div className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-sm font-medium">
            {count}
          </div>
        )}
      </div>
    </Link>
  );
}
