'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface CoupleData {
  id: string;
  invited_name: string;
  invited_email: string;
  invited_phone: string | null;
  invited_allergies: string[] | null;
  invited_allergy_notes: string | null;
  invited_birth_year: number | null;
  invited_fun_facts: Record<string, unknown> | null;
  partner_name: string | null;
  partner_email: string | null;
  address: string;
  address_notes: string | null;
  course_preference: string | null;
  instagram_handle: string | null;
  events: {
    name: string;
    slug: string;
  };
}

export default function ProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const emailParam = searchParams.get('email');
  
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allCouples, setAllCouples] = useState<any[]>([]);
  const [selectingCouple, setSelectingCouple] = useState(false);
  
  const [form, setForm] = useState({
    invited_name: '',
    invited_email: '',
    invited_phone: '',
    invited_allergies: '',
    invited_birth_year: '',
    instagram_handle: '',
    address: '',
    address_notes: '',
    course_preference: '',
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
    loadData();
  }, [slug, emailParam]);
  
  async function loadData() {
    // Get event
    const { data: eventData } = await supabase
      .from('events')
      .select('id, name, slug')
      .eq('slug', slug)
      .single();
    
    if (!eventData) {
      setError('Event hittades inte');
      setLoading(false);
      return;
    }
    
    // Get all couples for selection
    const { data: couplesData } = await supabase
      .from('couples')
      .select('*')
      .eq('event_id', eventData.id)
      .eq('cancelled', false)
      .order('invited_name');
    
    setAllCouples(couplesData || []);
    
    // Find couple by email
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
      loadCoupleData(selectedCouple, eventData);
    }
    
    setLoading(false);
  }
  
  function loadCoupleData(data: any, eventData: any) {
    setCouple({ ...data, events: eventData });
    
    // Pre-fill form
    const ff = data.invited_fun_facts || {};
    setForm({
      invited_name: data.invited_name || '',
      invited_email: data.invited_email || '',
      invited_phone: data.invited_phone || '',
      invited_allergies: data.invited_allergies?.join(', ') || '',
      invited_birth_year: data.invited_birth_year?.toString() || '',
      instagram_handle: data.instagram_handle || '',
      address: data.address || '',
      address_notes: data.address_notes || '',
      course_preference: data.course_preference || '',
      fun_facts: {
        musicDecade: ff.musicDecade || '',
        pet: ff.pet?.type || ff.pet || '',
        talent: ff.talent || '',
        firstJob: ff.firstJob || '',
        dreamDestination: ff.dreamDestination || '',
        instruments: Array.isArray(ff.instruments) ? ff.instruments.join(', ') : ff.instruments || '',
        sport: ff.sport || '',
        unknownFact: ff.unknownFact || '',
      },
    });
  }
  
  async function selectCouple(c: any) {
    const { data: eventData } = await supabase
      .from('events')
      .select('id, name, slug')
      .eq('slug', slug)
      .single();
    
    loadCoupleData(c, eventData);
    setSelectingCouple(false);
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
          invited_name: form.invited_name,
          invited_email: form.invited_email,
          invited_phone: form.invited_phone || null,
          invited_allergies: form.invited_allergies.split(',').map(s => s.trim()).filter(Boolean),
          invited_birth_year: form.invited_birth_year ? parseInt(form.invited_birth_year) : null,
          invited_fun_facts: Object.keys(funFacts).length > 0 ? funFacts : null,
          instagram_handle: form.instagram_handle || null,
          address: form.address,
          address_notes: form.address_notes || null,
          course_preference: form.course_preference || null,
        })
        .eq('id', couple.id);
      
      if (updateError) throw updateError;
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
    } catch (err) {
      setError('Kunde inte spara. Försök igen.');
    } finally {
      setSaving(false);
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-amber-600">Laddar...</div>
      </div>
    );
  }
  
  // Couple selector
  if (selectingCouple) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-12">
        <div className="max-w-md mx-auto px-4">
          <h1 className="text-2xl font-bold text-amber-900 text-center mb-2">
            ✏️ Redigera profil
          </h1>
          <p className="text-amber-600 text-center mb-6 text-sm">
            Välj vem du är
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
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-lg text-center">
          <p className="text-gray-600">{error || 'Ingen profil hittad'}</p>
          <Link href={`/e/${slug}`} className="text-amber-500 mt-4 inline-block">
            ← Tillbaka
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 py-8">
      <div className="max-w-xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-amber-900 mb-2">
            ✏️ Redigera profil
          </h1>
          <p className="text-amber-600">{couple.events.name}</p>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {saved && (
          <div className="bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded-lg mb-6">
            ✅ Sparat!
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-amber-900 mb-4">
              👤 Dina uppgifter
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Namn</label>
                <input
                  type="text"
                  name="invited_name"
                  value={form.invited_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Email</label>
                <input
                  type="email"
                  name="invited_email"
                  value={form.invited_email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  name="invited_phone"
                  value={form.invited_phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Allergier</label>
                <input
                  type="text"
                  name="invited_allergies"
                  value={form.invited_allergies}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  placeholder="nötter, laktos (separera med komma)"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Instagram</label>
                <input
                  type="text"
                  name="instagram_handle"
                  value={form.instagram_handle}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  placeholder="@dittnamn"
                />
              </div>
            </div>
          </div>
          
          {/* Address (värdadress) */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-amber-900 mb-2">
              🏠 Värdadress
            </h2>
            <p className="text-amber-600 text-sm mb-4">
              Hit kommer gästerna när ni är värdar
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Adress</label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1">Portkod / instruktioner</label>
                <textarea
                  name="address_notes"
                  value={form.address_notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>
          
          {/* Preferences */}
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-semibold text-amber-900 mb-4">
              🍽️ Önskemål
            </h2>
            
            <div>
              <label className="block text-sm font-medium text-amber-700 mb-1">Vi vill helst laga</label>
              <select
                name="course_preference"
                value={form.course_preference}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Spelar ingen roll</option>
                <option value="starter">🥗 Förrätt</option>
                <option value="main">🍖 Huvudrätt</option>
                <option value="dessert">🍰 Efterrätt</option>
              </select>
            </div>
          </div>
          
          {/* Mystery Profile */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 shadow border border-purple-100">
            <h2 className="text-lg font-semibold text-purple-900 mb-2">
              ✨ Din Mysterieprofil
            </h2>
            <p className="text-purple-600 text-sm mb-1">
              Ledtrådar för värdparet — "På spåret"-känsla!
            </p>
            <p className="text-purple-500 text-xs mb-4">
              🔒 Frivilligt • 🗑️ Raderas dagen efter festen
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Födelseår</label>
                  <select
                    name="invited_birth_year"
                    value={form.invited_birth_year}
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
                  <label className="block text-sm font-medium text-purple-700 mb-1">Musikdecennium</label>
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
                    placeholder="jonglera..."
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
                    placeholder="Japan..."
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">Något okänt om dig</label>
                <input
                  type="text"
                  value={form.fun_facts.unknownFact}
                  onChange={(e) => handleFunFactChange('unknownFact', e.target.value)}
                  className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm"
                  placeholder="Har träffat kungen..."
                />
              </div>
            </div>
          </div>
          
          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-4 rounded-xl text-lg shadow-lg transition-colors"
          >
            {saving ? 'Sparar...' : '💾 Spara ändringar'}
          </button>
        </form>
        
        {/* Navigation */}
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/e/${slug}/my`} className="text-amber-500 hover:text-amber-600 text-sm">
            📱 Mina kuvert
          </Link>
          <Link href={`/e/${slug}/host`} className="text-amber-500 hover:text-amber-600 text-sm">
            🏠 Värdvy
          </Link>
          <button
            onClick={() => setSelectingCouple(true)}
            className="text-amber-500 hover:text-amber-600 text-sm"
          >
            🔄 Byt person
          </button>
        </div>
      </div>
    </main>
  );
}
