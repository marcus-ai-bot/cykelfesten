'use client';

import { useState, useEffect, useCallback } from 'react';
import AddressAutocomplete from '@/components/AddressAutocomplete';

interface CoOrganizer {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface CoupleData {
  id: string;
  invited_name: string;
  partner_name: string | null;
  invited_email: string;
  partner_email: string | null;
  address: string | null;
}

interface ParticipationState {
  participating: boolean;
  couple: CoupleData | null;
  isPartner: boolean;
  coOrganizers: CoOrganizer[];
}

export function OrganizerParticipation({ eventId, eventSlug }: { eventId: string; eventSlug?: string }) {
  const [state, setState] = useState<ParticipationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [partnerMode, setPartnerMode] = useState<'coorg' | 'other' | null>(null);
  const [selectedCoOrg, setSelectedCoOrg] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Form fields
  const [invitedName, setInvitedName] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [invitedAllergies, setInvitedAllergies] = useState('');
  const [partnerAllergies, setPartnerAllergies] = useState('');
  const [coursePreference, setCoursePreference] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/participate`);
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Pre-fill co-organizer data when selected
  useEffect(() => {
    if (partnerMode === 'coorg' && selectedCoOrg && state) {
      const co = state.coOrganizers.find(c => c.id === selectedCoOrg);
      if (co) {
        setPartnerName(co.name || '');
        setPartnerEmail(co.email);
      }
    } else if (partnerMode === 'other') {
      setPartnerName('');
      setPartnerEmail('');
    }
  }, [partnerMode, selectedCoOrg, state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/organizer/events/${eventId}/participate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invited_name: invitedName,
          invited_phone: invitedPhone || undefined,
          partner_name: partnerName,
          partner_email: partnerEmail || undefined,
          partner_phone: partnerPhone || undefined,
          address,
          coordinates,
          invited_allergies: invitedAllergies ? invitedAllergies.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          partner_allergies: partnerAllergies ? partnerAllergies.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          course_preference: coursePreference || undefined,
          coOrganizerId: partnerMode === 'coorg' ? selectedCoOrg : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Något gick fel');
        return;
      }

      setShowForm(false);
      await fetchStatus();
    } catch {
      setError('Nätverksfel — försök igen');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/participate`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Kunde inte avregistrera');
        return;
      }
      setConfirmCancel(false);
      setShowForm(false);
      await fetchStatus();
    } catch {
      setError('Nätverksfel');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
    );
  }

  if (!state) return null;

  // Already participating
  if (state.participating && state.couple) {
    const c = state.couple;
    return (
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h3 className="font-semibold text-gray-900">Ditt deltagande</h3>
        </div>
        <div className="bg-green-50 rounded-lg p-3 space-y-1">
          <p className="text-sm font-medium text-green-800">✅ Du deltar som par</p>
          <p className="text-sm text-green-700">
            {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
          </p>
          {c.address && (
            <p className="text-xs text-green-600">{c.address}</p>
          )}
        </div>
        {state.isPartner && (
          <p className="text-xs text-gray-500">
            Du är registrerad som partner i detta par.
          </p>
        )}
        <div className="flex gap-2">
          <a
            href={`/e/${encodeURIComponent(eventSlug || eventId)}/live`}
            target="_blank"
            rel="noopener"
            className="text-sm text-purple-600 hover:text-purple-800 font-medium"
          >
            Öppna gästvy →
          </a>
          {!state.isPartner && (
            <>
              <span className="text-gray-300">|</span>
              {confirmCancel ? (
                <span className="text-sm space-x-2">
                  <span className="text-red-600">Säker?</span>
                  <button onClick={handleCancel} disabled={saving} className="text-red-600 hover:text-red-800 font-medium">
                    {saving ? '...' : 'Ja, avregistrera'}
                  </button>
                  <button onClick={() => setConfirmCancel(false)} className="text-gray-500 hover:text-gray-700">
                    Avbryt
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Avregistrera
                </button>
              )}
            </>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // Not participating — show toggle or form
  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h3 className="font-semibold text-gray-900">Ditt deltagande</h3>
      </div>

      {!showForm ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Du deltar inte i evenemanget.</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-purple-600 hover:text-purple-800"
          >
            Jag vill delta →
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Partner selection */}
          {partnerMode === null ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Vem deltar du med?</p>
              {state.coOrganizers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPartnerMode('coorg')}
                  className="w-full text-left p-3 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  <p className="font-medium text-sm">Med en annan arrangör</p>
                  <p className="text-xs text-gray-500">
                    {state.coOrganizers.map(c => c.name || c.email).join(', ')}
                  </p>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPartnerMode('other')}
                className="w-full text-left p-3 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors"
              >
                <p className="font-medium text-sm">Med någon annan</p>
                <p className="text-xs text-gray-500">Fyll i partnerns uppgifter</p>
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Avbryt
              </button>
            </div>
          ) : (
            <>
              {/* Co-organizer selector */}
              {partnerMode === 'coorg' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Välj medarrangör</label>
                  <select
                    value={selectedCoOrg}
                    onChange={e => setSelectedCoOrg(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Välj...</option>
                    {state.coOrganizers.map(co => (
                      <option key={co.id} value={co.id}>
                        {co.name || co.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Form fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ditt namn *</label>
                  <input
                    type="text"
                    value={invitedName}
                    onChange={e => setInvitedName(e.target.value)}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Förnamn Efternamn"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Din telefon</label>
                  <input
                    type="tel"
                    value={invitedPhone}
                    onChange={e => setInvitedPhone(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="070..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Partners namn *</label>
                  <input
                    type="text"
                    value={partnerName}
                    onChange={e => setPartnerName(e.target.value)}
                    required
                    readOnly={partnerMode === 'coorg' && !!selectedCoOrg}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${partnerMode === 'coorg' && selectedCoOrg ? 'bg-gray-50' : ''}`}
                    placeholder="Förnamn Efternamn"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Partners email</label>
                  <input
                    type="email"
                    value={partnerEmail}
                    onChange={e => setPartnerEmail(e.target.value)}
                    readOnly={partnerMode === 'coorg' && !!selectedCoOrg}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${partnerMode === 'coorg' && selectedCoOrg ? 'bg-gray-50' : ''}`}
                    placeholder="email@example.com"
                  />
                </div>
                {partnerMode === 'other' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Partners telefon</label>
                    <input
                      type="tel"
                      value={partnerPhone}
                      onChange={e => setPartnerPhone(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="070..."
                    />
                  </div>
                )}
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Adress *</label>
                <AddressAutocomplete
                  value={address}
                  onChange={(val, coords) => {
                    setAddress(val);
                    if (coords) setCoordinates(coords);
                  }}
                  placeholder="Sök adress..."
                />
              </div>

              {/* Optional fields */}
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Fler uppgifter (allergier, önskemål...)
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Dina allergier</label>
                      <input
                        type="text"
                        value={invitedAllergies}
                        onChange={e => setInvitedAllergies(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="Separera med komma"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Partners allergier</label>
                      <input
                        type="text"
                        value={partnerAllergies}
                        onChange={e => setPartnerAllergies(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="Separera med komma"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Rättönskemål</label>
                    <select
                      value={coursePreference}
                      onChange={e => setCoursePreference(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Ingen preferens</option>
                      <option value="starter">Vill helst laga förrätt</option>
                      <option value="main">Vill helst laga huvudrätt</option>
                      <option value="dessert">Vill helst laga dessert</option>
                    </select>
                  </div>
                </div>
              </details>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {saving ? 'Sparar...' : 'Registrera mig'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setPartnerMode(null); setError(null); }}
                  className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
                >
                  Avbryt
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
