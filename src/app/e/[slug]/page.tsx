import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Event } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();
  
  if (!event) {
    notFound();
  }
  
  const typedEvent = event as Event;
  
  // Format date
  const eventDate = new Date(typedEvent.event_date);
  const formattedDate = eventDate.toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Event Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-amber-900 mb-2">
            🎉 {typedEvent.name}
          </h1>
          <p className="text-xl text-amber-700 capitalize">
            {formattedDate}
          </p>
          {typedEvent.description && (
            <p className="text-amber-600 mt-4 max-w-md mx-auto">
              {typedEvent.description}
            </p>
          )}
        </div>
        
        {/* Status Badge */}
        <div className="flex justify-center mb-8">
          <StatusBadge status={typedEvent.status} />
        </div>
        
        {/* Schedule */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-lg font-semibold text-amber-900 mb-4">
            📅 Kvällens schema
          </h2>
          <div className="space-y-3">
            {typedEvent.gathering_time && (
              <ScheduleItem 
                time={typedEvent.gathering_time} 
                label="Samling" 
                location={typedEvent.gathering_location}
                offset={typedEvent.time_offset_minutes}
              />
            )}
            <ScheduleItem 
              time={typedEvent.starter_time} 
              label="Förrätt" 
              offset={typedEvent.time_offset_minutes}
            />
            <ScheduleItem 
              time={typedEvent.main_time} 
              label="Huvudrätt" 
              offset={typedEvent.time_offset_minutes}
            />
            <ScheduleItem 
              time={typedEvent.dessert_time} 
              label="Efterrätt" 
              offset={typedEvent.time_offset_minutes}
            />
            {typedEvent.afterparty_time && (
              <ScheduleItem 
                time={typedEvent.afterparty_time} 
                label="Efterfest" 
                location={typedEvent.afterparty_location}
                offset={typedEvent.time_offset_minutes}
              />
            )}
          </div>
          {typedEvent.time_offset_minutes > 0 && (
            <p className="text-sm text-amber-500 mt-4">
              ⚠️ Tiderna är justerade +{typedEvent.time_offset_minutes} min
            </p>
          )}
        </div>
        
        {/* Registration CTA */}
        {typedEvent.status === 'open' && (
          <div className="text-center">
            <Link 
              href={`/e/${slug}/register`}
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-4 rounded-xl text-lg shadow-lg transition-colors"
            >
              ✨ Anmäl dig & din partner
            </Link>
            <p className="text-amber-600 text-sm mt-3">
              Singlar är också välkomna!
            </p>
          </div>
        )}
        
        {typedEvent.status === 'draft' && (
          <div className="text-center bg-amber-100 rounded-xl p-6">
            <p className="text-amber-700">
              🔒 Anmälan är inte öppen ännu
            </p>
          </div>
        )}
        
        {['matched', 'locked', 'in_progress'].includes(typedEvent.status) && (
          <div className="text-center">
            <Link 
              href={`/e/${slug}/my`}
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-4 rounded-xl text-lg shadow-lg transition-colors"
            >
              🔑 Logga in för att se din sida
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    draft: { label: 'Kommande', color: 'bg-gray-200 text-gray-700' },
    open: { label: 'Anmälan öppen', color: 'bg-green-100 text-green-700' },
    matched: { label: 'Matchning klar', color: 'bg-blue-100 text-blue-700' },
    locked: { label: 'Låst', color: 'bg-amber-100 text-amber-700' },
    in_progress: { label: 'Pågår', color: 'bg-orange-100 text-orange-700' },
    completed: { label: 'Avslutad', color: 'bg-gray-100 text-gray-600' },
  };
  
  const { label, color } = config[status] || config.draft;
  
  return (
    <span className={`px-4 py-2 rounded-full text-sm font-medium ${color}`}>
      {label}
    </span>
  );
}

function ScheduleItem({ 
  time, 
  label, 
  location,
  offset = 0 
}: { 
  time: string; 
  label: string; 
  location?: string | null;
  offset?: number;
}) {
  // Parse time and add offset
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + offset;
  const adjustedHours = Math.floor(totalMinutes / 60) % 24;
  const adjustedMinutes = totalMinutes % 60;
  const formattedTime = `${String(adjustedHours).padStart(2, '0')}:${String(adjustedMinutes).padStart(2, '0')}`;
  
  return (
    <div className="flex items-center gap-4">
      <span className="text-amber-900 font-mono font-semibold w-16">
        {formattedTime}
      </span>
      <span className="text-amber-700">{label}</span>
      {location && (
        <span className="text-amber-500 text-sm">@ {location}</span>
      )}
    </div>
  );
}
