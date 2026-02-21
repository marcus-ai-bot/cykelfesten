'use client';

import { useState, useEffect } from 'react';

interface Props {
  eventId: string;
  slug: string;
}

interface CoupleOption {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

export function AfterPartyPreview({ eventId, slug }: Props) {
  const [selectedCoupleId, setSelectedCoupleId] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<'invited' | 'partner'>('invited');
  const [couples, setCouples] = useState<CoupleOption[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedCouple = couples.find(c => c.id === selectedCoupleId);

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/couples?limit=200`)
      .then(r => r.json())
      .then(data => {
        if (data.couples) {
          setCouples(data.couples);
          if (data.couples.length > 0) setSelectedCoupleId(data.couples[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const wrapUrl = `${baseUrl}/e/${slug}/wrap?coupleId=${selectedCoupleId}&person=${selectedPerson}`;
  const awardUrl = `${baseUrl}/e/${slug}/award?coupleId=${selectedCoupleId}&person=${selectedPerson}`;

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        🎬 Förhandsgranska Efteråt
      </h2>
      <p className="text-gray-600 text-sm mb-4">
        Se Wrap och Award ur en gästs perspektiv.
      </p>

      {/* Couple Picker */}
      <div className="bg-white rounded-xl p-4 mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Välj par
        </label>
        {loading ? (
          <p className="text-gray-400 text-sm">Laddar...</p>
        ) : (
          <select
            value={selectedCoupleId}
            onChange={(e) => {
              setSelectedCoupleId(e.target.value);
              setSelectedPerson('invited');
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
          >
            {couples.map(c => (
              <option key={c.id} value={c.id}>
                {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Person Toggle (only if couple has partner) */}
      {selectedCouple?.partner_name && (
        <div className="bg-white rounded-xl p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Visa som
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPerson('invited')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                selectedPerson === 'invited'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {selectedCouple.invited_name}
            </button>
            <button
              onClick={() => setSelectedPerson('partner')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                selectedPerson === 'partner'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {selectedCouple.partner_name}
            </button>
          </div>
        </div>
      )}

      {/* Preview Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={wrapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-center py-3 rounded-xl font-medium transition-colors ${
            selectedCoupleId
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          onClick={(e) => { if (!selectedCoupleId) e.preventDefault(); }}
        >
          ✨ Wrap
        </a>
        <a
          href={awardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-center py-3 rounded-xl font-medium transition-colors ${
            selectedCoupleId
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          onClick={(e) => { if (!selectedCoupleId) e.preventDefault(); }}
        >
          🏆 Award
        </a>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        💡 Wrap och Award är personliga — varje person ser sin egen version.
      </p>
    </div>
  );
}
