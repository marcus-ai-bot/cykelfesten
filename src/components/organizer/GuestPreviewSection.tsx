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

export function GuestPreviewSection({ eventId, slug }: Props) {
  const [previewTime, setPreviewTime] = useState('');
  const [selectedCoupleId, setSelectedCoupleId] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [couples, setCouples] = useState<CoupleOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch event date + couples for preview
    Promise.all([
      fetch(`/api/organizer/events/${eventId}/settings`).then(r => r.json()),
      fetch(`/api/organizer/events/${eventId}/couples?limit=200`).then(r => r.json()).catch(() => ({ couples: [] })),
    ]).then(([settingsData, couplesData]) => {
      if (settingsData.event?.event_date) setEventDate(settingsData.event.event_date);
      if (couplesData.couples) {
        setCouples(couplesData.couples);
        if (couplesData.couples.length > 0) setSelectedCoupleId(couplesData.couples[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [eventId]);

  const simulateTimeParam = previewTime && eventDate
    ? `&simulateTime=${eventDate}T${previewTime}:00`
    : '';

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const previewUrl = selectedCoupleId
    ? `${baseUrl}/e/${slug}/live?coupleId=${selectedCoupleId}${simulateTimeParam}`
    : '#';

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        👁️ Gästperspektiv
      </h2>
      <p className="text-gray-600 text-sm mb-4">
        Se hur gästerna upplever kuvertet vid olika tidpunkter.
      </p>

      {/* Time Picker */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Simulera tidpunkt
        </label>
        <div className="flex gap-3 items-center flex-wrap">
          <input
            type="time"
            value={previewTime}
            onChange={(e) => setPreviewTime(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-500 text-sm">
            {previewTime
              ? `Visar kl ${previewTime} på eventdagen`
              : 'Aktuell tid används'}
          </span>
          {previewTime && (
            <button onClick={() => setPreviewTime('')} className="text-gray-400 hover:text-gray-600 text-sm">
              ✕ Återställ
            </button>
          )}
        </div>
      </div>

      {/* Couple Picker */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Visa som
        </label>
        {loading ? (
          <p className="text-gray-400 text-sm">Laddar par...</p>
        ) : (
          <select
            value={selectedCoupleId}
            onChange={(e) => setSelectedCoupleId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            {couples.map(c => (
              <option key={c.id} value={c.id}>
                {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Single preview button */}
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full text-center py-3 rounded-xl font-medium transition-colors ${
          selectedCoupleId
            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
        onClick={(e) => { if (!selectedCoupleId) e.preventDefault(); }}
      >
        📬 Förhandsgranska kuvert
      </a>

      <p className="text-xs text-gray-500 mt-3">
        💡 Ändra tiden för att se hur kuvertet avslöjas steg för steg under kvällen.
      </p>
    </div>
  );
}
