'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { countFunFacts, normaliseFunFacts } from '@/lib/fun-facts';

// Age clue generator
function getAgeClue(birthYear: number): string {
  const age = new Date().getFullYear() - birthYear;
  const references: Record<number, string> = {
    1974: "Född samma år som ABBA vann Eurovision",
    1985: "Herreys vann samma år",
    1989: "Murens-fall-årgång",
    1990: "90-talsbarn — Mulle Meck-generationen",
    1997: "Var 0 år när Titanic hade premiär",
    2000: "Milleniebarn",
    2007: "Född samma år som iPhone",
  };
  
  // Check exact match
  if (references[birthYear]) return references[birthYear];
  
  // Generate based on age
  if (birthYear <= 1960) return `${age} år — upplevde månlandningen`;
  if (birthYear <= 1970) return `${age} år — ABBA-generationen`;
  if (birthYear <= 1980) return `${age} år — såg Björn Borg live`;
  if (birthYear <= 1990) return `${age} år — minns Berlinmuren`;
  if (birthYear <= 2000) return `${age} år — 90-talsbarn`;
  return `${age} år — digital native`;
}

function getAgeDiffClue(year1: number, year2: number): string {
  const diff = Math.abs(year1 - year2);
  if (diff < 3) return "samma musiksmak";
  if (diff < 8) return "funkar fint på Spotify";
  if (diff < 15) return "generationsmix";
  return "knepigt musikval!";
}

function getFunFactClue(facts: Record<string, unknown>): string {
  const clues: string[] = [];
  
  if (facts.pet) {
    const pet = facts.pet as { type?: string; name?: string } | string;
    const petType = typeof pet === 'string' ? pet : pet.type;
    if (petType) clues.push(`Har en ${petType}`);
  }
  if (facts.talent) clues.push(`Kan ${facts.talent}`);
  if (facts.firstJob) clues.push(`Första jobbet: ${facts.firstJob}`);
  if (facts.dreamDestination) clues.push(`Drömmer om ${facts.dreamDestination}`);
  if (facts.instruments) {
    const instr = Array.isArray(facts.instruments) ? facts.instruments.join(', ') : facts.instruments;
    clues.push(`Spelar ${instr}`);
  }
  if (facts.sport) clues.push(`Gillar ${facts.sport}`);
  if (facts.unknownFact) clues.push(String(facts.unknownFact));
  if (facts.musicDecade) {
    const decades: Record<string, string> = {
      '60': '60-talsmusik', '70': 'ABBA-eran', '80': 'synthpop',
      '90': '90-talshits', '00': '2000-talsljud', '10': '10-talets hits', '20': 'modern musik'
    };
    clues.push(`Föredrar ${decades[String(facts.musicDecade)] || 'musik'}`);
  }
  
  if (clues.length === 0) return "Mystisk...";
  return clues[Math.floor(Math.random() * clues.length)];
}

interface Guest {
  couple_id: string;
  invited_name: string;
  partner_name: string | null;
  person_count: number;
  invited_allergies: string[] | null;
  invited_allergy_notes: string | null;
  partner_allergies: string[] | null;
  partner_allergy_notes: string | null;
  invited_birth_year: number | null;
  partner_birth_year: number | null;
  invited_fun_facts: Record<string, unknown> | null;
  partner_fun_facts: Record<string, unknown> | null;
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
    
    // Get guest details with allergies and fun facts
    const { data: guests } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, person_count, invited_allergies, invited_allergy_notes, partner_allergies, partner_allergy_notes, invited_birth_year, partner_birth_year, invited_fun_facts, partner_fun_facts')
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
        invited_birth_year: g.invited_birth_year,
        partner_birth_year: g.partner_birth_year,
        invited_fun_facts: g.invited_fun_facts,
        partner_fun_facts: g.partner_fun_facts,
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
        
        {/* Guest clues */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 shadow-lg mb-6 border border-purple-100">
          <h2 className="text-lg font-semibold text-purple-900 mb-2">
            🔮 Ledtrådar — Vem knackar på?
          </h2>
          <p className="text-purple-600 text-sm mb-4">
            Kan ni gissa vilka som kommer? 🕵️
          </p>
          
          <div className="space-y-4">
            {hostData.guests.map((guest, index) => (
              <div key={guest.couple_id} className="bg-white/70 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <span className="font-medium text-purple-900">
                    {guest.person_count} {guest.person_count === 1 ? 'person' : 'personer'}
                  </span>
                </div>
                
                <div className="text-purple-700 text-sm space-y-1">
                  {/* Age clues */}
                  {guest.invited_birth_year && (
                    <p>• {getAgeClue(guest.invited_birth_year)}</p>
                  )}
                  {guest.partner_birth_year && guest.invited_birth_year && (
                    <p>• Ålderskillnad: {Math.abs(guest.invited_birth_year - guest.partner_birth_year)} år — {getAgeDiffClue(guest.invited_birth_year, guest.partner_birth_year)}</p>
                  )}
                  
                  {/* Fun facts clues */}
                  {guest.invited_fun_facts && countFunFacts(guest.invited_fun_facts) > 0 && (
                    <p>• {getFunFactClue(normaliseFunFacts(guest.invited_fun_facts))}</p>
                  )}
                  {guest.partner_fun_facts && countFunFacts(guest.partner_fun_facts) > 0 && (
                    <p>• Partnern: {getFunFactClue(normaliseFunFacts(guest.partner_fun_facts))}</p>
                  )}
                  
                  {/* Fallback if no clues */}
                  {!guest.invited_birth_year && !guest.invited_fun_facts && (
                    <p className="italic text-purple-400">Mystisk gäst — inga ledtrådar tillgängliga</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Allergies - anonymized */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-4">
            ⚠️ Allergier & kostönskemål
          </h2>
          <p className="text-amber-600 text-sm mb-4">
            (Anonymiserat för att bevara överraskningen)
          </p>
          
          {allAllergies.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              🎉 Inga allergier rapporterade — fritt fram!
            </div>
          ) : (
            <div className="space-y-2">
              {/* Group allergies by type */}
              {(() => {
                const allergyCounts: Record<string, number> = {};
                allAllergies.forEach(item => {
                  item.allergies.forEach(a => {
                    allergyCounts[a] = (allergyCounts[a] || 0) + 1;
                  });
                  if (item.notes) {
                    allergyCounts[item.notes] = (allergyCounts[item.notes] || 0) + 1;
                  }
                });
                return Object.entries(allergyCounts).map(([allergy, count]) => (
                  <div key={allergy} className="flex items-center gap-3 bg-orange-50 rounded-lg px-4 py-3">
                    <span className="bg-orange-200 text-orange-800 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                      {count}
                    </span>
                    <span className="text-orange-900 font-medium">
                      {allergy}
                    </span>
                    <span className="text-orange-600 text-sm">
                      ({count} {count === 1 ? 'person' : 'personer'})
                    </span>
                  </div>
                ));
              })()}
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
