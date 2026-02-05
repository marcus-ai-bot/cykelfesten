'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Guest {
  couple_id: string;
  invited_name: string;
  partner_name: string | null;
  person_count: number;
  invited_allergies: string[] | null;
  invited_allergy_notes: string | null;
  partner_allergies: string[] | null;
  partner_allergy_notes: string | null;
}

interface HostData {
  couple_id: string;
  name: string;
  course: string;
  guests: Guest[];
}

export default function HostPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const emailParam = searchParams.get('email');
  
  const [event, setEvent] = useState<any>(null);
  const [hostData, setHostData] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [allCouples, setAllCouples] = useState<any[]>([]);
  const [selectingHost, setSelectingHost] = useState(false);
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [slug, emailParam]);
  
  async function loadData() {
    // Get event
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (!eventData) {
      setLoading(false);
      return;
    }
    setEvent(eventData);
    
    // Get all couples for selection
    const { data: couplesData } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, invited_email')
      .eq('event_id', eventData.id)
      .eq('cancelled', false)
      .order('invited_name');
    
    setAllCouples(couplesData || []);
    
    // Find host by email
    let selectedCouple = null;
    if (emailParam && couplesData) {
      selectedCouple = couplesData.find((c: any) => 
        c.invited_email?.toLowerCase().includes(emailParam.toLowerCase())
      );
    }
    
    if (!selectedCouple && couplesData?.length) {
      setSelectingHost(true);
      setLoading(false);
      return;
    }
    
    if (selectedCouple) {
      await loadHostData(selectedCouple.id, eventData.id, selectedCouple);
    }
    
    setLoading(false);
  }
  
  async function loadHostData(coupleId: string, eventId: string, couple: any) {
    // Get assignment
    const { data: assignment } = await supabase
      .from('assignments')
      .select('course')
      .eq('couple_id', coupleId)
      .single();
    
    if (!assignment) {
      setHostData(null);
      return;
    }
    
    // Get active match plan
    const { data: event } = await supabase
      .from('events')
      .select('active_match_plan_id')
      .eq('id', eventId)
      .single();
    
    if (!event?.active_match_plan_id) {
      setHostData(null);
      return;
    }
    
    // Get guests for this host
    const { data: pairings } = await supabase
      .from('course_pairings')
      .select('guest_couple_id')
      .eq('match_plan_id', event.active_match_plan_id)
      .eq('host_couple_id', coupleId)
      .eq('course', assignment.course);
    
    const guestIds = pairings?.map(p => p.guest_couple_id) || [];
    
    // Get guest details with allergies
    const { data: guests } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, person_count, invited_allergies, invited_allergy_notes, partner_allergies, partner_allergy_notes')
      .in('id', guestIds);
    
    setHostData({
      couple_id: coupleId,
      name: couple.partner_name 
        ? `${couple.invited_name} & ${couple.partner_name}`
        : couple.invited_name,
      course: assignment.course,
      guests: (guests || []).map(g => ({
        couple_id: g.id,
        invited_name: g.invited_name,
        partner_name: g.partner_name,
        person_count: g.person_count,
        invited_allergies: g.invited_allergies,
        invited_allergy_notes: g.invited_allergy_notes,
        partner_allergies: g.partner_allergies,
        partner_allergy_notes: g.partner_allergy_notes,
      })),
    });
  }
  
  async function selectHost(couple: any) {
    setSelectingHost(false);
    setLoading(true);
    await loadHostData(couple.id, event.id, couple);
    setLoading(false);
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-amber-600">Laddar...</div>
      </div>
    );
  }
  
  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-red-600">Event hittades inte</div>
      </div>
    );
  }
  
  // Host selector
  if (selectingHost) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-12">
        <div className="max-w-md mx-auto px-4">
          <h1 className="text-2xl font-bold text-amber-900 text-center mb-2">
            🏠 Värdvy
          </h1>
          <p className="text-amber-600 text-center mb-6 text-sm">
            Välj vem du är för att se dina gästers allergier
          </p>
          
          <div className="space-y-2">
            {allCouples.map(c => (
              <button
                key={c.id}
                onClick={() => selectHost(c)}
                className="w-full bg-white hover:bg-amber-50 p-4 rounded-xl shadow text-left transition-colors"
              >
                <div className="font-medium text-amber-900">
                  {c.invited_name}
                  {c.partner_name && ` & ${c.partner_name}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }
  
  if (!hostData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-lg text-center">
          <div className="text-4xl mb-3">🤷</div>
          <h2 className="text-xl font-semibold text-amber-900 mb-2">Ingen värduppgift</h2>
          <p className="text-amber-600 mb-4">Matchningen kanske inte är klar ännu.</p>
          <Link href={`/e/${slug}/my`} className="text-amber-500 hover:text-amber-600">
            ← Tillbaka till mina kuvert
          </Link>
        </div>
      </div>
    );
  }
  
  const courseLabels: Record<string, string> = {
    starter: '🥗 Förrätt',
    main: '🍖 Huvudrätt',
    dessert: '🍰 Efterrätt',
  };
  
  const totalGuests = hostData.guests.reduce((sum, g) => sum + g.person_count, 0);
  
  // Collect all allergies
  const allAllergies: { name: string; allergies: string[]; notes: string | null }[] = [];
  for (const guest of hostData.guests) {
    if (guest.invited_allergies?.length || guest.invited_allergy_notes) {
      allAllergies.push({
        name: guest.invited_name,
        allergies: guest.invited_allergies || [],
        notes: guest.invited_allergy_notes,
      });
    }
    if (guest.partner_name && (guest.partner_allergies?.length || guest.partner_allergy_notes)) {
      allAllergies.push({
        name: guest.partner_name,
        allergies: guest.partner_allergies || [],
        notes: guest.partner_allergy_notes,
      });
    }
  }
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-8">
      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-amber-900 mb-1">
            🏠 Värdvy
          </h1>
          <p className="text-amber-600">{event.name}</p>
        </div>
        
        {/* Host info */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
          <div className="text-center">
            <div className="text-lg font-semibold text-amber-900 mb-1">
              {hostData.name}
            </div>
            <div className="text-3xl mb-2">{courseLabels[hostData.course]}</div>
            <div className="text-amber-600">
              {totalGuests} gäster kommer till er
            </div>
          </div>
        </div>
        
        {/* Guest list */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-4">
            👥 Era gäster
          </h2>
          
          <div className="space-y-3">
            {hostData.guests.map(guest => (
              <div key={guest.couple_id} className="border-b border-amber-100 pb-3 last:border-0 last:pb-0">
                <div className="font-medium text-gray-900">
                  {guest.invited_name}
                  {guest.partner_name && ` & ${guest.partner_name}`}
                </div>
                <div className="text-sm text-gray-500">
                  {guest.person_count} {guest.person_count === 1 ? 'person' : 'personer'}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Allergies */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-4">
            ⚠️ Allergier & kostönskemål
          </h2>
          
          {allAllergies.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              🎉 Inga allergier rapporterade!
            </div>
          ) : (
            <div className="space-y-4">
              {allAllergies.map((item, i) => (
                <div key={i} className="bg-orange-50 rounded-lg p-4">
                  <div className="font-medium text-orange-900 mb-1">{item.name}</div>
                  {item.allergies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {item.allergies.map((a, j) => (
                        <span key={j} className="px-2 py-1 bg-orange-200 text-orange-800 rounded-full text-sm">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-sm text-orange-700 italic">
                      "{item.notes}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Tips */}
        <div className="bg-amber-100 rounded-xl p-4 mb-6">
          <h3 className="font-medium text-amber-900 mb-2">💡 Tips för värdar</h3>
          <ul className="text-sm text-amber-700 space-y-1">
            <li>• Kolla allergier noggrant innan ni handlar</li>
            <li>• Ha ingredienslista redo att visa vid frågor</li>
            <li>• Förbered för att gästerna kan komma ±10 min</li>
            <li>• Ta emot med ett leende! 😊</li>
          </ul>
        </div>
        
        {/* Navigation */}
        <div className="flex gap-4">
          <Link 
            href={`/e/${slug}/my`}
            className="flex-1 py-3 bg-white text-amber-600 text-center rounded-xl shadow hover:bg-amber-50"
          >
            ← Mina kuvert
          </Link>
          <button
            onClick={() => setSelectingHost(true)}
            className="flex-1 py-3 bg-amber-100 text-amber-700 text-center rounded-xl hover:bg-amber-200"
          >
            Byt värd
          </button>
        </div>
      </div>
    </main>
  );
}
