'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Course } from '@/types/database';

export default function RegisterPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(true);
  
  const [form, setForm] = useState({
    invited_name: '',
    invited_email: '',
    invited_phone: '',
    invited_allergies: '',
    partner_name: '',
    partner_email: '',
    partner_allergies: '',
    address: '',
    address_notes: '',
    course_preference: '' as Course | '',
    instagram_handle: '',
  });
  
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
      
      // Insert couple
      const { error: insertError } = await supabase
        .from('couples')
        .insert({
          event_id: event.id,
          invited_name: form.invited_name,
          invited_email: form.invited_email,
          invited_phone: form.invited_phone || null,
          invited_allergies: parseAllergies(form.invited_allergies),
          partner_name: hasPartner ? form.partner_name : null,
          partner_email: hasPartner ? form.partner_email : null,
          partner_allergies: hasPartner ? parseAllergies(form.partner_allergies) : null,
          address: form.address,
          address_notes: form.address_notes || null,
          course_preference: form.course_preference || null,
          instagram_handle: form.instagram_handle || null,
          confirmed: true,
        });
      
      if (insertError) {
        throw new Error(insertError.message);
      }
      
      // Redirect to success page
      router.push(`/e/${slug}/registered`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Något gick fel');
    } finally {
      setLoading(false);
    }
  };
  
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
