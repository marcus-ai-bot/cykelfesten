'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface CoupleData {
  id: string;
  invited_name: string;
  partner_name: string;
  partner_email: string | null;
  partner_allergies: string[] | null;
  partner_allergy_notes: string | null;
  partner_address: string | null;
  partner_instagram: string | null;
  partner_birth_year: number | null;
  partner_fun_facts: Record<string, unknown> | null;
  address: string; // Värdadress (read-only)
  events: {
    name: string;
    event_date: string;
  };
}

export default function PartnerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const token = searchParams.get('token');
  
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    partner_allergies: '',
    partner_address: '',
    partner_instagram: '',
    partner_birth_year: '',
    fun_facts: {
      musicDecade: '',
      pet: '',
      talent: '',
      firstJob: '',
      dreamDestination: '',
      instruments: '',
      sport: '',
      unknownFact: '',
    },
  });
  
  const supabase = createClient();
  
  useEffect(() => {
    if (token) {
      loadCoupleByToken();
    } else {
      setError('Ingen inbjudningslänk. Be din partner skicka en ny.');
      setLoading(false);
    }
  }, [token]);
  
  async function loadCoupleByToken() {
    const { data, error: fetchError } = await supabase
      .from('couples')
      .select('*, events(name, event_date)')
      .eq('partner_invite_token', token)
      .single();
    
    if (fetchError || !data) {
      setError('Ogiltig eller utgången länk. Be din partner skicka en ny inbjudan.');
      setLoading(false);
      return;
    }
    
    setCouple(data as CoupleData);
    
    // Pre-fill form
    setForm({
      partner_allergies: data.partner_allergies?.join(', ') || '',
      partner_address: data.partner_address || '',
      partner_instagram: data.partner_instagram || '',
      partner_birth_year: data.partner_birth_year?.toString() || '',
      fun_facts: {
        musicDecade: (data.partner_fun_facts as any)?.musicDecade || '',
        pet: (data.partner_fun_facts as any)?.pet?.type || (data.partner_fun_facts as any)?.pet || '',
        talent: (data.partner_fun_facts as any)?.talent || '',
        firstJob: (data.partner_fun_facts as any)?.firstJob || '',
        dreamDestination: (data.partner_fun_facts as any)?.dreamDestination || '',
        instruments: Array.isArray((data.partner_fun_facts as any)?.instruments) 
          ? (data.partner_fun_facts as any).instruments.join(', ') 
          : (data.partner_fun_facts as any)?.instruments || '',
        sport: (data.partner_fun_facts as any)?.sport || '',
        unknownFact: (data.partner_fun_facts as any)?.unknownFact || '',
      },
    });
    
    setLoading(false);
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFunFactChange = (field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      fun_facts: { ...prev.fun_facts, [field]: value },
    }));
  };
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!couple) return;
    
    setSaving(true);
    setError(null);
    
    try {
      // Build fun facts
      const funFacts: Record<string, unknown> = {};
      if (form.fun_facts.musicDecade) funFacts.musicDecade = form.fun_facts.musicDecade;
      if (form.fun_facts.pet) funFacts.pet = { type: form.fun_facts.pet };
      if (form.fun_facts.talent) funFacts.talent = form.fun_facts.talent;
      if (form.fun_facts.firstJob) funFacts.firstJob = form.fun_facts.firstJob;
      if (form.fun_facts.dreamDestination) funFacts.dreamDestination = form.fun_facts.dreamDestination;
      if (form.fun_facts.instruments) funFacts.instruments = form.fun_facts.instruments.split(',').map(s => s.trim()).filter(Boolean);
      if (form.fun_facts.sport) funFacts.sport = form.fun_facts.sport;
      if (form.fun_facts.unknownFact) funFacts.unknownFact = form.fun_facts.unknownFact;
      
      const { error: updateError } = await supabase
        .from('couples')
        .update({
          partner_allergies: form.partner_allergies.split(',').map(s => s.trim()).filter(Boolean),
          partner_address: form.partner_address || null,
          partner_instagram: form.partner_instagram || null,
          partner_birth_year: form.partner_birth_year ? parseInt(form.partner_birth_year) : null,
          partner_fun_facts: Object.keys(funFacts).length > 0 ? funFacts : null,
        })
        .eq('id', couple.id);
      
      if (updateError) throw updateError;
      
      setSaved(true);
      setTimeout(() => router.replace(`/e/${slug}/my`), 2000);
      
    } catch (err) {
      setError('Kunde inte spara. Försök igen.');
    } finally {
      setSaving(false);
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="text-purple-600">Laddar...</div>
      </div>
    );
  }
  
  if (error && !couple) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-lg text-center max-w-md">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Något gick fel</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link href={`/e/${slug}`} className="text-purple-500 hover:text-purple-600">
            ← Tillbaka till eventet
          </Link>
        </div>
      </div>
    );
  }
  
  if (saved) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 shadow-lg text-center max-w-md">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-purple-900 mb-2">Sparat!</h2>
          <p className="text-purple-600 mb-4">Din profil är uppdaterad. Skickar dig vidare...</p>
        </div>
      </div>
    );
  }
  
  if (!couple) return null;
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-100 py-8">
      <div className="max-w-xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-purple-900 mb-2">
            👋 Hej {couple.partner_name}!
          </h1>
          <p className="text-purple-600">
            {couple.invited_name} har bjudit in dig till <strong>{couple.events.name}</strong>
          </p>
          <p className="text-purple-500 text-sm mt-1">
            {new Date(couple.events.event_date).toLocaleDateString('sv-SE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Värdadress (read-only) */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              🏠 Värdadress
            </h2>
            <p className="text-gray-500 text-sm mb-3">
              Hit kommer gästerna när ni är värdar. Hanteras av {couple.invited_name}.
            </p>
            <div className="bg-gray-100 rounded-lg px-4 py-3 text-gray-700">
              {couple.address}
            </div>
          </div>
          
          {/* Din hemadress (om annan) */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              📍 Din hemadress
            </h2>
            <p className="text-gray-500 text-sm mb-3">
              Om du bor på en annan adress — används för roliga avståndsledtrådar!
            </p>
            <input
              type="text"
              name="partner_address"
              value={form.partner_address}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              placeholder="Lämna tomt om samma som värdadressen"
            />
          </div>
          
          {/* Allergier */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              ⚠️ Allergier & specialkost
            </h2>
            <input
              type="text"
              name="partner_allergies"
              value={form.partner_allergies}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              placeholder="nötter, laktos (separera med komma)"
            />
          </div>
          
          {/* Instagram */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              📸 Instagram
            </h2>
            <input
              type="text"
              name="partner_instagram"
              value={form.partner_instagram}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              placeholder="@dittanvändarnamn"
            />
          </div>
          
          {/* Mystery Profile */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 shadow border border-purple-100">
            <h2 className="text-lg font-semibold text-purple-900 mb-2">
              ✨ Din Mysterieprofil
            </h2>
            <p className="text-purple-600 text-sm mb-1">
              Hjälp oss skapa "På spåret"-känsla! Värdparet ska gissa vem som knackar på.
            </p>
            <p className="text-purple-500 text-xs mb-4">
              🔒 Helt frivilligt • 🗑️ Raderas dagen efter festen
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Födelseår</label>
                  <select
                    name="partner_birth_year"
                    value={form.partner_birth_year}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                  >
                    <option value="">Välj...</option>
                    {Array.from({ length: 70 }, (_, i) => 2010 - i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Bästa musikdecenniet</label>
                  <select
                    value={form.fun_facts.musicDecade}
                    onChange={(e) => handleFunFactChange('musicDecade', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
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
                  <label className="block text-sm font-medium text-purple-700 mb-1">Husdjur</label>
                  <input
                    type="text"
                    value={form.fun_facts.pet}
                    onChange={(e) => handleFunFactChange('pet', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                    placeholder="katt, hund..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Hemligt talent</label>
                  <input
                    type="text"
                    value={form.fun_facts.talent}
                    onChange={(e) => handleFunFactChange('talent', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                    placeholder="jonglera, sjunga..."
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Första jobbet</label>
                  <input
                    type="text"
                    value={form.fun_facts.firstJob}
                    onChange={(e) => handleFunFactChange('firstJob', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                    placeholder="tidningsbud..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Drömresmål</label>
                  <input
                    type="text"
                    value={form.fun_facts.dreamDestination}
                    onChange={(e) => handleFunFactChange('dreamDestination', e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                    placeholder="Japan, Island..."
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">Något okänt om mig</label>
                <input
                  type="text"
                  value={form.fun_facts.unknownFact}
                  onChange={(e) => handleFunFactChange('unknownFact', e.target.value)}
                  className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                  placeholder="Har träffat kungen, kan baklängestalfabet..."
                />
              </div>
            </div>
          </div>
          
          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-semibold py-4 rounded-xl text-lg shadow-lg transition-colors"
          >
            {saving ? 'Sparar...' : '✨ Spara min profil'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <Link href={`/e/${slug}`} className="text-purple-500 hover:text-purple-600 text-sm">
            ← Tillbaka till eventet
          </Link>
        </div>
      </div>
    </main>
  );
}
