'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Envelope } from '@/components/envelope/Envelope';
import Link from 'next/link';

interface CoupleData {
  id: string;
  invited_name: string;
  partner_name: string | null;
  address: string;
}

interface EnvelopeData {
  id: string;
  course: 'starter' | 'main' | 'dessert';
  scheduled_at: string;
  activated_at: string | null;
  opened_at: string | null;
  destination_address: string;
  destination_notes: string | null;
  host_couple_id: string;
}

interface EventData {
  id: string;
  name: string;
  event_date: string;
  starter_time: string;
  main_time: string;
  dessert_time: string;
  time_offset_minutes: number;
}

export default function MyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  
  // For demo: allow ?email=x to select couple
  const emailParam = searchParams.get('email');
  
  const [event, setEvent] = useState<EventData | null>(null);
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [envelopes, setEnvelopes] = useState<EnvelopeData[]>([]);
  const [assignment, setAssignment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingCouple, setSelectingCouple] = useState(false);
  const [allCouples, setAllCouples] = useState<CoupleData[]>([]);
  const [showDropoutModal, setShowDropoutModal] = useState(false);
  const [dropoutLoading, setDropoutLoading] = useState(false);
  const [dropoutSuccess, setDropoutSuccess] = useState(false);
  
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
    
    // Get all couples for selection (demo mode)
    const { data: couplesData } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, address, invited_email')
      .eq('event_id', eventData.id)
      .eq('cancelled', false)
      .order('invited_name');
    
    setAllCouples(couplesData || []);
    
    // Find couple by email or show selector
    let selectedCouple = null;
    if (emailParam && couplesData) {
      selectedCouple = couplesData.find((c: any) => 
        c.invited_email?.toLowerCase().includes(emailParam.toLowerCase())
      );
    }
    
    if (!selectedCouple && couplesData?.length) {
      setSelectingCouple(true);
      setLoading(false);
      return;
    }
    
    if (selectedCouple) {
      setCouple(selectedCouple);
      await loadCoupleData(selectedCouple.id, eventData.id);
    }
    
    setLoading(false);
  }
  
  async function loadCoupleData(coupleId: string, eventId: string) {
    // Get latest match plan
    const { data: planData } = await supabase
      .from('match_plans')
      .select('id')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
      .limit(1)
      .single();
    
    if (!planData) return;
    
    // Get envelopes
    const { data: envelopesData } = await supabase
      .from('envelopes')
      .select('*')
      .eq('match_plan_id', planData.id)
      .eq('couple_id', coupleId)
      .order('scheduled_at');
    
    setEnvelopes(envelopesData || []);
    
    // Get assignment (what course they're cooking)
    // Since assignments table might be empty, derive from envelopes
    const hostEnvelope = envelopesData?.find(e => e.host_couple_id === coupleId);
    if (hostEnvelope) {
      setAssignment(hostEnvelope.course);
    }
  }
  
  async function selectCouple(c: CoupleData) {
    setCouple(c);
    setSelectingCouple(false);
    setLoading(true);
    await loadCoupleData(c.id, event!.id);
    setLoading(false);
  }
  
  async function markEnvelopeOpened(envelopeId: string) {
    await supabase
      .from('envelopes')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', envelopeId);
    
    // Update local state
    setEnvelopes(prev => prev.map(e => 
      e.id === envelopeId ? { ...e, opened_at: new Date().toISOString() } : e
    ));
  }
  
  async function handleDropout() {
    if (!couple) return;
    
    setDropoutLoading(true);
    
    try {
      const res = await fetch('/api/dropout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couple_id: couple.id,
          reason: 'Användaren hoppade av',
          is_host_dropout: !!assignment, // If they have an assignment, they're a host
        }),
      });
      
      if (res.ok) {
        setDropoutSuccess(true);
      } else {
        alert('Något gick fel. Försök igen.');
      }
    } catch (err) {
      alert('Kunde inte registrera avhopp. Försök igen.');
    } finally {
      setDropoutLoading(false);
    }
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
  
  // Couple selector (demo mode)
  if (selectingCouple) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-12">
        <div className="max-w-md mx-auto px-4">
          <h1 className="text-2xl font-bold text-amber-900 text-center mb-2">
            🔑 Välj deltagare
          </h1>
          <p className="text-amber-600 text-center mb-6 text-sm">
            (Demo-läge — i produktion loggar man in)
          </p>
          
          <div className="space-y-2">
            {allCouples.map(c => (
              <button
                key={c.id}
                onClick={() => selectCouple(c)}
                className="w-full bg-white hover:bg-amber-50 p-4 rounded-xl shadow text-left transition-colors"
              >
                <div className="font-medium text-amber-900">
                  {c.invited_name}
                  {c.partner_name && ` & ${c.partner_name}`}
                </div>
                <div className="text-sm text-amber-600">{c.address}</div>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }
  
  if (!couple) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-amber-600">Ingen deltagare vald</div>
      </div>
    );
  }
  
  const courseLabels: Record<string, string> = {
    starter: '🥗 Förrätt',
    main: '🍖 Huvudrätt',
    dessert: '🍰 Efterrätt',
  };
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-8">
      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-amber-900 mb-1">
            🎉 {event.name}
          </h1>
          <p className="text-amber-600">
            {new Date(event.event_date).toLocaleDateString('sv-SE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        
        {/* Welcome */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-6 text-center">
          <h2 className="text-xl font-semibold text-amber-900 mb-1">
            Välkommen {couple.invited_name}
            {couple.partner_name && ` & ${couple.partner_name}`}!
          </h2>
          
          {assignment && (
            <div className="mt-4 bg-amber-100 rounded-lg p-3">
              <div className="text-sm text-amber-600">Er uppgift</div>
              <div className="text-lg font-semibold text-amber-900">
                Ni lagar {courseLabels[assignment]}
              </div>
            </div>
          )}
          
          <button
            onClick={() => setSelectingCouple(true)}
            className="mt-4 text-sm text-amber-500 hover:text-amber-600"
          >
            Byt deltagare (demo)
          </button>
        </div>
        
        {/* Envelopes */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-amber-900">
            📍 Kvällens kuvert
          </h3>
          
          {envelopes.length === 0 ? (
            <div className="bg-white rounded-xl p-6 shadow text-center text-amber-600">
              Matchningen är inte klar ännu. Kom tillbaka senare!
            </div>
          ) : (
            envelopes.map(envelope => (
              <Envelope
                key={envelope.id}
                course={envelope.course}
                scheduledAt={envelope.scheduled_at}
                activatedAt={envelope.activated_at}
                openedAt={envelope.opened_at}
                address={envelope.destination_address}
                addressNotes={envelope.destination_notes}
                isHost={envelope.host_couple_id === couple.id}
                onOpen={() => markEnvelopeOpened(envelope.id)}
              />
            ))
          )}
        </div>
        
        {/* Dropout section */}
        <div className="mt-8 pt-6 border-t border-amber-200">
          <button
            onClick={() => setShowDropoutModal(true)}
            className="w-full py-3 text-red-500 hover:text-red-600 text-sm font-medium"
          >
            😢 Vi kan tyvärr inte komma
          </button>
        </div>
        
        {/* Footer */}
        <div className="mt-4 text-center">
          <Link 
            href={`/e/${slug}`}
            className="text-amber-500 hover:text-amber-600 text-sm"
          >
            ← Tillbaka till event
          </Link>
        </div>
      </div>
      
      {/* Dropout Modal */}
      {showDropoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            {dropoutSuccess ? (
              <>
                <h3 className="text-xl font-semibold text-amber-900 mb-3">
                  ✅ Avhopp registrerat
                </h3>
                <p className="text-amber-700 mb-6">
                  Vi har noterat att ni inte kan komma. Arrangören har fått besked.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                >
                  Stäng
                </button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-amber-900 mb-3">
                  😢 Hoppa av?
                </h3>
                <p className="text-amber-700 mb-2">
                  Är ni säkra på att ni vill hoppa av {event?.name}?
                </p>
                {assignment && (
                  <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">
                    ⚠️ Ni är värdar för {courseLabels[assignment]}. 
                    Era gäster kommer att omplaceras.
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDropoutModal(false)}
                    className="flex-1 py-3 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"
                    disabled={dropoutLoading}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleDropout}
                    disabled={dropoutLoading}
                    className="flex-1 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    {dropoutLoading ? 'Registrerar...' : 'Ja, hoppa av'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
