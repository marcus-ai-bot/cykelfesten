'use client';

/**
 * Live Envelope Demo Page
 * 
 * Shows the new Living Envelope experience with progressive reveals.
 * Access: /e/[slug]/live?coupleId=xxx
 */

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { EnvelopeContainer } from '@/components/envelope';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface CoupleOption {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

export default function LiveEnvelopePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const coupleIdParam = searchParams.get('coupleId');
  
  const [eventId, setEventId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(coupleIdParam);
  const [couples, setCouples] = useState<CoupleOption[]>([]);
  const [selectedCouple, setSelectedCouple] = useState<CoupleOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();
  
  // Load event and couples
  useEffect(() => {
    async function load() {
      setLoading(true);
      
      // Get event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, name')
        .eq('slug', slug)
        .single();
      
      if (eventError || !event) {
        setError('Event hittades inte');
        setLoading(false);
        return;
      }
      
      setEventId(event.id);
      
      // Get couples for selection
      const { data: couplesData } = await supabase
        .from('couples')
        .select('id, invited_name, partner_name')
        .eq('event_id', event.id)
        .eq('cancelled', false)
        .order('invited_name');
      
      setCouples(couplesData || []);
      
      // If coupleId provided, find it
      if (coupleIdParam && couplesData) {
        const found = couplesData.find(c => c.id === coupleIdParam);
        if (found) {
          setSelectedCouple(found);
          setCoupleId(found.id);
        }
      }
      
      setLoading(false);
    }
    
    load();
  }, [slug, coupleIdParam, supabase]);
  
  // Handle couple selection
  const handleSelectCouple = (couple: CoupleOption) => {
    setSelectedCouple(couple);
    setCoupleId(couple.id);
    
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('coupleId', couple.id);
    window.history.replaceState({}, '', url.toString());
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 p-4">
        <div className="max-w-md mx-auto pt-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-amber-200 rounded w-2/3 mx-auto" />
            <div className="h-32 bg-amber-100 rounded-xl" />
            <div className="h-32 bg-amber-100 rounded-xl" />
            <div className="h-32 bg-amber-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 p-4">
        <div className="max-w-md mx-auto pt-8 text-center">
          <p className="text-red-600 text-lg">❌ {error}</p>
          <Link href={`/e/${slug}`} className="text-amber-600 underline mt-4 block">
            ← Tillbaka
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 p-4 pb-20">
      <div className="max-w-md mx-auto pt-4">
        {/* Header */}
        <div className="text-center mb-6">
          <Link href={`/e/${slug}`} className="text-amber-600 text-sm hover:underline">
            ← Tillbaka till event
          </Link>
          <h1 className="text-2xl font-bold text-amber-900 mt-2">
            🎭 Levande Kuvert
          </h1>
          <p className="text-amber-700 text-sm">
            Ledtrådar avslöjas successivt under kvällen!
          </p>
        </div>
        
        {/* Couple selector (if not selected) */}
        {!selectedCouple && couples.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-md mb-6">
            <h2 className="font-semibold text-gray-800 mb-3">Välj ditt par:</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {couples.map(couple => (
                <button
                  key={couple.id}
                  onClick={() => handleSelectCouple(couple)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                >
                  <span className="font-medium">{couple.invited_name}</span>
                  {couple.partner_name && (
                    <span className="text-gray-500"> & {couple.partner_name}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Selected couple header */}
        {selectedCouple && (
          <div className="bg-amber-100 rounded-lg p-3 mb-4 flex items-center justify-between">
            <div>
              <span className="text-amber-800 font-medium">{selectedCouple.invited_name}</span>
              {selectedCouple.partner_name && (
                <span className="text-amber-600"> & {selectedCouple.partner_name}</span>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedCouple(null);
                setCoupleId(null);
              }}
              className="text-amber-600 text-sm hover:underline"
            >
              Byt
            </button>
          </div>
        )}
        
        {/* Envelopes — only after couple is selected */}
        {eventId && coupleId && selectedCouple && (
          <EnvelopeContainer
            eventId={eventId}
            coupleId={coupleId}
            pollInterval={30000}
            simulateTime={searchParams.get('simulateTime') || undefined}
          />
        )}
        
        {/* Feature badges */}
        <div className="mt-8 flex flex-wrap gap-2 justify-center">
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
            🔮 Ledtrådar
          </span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            📍 Partiell adress
          </span>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            🎉 Konfetti
          </span>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
            ⏱️ Auto-reveal
          </span>
        </div>
      </div>
    </div>
  );
}
