'use client';

/**
 * Live Envelope Page
 * 
 * Shows the guest's envelope with progressive reveals.
 * Auth: reads guest_session cookie via /api/guest/couple server-side route.
 */

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { EnvelopeContainer } from '@/components/envelope';
import Link from 'next/link';

interface CoupleData {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

export default function LiveEnvelopePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  const [eventId, setEventId] = useState<string | null>(null);
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Support organizer preview: ?coupleId=xxx overrides guest_session lookup
  const previewCoupleId = searchParams.get('coupleId');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const url = previewCoupleId
          ? `/api/guest/couple?slug=${encodeURIComponent(slug)}&coupleId=${encodeURIComponent(previewCoupleId)}`
          : `/api/guest/couple?slug=${encodeURIComponent(slug)}`;
        const res = await fetch(url);

        if (res.status === 401) {
          // Not logged in — redirect to guest portal
          window.location.href = '/guest';
          return;
        }

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Något gick fel');
          setLoading(false);
          return;
        }

        setEventId(data.eventId);
        setCouple(data.couple);
      } catch {
        setError('Kunde inte ladda kuvert');
      }
      setLoading(false);
    }

    load();
  }, [slug, previewCoupleId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 p-4">
        <div className="max-w-md mx-auto pt-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-amber-200 rounded w-2/3 mx-auto" />
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
          <div className="bg-white rounded-2xl shadow-md p-8 border border-amber-100">
            <div className="text-4xl mb-4">😕</div>
            <h2 className="text-xl font-semibold text-amber-900 mb-2">Hoppsan</h2>
            <p className="text-amber-700 mb-6">{error}</p>
            <Link
              href={`/e/${slug}`}
              className="inline-block text-amber-600 hover:underline text-sm"
            >
              ← Tillbaka till event
            </Link>
          </div>
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

        {/* Couple header */}
        {couple && (
          <div className="bg-amber-100 rounded-lg p-3 mb-4 text-center">
            <span className="text-amber-800 font-medium">{couple.invited_name}</span>
            {couple.partner_name && (
              <span className="text-amber-600"> & {couple.partner_name}</span>
            )}
          </div>
        )}

        {/* Envelopes */}
        {eventId && couple && (
          <EnvelopeContainer
            eventId={eventId}
            coupleId={couple.id}
            pollInterval={30000}
            simulateTime={searchParams.get('simulateTime') || undefined}
          />
        )}
      </div>
    </div>
  );
}
