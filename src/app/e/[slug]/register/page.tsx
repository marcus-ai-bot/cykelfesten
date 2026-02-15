'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Course } from '@/types/database';

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-amber-700 text-lg">Laddar...</div>
      </main>
    }>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const inviteToken = searchParams.get('invite');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(true);
  const [accessGranted, setAccessGranted] = useState<boolean | null>(null); // null = checking
  
  const [form, setForm] = useState({
    invited_name: '',
    invited_email: '',
    invited_phone: '',
    invited_allergies: '',
    invited_birth_year: '',
    invited_fun_facts: {
      musicDecade: '',
      pet: '',
      talent: '',
      firstJob: '',
      dreamDestination: '',
      instruments: '',
      sport: '',
      unknownFact: '',
      importantYear: '',
    },
    partner_name: '',
    partner_email: '',
    partner_allergies: '',
    partner_birth_year: '',
    partner_fun_facts: {
      musicDecade: '',
      pet: '',
      talent: '',
      firstJob: '',
      dreamDestination: '',
      instruments: '',
      sport: '',
      unknownFact: '',
      importantYear: '',
    },
    address: '',
    address_unit: '',
    address_notes: '',
    course_preference: '' as Course | '',
    instagram_handle: '',
    invited_pet_allergy: 'none',
    partner_pet_allergy: 'none',
    accessibility_needs: '',
    accessibility_ok: true,
  });
  
  // Verify invite token on mount
  useEffect(() => {
    if (!inviteToken) {
      setAccessGranted(false);
      return;
    }
    fetch(`/api/register/verify-invite?slug=${slug}&invite=${inviteToken}`)
      .then(r => r.json())
      .then(data => setAccessGranted(data.valid === true))
      .catch(() => setAccessGranted(false));
  }, [slug, inviteToken]);

  const handleFunFactChange = (person: 'invited' | 'partner', field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      [`${person}_fun_facts`]: {
        ...(prev[`${person}_fun_facts` as keyof typeof prev] as object),
        [field]: value,
      },
    }));
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      
      // Get event by slug
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, status')
        .eq('slug', slug)
        .single();
      
      if (eventError || !event) {
        throw new Error('Event hittades inte');
      }
      
      if (event.status !== 'open') {
        throw new Error('Anmälan är inte öppen för detta event');
      }
      
      // Parse allergies to array
      const parseAllergies = (str: string): string[] => 
        str.split(',').map(s => s.trim()).filter(Boolean);
      
      // Build fun facts as array of readable strings (for clue system)
      const buildFunFacts = (facts: typeof form.invited_fun_facts): string[] => {
        const result: string[] = [];
        if (facts.musicDecade) result.push(`Tycker att ${facts.musicDecade}-talets musik var bäst`);
        if (facts.pet) result.push(`Har husdjur: ${facts.pet}`);
        if (facts.talent) result.push(`Hemligt talent: ${facts.talent}`);
        if (facts.firstJob) result.push(`Första jobbet var ${facts.firstJob}`);
        if (facts.dreamDestination) result.push(`Drömresmål: ${facts.dreamDestination}`);
        if (facts.instruments) result.push(`Spelar ${facts.instruments}`);
        if (facts.sport) result.push(`Sportar: ${facts.sport}`);
        if (facts.unknownFact) result.push(facts.unknownFact);
        if (facts.importantYear) result.push(`Viktigt år: ${facts.importantYear}`);
        return result;
      };
      
      // Insert couple and get ID back
      const { data: insertedCouple, error: insertError } = await supabase
        .from('couples')
        .insert({
          event_id: event.id,
          invited_name: form.invited_name,
          invited_email: form.invited_email,
          invited_phone: form.invited_phone || null,
          invited_allergies: parseAllergies(form.invited_allergies),
          invited_birth_year: form.invited_birth_year ? parseInt(form.invited_birth_year) : null,
          invited_fun_facts: buildFunFacts(form.invited_fun_facts),
          partner_name: hasPartner ? form.partner_name : null,
          partner_email: hasPartner ? form.partner_email : null,
          partner_allergies: hasPartner ? parseAllergies(form.partner_allergies) : null,
          partner_birth_year: hasPartner && form.partner_birth_year ? parseInt(form.partner_birth_year) : null,
          partner_fun_facts: hasPartner ? buildFunFacts(form.partner_fun_facts) : null,
          address: form.address,
          address_unit: form.address_unit || null,
          address_notes: form.address_notes || null,
          course_preference: form.course_preference || null,
          instagram_handle: form.instagram_handle || null,
          invited_pet_allergy: form.invited_pet_allergy,
          partner_pet_allergy: hasPartner ? form.partner_pet_allergy : 'none',
          accessibility_needs: form.accessibility_needs || null,
          accessibility_ok: form.accessibility_ok,
          confirmed: true,
        })
        .select('id')
        .single();
      
      if (insertError) {
        throw new Error(insertError.message);
      }
      
      // Send partner invite email (fire-and-forget)
      if (hasPartner && form.partner_email && insertedCouple?.id) {
        fetch('/api/register/notify-partner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couple_id: insertedCouple.id }),
        }).catch(() => {}); // Don't block on email failure
      }
      
      // Redirect to success page
      router.push(`/e/${slug}/registered`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Något gick fel');
    } finally {
      setLoading(false);
    }
  };
  
  // Loading state while checking invite
  if (accessGranted === null) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-amber-700 text-lg">Verifierar inbjudan...</div>
      </main>
    );
  }

  // No valid invite token
  if (!accessGranted) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-amber-900 mb-2">Inbjudan krävs</h1>
          <p className="text-amber-700">
            Du behöver en inbjudningslänk från arrangören för att anmäla dig till denna fest.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-12">
      <div className="max-w-xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-amber-900 text-center mb-2">
          ✨ Anmälan
        </h1>
        <p className="text-amber-600 text-center mb-8">
          Fyll i era uppgifter nedan
        </p>
        
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Toggle partner */}
          <div className="bg-white rounded-xl p-4 shadow">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPartner}
                onChange={(e) => setHasPartner(e.target.checked)}
                className="w-5 h-5 rounded border-amber-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-amber-900 font-medium">
                Jag kommer med partner
              </span>
            </label>
          </div>
          
          {/* Your info */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-amber-900 mb-4">
              👤 Dina uppgifter
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Namn *
                </label>
                <input
                  type="text"
                  name="invited_name"
                  value={form.invited_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Anna Andersson"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="invited_email"
                  value={form.invited_email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="anna@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Telefon
                </label>
                <input
                  type="tel"
                  name="invited_phone"
                  value={form.invited_phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="070-123 45 67"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Allergier / specialkost
                </label>
                <input
                  type="text"
                  name="invited_allergies"
                  value={form.invited_allergies}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="nötter, laktos (separera med komma)"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Djurallergi
                </label>
                <select
                  name="invited_pet_allergy"
                  value={form.invited_pet_allergy}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="none">Ingen djurallergi</option>
                  <option value="mild">Mild (klarar kortare besök)</option>
                  <option value="severe">Allvarlig (undvik helt)</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Partner info */}
          {hasPartner && (
            <div className="bg-white rounded-xl p-6 shadow">
              <h2 className="text-lg font-semibold text-amber-900 mb-4">
                👥 Partners uppgifter
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">
                    Namn *
                  </label>
                  <input
                    type="text"
                    name="partner_name"
                    value={form.partner_name}
                    onChange={handleChange}
                    required={hasPartner}
                    className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Bertil Bengtsson"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="partner_email"
                    value={form.partner_email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="bertil@example.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">
                    Allergier / specialkost
                  </label>
                  <input
                    type="text"
                    name="partner_allergies"
                    value={form.partner_allergies}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="vegetarian, gluten"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">
                    Djurallergi
                  </label>
                  <select
                    name="partner_pet_allergy"
                    value={form.partner_pet_allergy}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="none">Ingen djurallergi</option>
                    <option value="mild">Mild (klarar kortare besök)</option>
                    <option value="severe">Allvarlig (undvik helt)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          
          {/* Mystery Profile - Invited */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 shadow border border-purple-100">
            <h2 className="text-lg font-semibold text-purple-900 mb-2">
              ✨ Mysterieprofilen
            </h2>
            <p className="text-purple-600 text-sm mb-1">
              Hjälp oss skapa "På spåret"-känsla! Dina svar blir kluriga ledtrådar för värdparet.
            </p>
            <p className="text-purple-500 text-xs mb-2">
              🔒 Helt frivilligt • 🗑️ Raderas automatiskt dagen efter festen
            </p>
            {/* Fun facts counter */}
            {(() => {
              const invitedCount = Object.values(form.invited_fun_facts).filter(v => v).length;
              const partnerCount = hasPartner ? Object.values(form.partner_fun_facts).filter(v => v).length : 0;
              const total = invitedCount + partnerCount;
              const needed = 6;
              const isGood = total >= needed;
              return (
                <div className={`text-xs px-3 py-2 rounded-lg mb-4 ${isGood ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  🔮 Ledtrådar ifyllda: <span className="font-bold">{total}</span>/{needed}
                  {isGood ? ' ✅ Perfekt!' : ` — Fyll i ${needed - total} till för unika ledtrådar per rätt`}
                </div>
              );
            })()}
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Födelseår
                  </label>
                  <select
                    name="invited_birth_year"
                    value={form.invited_birth_year}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  >
                    <option value="">Välj...</option>
                    {Array.from({ length: 70 }, (_, i) => 2010 - i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Bästa musikdecenniet
                  </label>
                  <select
                    value={form.invited_fun_facts.musicDecade}
                    onChange={(e) => handleFunFactChange('invited', 'musicDecade', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  >
                    <option value="">Välj...</option>
                    <option value="60">60-talet</option>
                    <option value="70">70-talet</option>
                    <option value="80">80-talet</option>
                    <option value="90">90-talet</option>
                    <option value="00">00-talet</option>
                    <option value="10">10-talet</option>
                    <option value="20">2020+</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Husdjur
                  </label>
                  <input
                    type="text"
                    value={form.invited_fun_facts.pet}
                    onChange={(e) => handleFunFactChange('invited', 'pet', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="katt, hund..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Hemligt talent
                  </label>
                  <input
                    type="text"
                    value={form.invited_fun_facts.talent}
                    onChange={(e) => handleFunFactChange('invited', 'talent', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="jonglera, sjunga..."
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Första jobbet
                  </label>
                  <input
                    type="text"
                    value={form.invited_fun_facts.firstJob}
                    onChange={(e) => handleFunFactChange('invited', 'firstJob', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="tidningsbud, servitör..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Drömresmål
                  </label>
                  <input
                    type="text"
                    value={form.invited_fun_facts.dreamDestination}
                    onChange={(e) => handleFunFactChange('invited', 'dreamDestination', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="Japan, Island..."
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Instrument jag spelar
                  </label>
                  <input
                    type="text"
                    value={form.invited_fun_facts.instruments}
                    onChange={(e) => handleFunFactChange('invited', 'instruments', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="gitarr, piano..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Sport/aktivitet
                  </label>
                  <input
                    type="text"
                    value={form.invited_fun_facts.sport}
                    onChange={(e) => handleFunFactChange('invited', 'sport', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="löpning, yoga..."
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">
                  Något okänt om mig
                </label>
                <input
                  type="text"
                  value={form.invited_fun_facts.unknownFact}
                  onChange={(e) => handleFunFactChange('invited', 'unknownFact', e.target.value)}
                  className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  placeholder="Har träffat kungen, kan baklängestalfabet..."
                />
              </div>
            </div>
          </div>
          
          {/* Mystery Profile - Partner */}
          {hasPartner && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 shadow border border-purple-100">
              <h2 className="text-lg font-semibold text-purple-900 mb-4">
                ✨ Partners mysterieprofil
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-purple-700 mb-1">
                      Födelseår
                    </label>
                    <select
                      name="partner_birth_year"
                      value={form.partner_birth_year}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    >
                      <option value="">Välj...</option>
                      {Array.from({ length: 70 }, (_, i) => 2010 - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-purple-700 mb-1">
                      Bästa musikdecenniet
                    </label>
                    <select
                      value={form.partner_fun_facts.musicDecade}
                      onChange={(e) => handleFunFactChange('partner', 'musicDecade', e.target.value)}
                      className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    >
                      <option value="">Välj...</option>
                      <option value="60">60-talet</option>
                      <option value="70">70-talet</option>
                      <option value="80">80-talet</option>
                      <option value="90">90-talet</option>
                      <option value="00">00-talet</option>
                      <option value="10">10-talet</option>
                      <option value="20">2020+</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-purple-700 mb-1">
                      Husdjur
                    </label>
                    <input
                      type="text"
                      value={form.partner_fun_facts.pet}
                      onChange={(e) => handleFunFactChange('partner', 'pet', e.target.value)}
                      className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                      placeholder="katt, hund..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-purple-700 mb-1">
                      Hemligt talent
                    </label>
                    <input
                      type="text"
                      value={form.partner_fun_facts.talent}
                      onChange={(e) => handleFunFactChange('partner', 'talent', e.target.value)}
                      className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                      placeholder="jonglera, sjunga..."
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Något okänt
                  </label>
                  <input
                    type="text"
                    value={form.partner_fun_facts.unknownFact}
                    onChange={(e) => handleFunFactChange('partner', 'unknownFact', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                    placeholder="Har simmat med delfiner..."
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Address */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-amber-900 mb-4">
              🏠 Er adress
            </h2>
            <p className="text-amber-600 text-sm mb-4">
              Hit kommer era gäster när ni är värdar
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Adress *
                </label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Storgatan 12, 123 45 Piteå"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Våning / avdelning / dörr
                </label>
                <input
                  type="text"
                  name="address_unit"
                  value={form.address_unit}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Vån 3, lgh 1204, Företag AB..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Portkod / instruktioner
                </label>
                <textarea
                  name="address_notes"
                  value={form.address_notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Portkod 1234. Ring på 'Andersson'."
                />
              </div>
              
              <div className="border-t pt-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="accessibility_ok"
                    checked={form.accessibility_ok}
                    onChange={(e) => setForm(prev => ({ ...prev, accessibility_ok: e.target.checked }))}
                    className="w-5 h-5 rounded border-amber-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-amber-900">Vårt hem är tillgängligt (hiss/markplan)</span>
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Tillgänglighetsbehov
                </label>
                <input
                  type="text"
                  name="accessibility_needs"
                  value={form.accessibility_needs}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Rullstol, inga trappor..."
                />
              </div>
            </div>
          </div>
          
          {/* Preferences */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-amber-900 mb-4">
              🍽️ Önskemål
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Vi vill helst laga
                </label>
                <select
                  name="course_preference"
                  value={form.course_preference}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Spelar ingen roll</option>
                  <option value="starter">🥗 Förrätt</option>
                  <option value="main">🍖 Huvudrätt</option>
                  <option value="dessert">🍰 Efterrätt</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">
                  Instagram (valfritt)
                </label>
                <input
                  type="text"
                  name="instagram_handle"
                  value={form.instagram_handle}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="@dittanvändarnamn"
                />
              </div>
            </div>
          </div>
          
          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-4 rounded-xl text-lg shadow-lg transition-colors"
          >
            {loading ? 'Skickar...' : '🚴 Anmäl oss!'}
          </button>
        </form>
      </div>
    </main>
  );
}
