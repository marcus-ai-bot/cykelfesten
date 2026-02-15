import { createAdminClient } from '@/lib/supabase/server';
import { requireOrganizer, checkEventAccess } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function GuestsPage({ params }: Props) {
  const { eventId } = await params;
  const organizer = await requireOrganizer();
  
  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) notFound();
  
  const supabase = createAdminClient();
  
  const { data: event } = await supabase
    .from('events')
    .select('id, name, slug')
    .eq('id', eventId)
    .single();
  
  if (!event) notFound();
  
  const { data: couples } = await supabase
    .from('couples')
    .select('*')
    .eq('event_id', eventId)
    .neq('cancelled', true)
    .order('created_at', { ascending: false });
  
  const activeCouples = couples || [];
  const totalPersons = activeCouples.reduce((sum, c) => sum + (c.partner_name ? 2 : 1), 0);
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-500 hover:text-gray-700">
            ← {event.name}
          </Link>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">👥 Gästlista</h1>
            <p className="text-gray-500 mt-1">
              {activeCouples.length} par · {totalPersons} personer
            </p>
          </div>
        </div>
        
        {activeCouples.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🦗</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Inga anmälda ännu</h3>
            <p className="text-gray-500 mb-4">Dela inbjudningslänken för att samla gäster!</p>
            <Link
              href={`/organizer/event/${eventId}`}
              className="text-indigo-600 hover:text-indigo-700"
            >
              ← Tillbaka till eventet
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {activeCouples.map((couple) => (
              <CoupleCard key={couple.id} couple={couple} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CoupleCard({ couple }: { couple: any }) {
  const registeredAt = new Date(couple.created_at).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const allergies = [
    ...(couple.invited_allergies || []),
    ...(couple.partner_allergies || []),
  ].filter(Boolean);
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Names */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">
              {couple.invited_name}
              {couple.partner_name && (
                <span className="text-gray-400 font-normal"> &amp; </span>
              )}
              {couple.partner_name && (
                <span>{couple.partner_name}</span>
              )}
            </h3>
          </div>
          
          {/* Contact */}
          <div className="text-sm text-gray-500 space-y-0.5">
            {couple.invited_email && (
              <p>📧 {couple.invited_email}</p>
            )}
            {couple.partner_email && (
              <p>📧 {couple.partner_email} <span className="text-gray-400">(partner)</span></p>
            )}
            {couple.invited_phone && (
              <p>📱 {couple.invited_phone}</p>
            )}
            {couple.address && (
              <p>📍 {couple.address}{couple.address_unit ? `, ${couple.address_unit}` : ''}</p>
            )}
          </div>
          
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-3">
            {couple.course_preference && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
                🍽️ {couple.course_preference === 'starter' ? 'Förrätt' : couple.course_preference === 'main' ? 'Huvudrätt' : 'Dessert'}
              </span>
            )}
            {allergies.length > 0 && (
              <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full">
                ⚠️ {allergies.join(', ')}
              </span>
            )}
            {(couple.invited_pet_allergy !== 'none' || couple.partner_pet_allergy !== 'none') && (
              <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-full">
                🐾 Djurallergi
              </span>
            )}
            {couple.accessibility_needs && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                ♿ {couple.accessibility_needs}
              </span>
            )}
            {!couple.partner_name && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                Singel/Solo
              </span>
            )}
          </div>
        </div>
        
        {/* Right side: timestamp */}
        <div className="text-xs text-gray-400 text-right ml-4 shrink-0">
          {registeredAt}
        </div>
      </div>
    </div>
  );
}
