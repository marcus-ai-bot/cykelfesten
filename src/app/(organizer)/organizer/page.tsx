import { requireOrganizer, getOrganizerWithEvents } from '@/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function OrganizerDashboard() {
  const organizer = await getOrganizerWithEvents();
  
  if (!organizer) {
    redirect('/login');
  }
  
  // If no name, go to onboarding
  if (!organizer.name) {
    redirect('/organizer/onboarding');
  }
  
  const upcomingEvents = organizer.events
    .filter(e => new Date(e.event.event_date) >= new Date())
    .sort((a, b) => new Date(a.event.event_date).getTime() - new Date(b.event.event_date).getTime());
  
  const pastEvents = organizer.events
    .filter(e => new Date(e.event.event_date) < new Date())
    .sort((a, b) => new Date(b.event.event_date).getTime() - new Date(a.event.event_date).getTime());
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚴</span>
            <h1 className="text-xl font-bold text-gray-900">Cykelfesten</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{organizer.name}</span>
            <Link 
              href="/api/auth/logout"
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Logga ut
            </Link>
          </div>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Hej {organizer.name?.split(' ')[0]}! 👋
          </h2>
          <p className="text-gray-600">
            Här hanterar du dina cykelfester.
          </p>
        </div>
        
        {/* Create New Event CTA */}
        <Link
          href="/organizer/new-event"
          className="block bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl p-6 mb-8 hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold mb-1">Skapa ny cykelfest</h3>
              <p className="text-indigo-100">Sätt upp datum, bjud in gäster och kör!</p>
            </div>
            <div className="text-4xl">➕</div>
          </div>
        </Link>
        
        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <section className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              📅 Kommande fester
            </h3>
            <div className="grid gap-4">
              {upcomingEvents.map(({ event, role }) => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  role={role}
                  status="upcoming"
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Past Events */}
        {pastEvents.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              📜 Tidigare fester
            </h3>
            <div className="grid gap-4">
              {pastEvents.map(({ event, role }) => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  role={role}
                  status="past"
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Empty State */}
        {organizer.events.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Dags att skapa din första cykelfest!
            </h3>
            <p className="text-gray-600 mb-6">
              Klicka på knappen ovan för att komma igång.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function EventCard({ 
  event, 
  role, 
  status 
}: { 
  event: { id: string; name: string; slug: string; event_date: string };
  role: 'founder' | 'co-organizer';
  status: 'upcoming' | 'past';
}) {
  const date = new Date(event.event_date).toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const daysUntil = Math.ceil(
    (new Date(event.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  
  return (
    <Link
      href={`/organizer/event/${event.id}`}
      className={`block bg-white rounded-xl p-6 border hover:border-indigo-300 hover:shadow-md transition-all ${
        status === 'past' ? 'opacity-75' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-lg font-semibold text-gray-900">{event.name}</h4>
            {role === 'founder' && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                Grundare
              </span>
            )}
          </div>
          <p className="text-gray-600 capitalize">{date}</p>
        </div>
        <div className="text-right">
          {status === 'upcoming' && daysUntil > 0 && (
            <div className="text-indigo-600 font-semibold">
              {daysUntil === 1 ? 'Imorgon!' : `Om ${daysUntil} dagar`}
            </div>
          )}
          {status === 'upcoming' && daysUntil === 0 && (
            <div className="text-green-600 font-bold">Idag! 🎉</div>
          )}
          {status === 'past' && (
            <div className="text-gray-500">Avslutad</div>
          )}
        </div>
      </div>
    </Link>
  );
}
