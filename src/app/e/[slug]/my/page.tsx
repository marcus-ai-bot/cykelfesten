'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Envelope } from '@/components/envelope/Envelope';
import Link from 'next/link';

interface CoupleData {
  id: string;
  invited_name: string;
  partner_name: string | null;
  partner_email: string | null;
  partner_invite_sent_at: string | null;
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
  const slug = params.slug as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [envelopes, setEnvelopes] = useState<EnvelopeData[]>([]);
  const [assignment, setAssignment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropoutModal, setShowDropoutModal] = useState(false);
  const [dropoutLoading, setDropoutLoading] = useState(false);
  const [dropoutSuccess, setDropoutSuccess] = useState(false);
  const [invitingPartner, setInvitingPartner] = useState(false);
  const [partnerInviteUrl, setPartnerInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [slug]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/guest/my-data?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Kunde inte hämta data');
        setLoading(false);
        return;
      }

      setEvent(data.event);
      setCouple(data.couple);
      setEnvelopes(data.envelopes || []);
      setAssignment(data.assignment || null);
    } catch (err) {
      setError('Kunde inte hämta data');
    } finally {
      setLoading(false);
    }
  }

  async function markEnvelopeOpened(envelopeId: string) {
    try {
      const res = await fetch('/api/guest/envelope/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelope_id: envelopeId }),
      });

      const data = await res.json();
      if (res.ok && data.opened_at) {
        setEnvelopes(prev =>
          prev.map(e => (e.id === envelopeId ? { ...e, opened_at: data.opened_at } : e))
        );
      }
    } catch (err) {
      // Ignore
    }
  }

  async function invitePartner() {
    if (!couple) return;

    setInvitingPartner(true);
    try {
      const res = await fetch('/api/partner/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couple_id: couple.id }),
      });

      const data = await res.json();
      if (res.ok && data.invite_url) {
        setPartnerInviteUrl(data.invite_url);
      } else {
        alert(data.error || 'Kunde inte skapa inbjudan');
      }
    } catch (err) {
      alert('Något gick fel');
    } finally {
      setInvitingPartner(false);
    }
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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
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

          {/* Partner invite section */}
          {couple.partner_name && couple.partner_email && (
            <div className="mt-4 pt-4 border-t border-amber-100">
              {partnerInviteUrl ? (
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-green-800 text-sm mb-2">
                    ✅ Länk skapad! Skicka till {couple.partner_name}:
                  </p>
                  <input
                    type="text"
                    value={partnerInviteUrl}
                    readOnly
                    className="w-full px-3 py-2 text-xs bg-white border rounded"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(partnerInviteUrl);
                      alert('Kopierat!');
                    }}
                    className="mt-2 text-sm text-green-600 hover:text-green-700"
                  >
                    📋 Kopiera länk
                  </button>
                </div>
              ) : (
                <button
                  onClick={invitePartner}
                  disabled={invitingPartner}
                  className="text-sm text-purple-500 hover:text-purple-600 disabled:opacity-50"
                >
                  {invitingPartner ? 'Skapar...' : `💌 Bjud in ${couple.partner_name} att fylla i sin profil`}
                </button>
              )}
              {couple.partner_invite_sent_at && !partnerInviteUrl && (
                <p className="text-xs text-gray-400 mt-1">
                  Senast bjuden: {new Date(couple.partner_invite_sent_at).toLocaleDateString('sv-SE')}
                </p>
              )}
            </div>
          )}
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
        <div className="mt-4 flex justify-center gap-4 flex-wrap">
          <Link
            href={`/e/${slug}/profile`}
            className="text-amber-500 hover:text-amber-600 text-sm"
          >
            ✏️ Redigera profil
          </Link>
          <Link
            href={`/e/${slug}/host`}
            className="text-amber-500 hover:text-amber-600 text-sm"
          >
            🏠 Värdvy
          </Link>
          <Link
            href={`/e/${slug}`}
            className="text-amber-500 hover:text-amber-600 text-sm"
          >
            ← Tillbaka
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
