'use client';

import { useState } from 'react';

interface Organizer {
  organizer_id: string;
  role: 'founder' | 'co-organizer';
  accepted_at: string | null;
  organizer: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface Props {
  eventId: string;
  organizers: Organizer[];
  isFounder: boolean;
  currentOrganizerId: string;
}

export function InviteTeamSection({ eventId, organizers, isFounder, currentOrganizerId }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Organizer | null>(null);
  // Track removed organizer IDs so they disappear from UI immediately
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Något gick fel');
      }
      
      setMessage({ type: 'success', text: `Inbjudan skickad till ${email}` });
      setInviteLink(data.invite_url);
      setEmail('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }
  
  async function copyInviteLink() {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setMessage({ type: 'success', text: 'Länk kopierad!' });
    }
  }
  
  const [resending, setResending] = useState<string | null>(null);

  async function handleResendInvite(email: string) {
    setResending(email);
    setMessage(null);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Något gick fel');
      setMessage({ type: 'success', text: `Ny inbjudan skickad till ${email}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setResending(null);
    }
  }

  async function handleRemove(o: Organizer) {
    setRemoving(o.organizer_id);
    setMessage(null);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/team/${o.organizer_id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Något gick fel');
      setRemovedIds(prev => new Set(prev).add(o.organizer_id));
      setMessage({
        type: 'success',
        text: o.accepted_at
          ? `${o.organizer.name || o.organizer.email} har tagits bort`
          : `Inbjudan till ${o.organizer.email} har dragits tillbaka`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRemoving(null);
      setConfirmRemove(null);
    }
  }

  const visibleOrganizers = organizers.filter(o => !removedIds.has(o.organizer_id));
  const accepted = visibleOrganizers.filter(o => o.accepted_at);
  const pending = visibleOrganizers.filter(o => !o.accepted_at);

  const canRemove = (o: Organizer) => {
    if (o.organizer.id === currentOrganizerId) return false; // Can't remove yourself
    if (o.role === 'founder') return false; // Can't remove founder
    if (o.accepted_at && !isFounder) return false; // Only founder removes accepted
    return true; // Pending can be revoked by anyone
  };
  
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">👥 Arrangörsteam</h2>
        {visibleOrganizers.length < 5 && (
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
          >
            {showInviteForm ? 'Stäng' : '+ Bjud in medarrangör'}
          </button>
        )}
      </div>
      
      {/* Invite Form */}
      {showInviteForm && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@example.com"
              required
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Skickar...' : 'Bjud in'}
            </button>
          </form>
          
          {message && !confirmRemove && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {message.text}
            </div>
          )}
          
          {inviteLink && (
            <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
              <p className="text-sm text-indigo-700 mb-2">
                Eller dela länken direkt:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border rounded text-sm"
                />
                <button
                  onClick={copyInviteLink}
                  className="px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                >
                  Kopiera
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm Remove Dialog */}
      {confirmRemove && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-800 mb-3">
            {confirmRemove.accepted_at
              ? `Ta bort ${confirmRemove.organizer.name || confirmRemove.organizer.email} som medarrangör?`
              : `Dra tillbaka inbjudan till ${confirmRemove.organizer.email}?`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleRemove(confirmRemove)}
              disabled={removing === confirmRemove.organizer_id}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {removing ? 'Tar bort...' : 'Ja, ta bort'}
            </button>
            <button
              onClick={() => setConfirmRemove(null)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* Status message (outside invite form) */}
      {message && !showInviteForm && !confirmRemove && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}
      
      {/* Team List */}
      <div className="space-y-3">
        {accepted.map(o => (
          <div 
            key={o.organizer_id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
                {(o.organizer.name || o.organizer.email)[0].toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-gray-900">
                  {o.organizer.name || o.organizer.email}
                  {o.organizer.id === currentOrganizerId && (
                    <span className="text-gray-400 text-sm ml-2">(du)</span>
                  )}
                </div>
                {o.organizer.name && (
                  <div className="text-sm text-gray-500">{o.organizer.email}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {o.role === 'founder' && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                  Grundare
                </span>
              )}
              {canRemove(o) && (
                <button
                  onClick={() => setConfirmRemove(o)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="Ta bort"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
        
        {pending.map(o => (
          <div 
            key={o.organizer_id}
            className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                ⏳
              </div>
              <div>
                <div className="text-gray-700">{o.organizer.email}</div>
                <div className="text-sm text-yellow-600">Väntar på svar</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResendInvite(o.organizer.email)}
                disabled={resending === o.organizer.email}
                className="text-xs px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {resending === o.organizer.email ? 'Skickar...' : '📧 Skicka igen'}
              </button>
              <button
                onClick={() => setConfirmRemove(o)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="Dra tillbaka inbjudan"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {visibleOrganizers.length < 5 && (
        <p className="text-sm text-gray-500 mt-4">
          Du kan bjuda in upp till {5 - visibleOrganizers.length} fler medarrangörer.
        </p>
      )}
    </div>
  );
}
