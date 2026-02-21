'use client';

import { useState, useEffect } from 'react';

interface Props {
  eventId: string;
  slug: string;
}

export function GuestPreviewSection({ eventId, slug }: Props) {
  const [previewTime, setPreviewTime] = useState('');
  const [selectedCoupleId, setSelectedCoupleId] = useState('');
  const [eventDate, setEventDate] = useState('');
  
  // Fetch event date on mount
  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/settings`)
      .then(r => r.json())
      .then(d => { if (d.event?.event_date) setEventDate(d.event.event_date); })
      .catch(() => {});
  }, [eventId]);
  
  // Build full ISO datetime from event date + selected time
  const simulateTimeParam = previewTime && eventDate
    ? `&simulateTime=${eventDate}T${previewTime}:00`
    : '';
  
  // Base URL for preview
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  
  // Preview URLs with time override
  const previewUrls = {
    envelope: `${baseUrl}/e/${slug}/live?coupleId=${selectedCoupleId || 'demo'}${simulateTimeParam}`,
    wrap: `${baseUrl}/e/${slug}/wrap?coupleId=${selectedCoupleId || 'demo'}&person=invited${simulateTimeParam}`,
    memories: `${baseUrl}/e/${slug}/memories`,
  };
  
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        👁️ Gästperspektiv
      </h2>
      <p className="text-gray-600 text-sm mb-4">
        Se hur gästerna upplever appen vid olika tidpunkter.
      </p>
      
      {/* Time Picker */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Simulera tidpunkt
        </label>
        <div className="flex gap-3 items-center">
          <input
            type="time"
            value={previewTime}
            onChange={(e) => setPreviewTime(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-500 text-sm">
            {previewTime 
              ? `Visar hur det ser ut kl ${previewTime}` 
              : 'Aktuell tid används'}
          </span>
          {previewTime && (
            <button
              onClick={() => setPreviewTime('')}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕ Återställ
            </button>
          )}
        </div>
      </div>
      
      {/* Preview Links */}
      <div className="grid md:grid-cols-3 gap-3">
        <PreviewLink
          href={previewUrls.envelope}
          title="📬 Kuvert"
          description="Animerat kuvert med ledtrådar"
        />
        <PreviewLink
          href={previewUrls.wrap}
          title="🎁 Wrap"
          description="Personlig sammanfattning"
        />
        <PreviewLink
          href={previewUrls.memories}
          title="📸 Memories"
          description="Gemensam statistik"
        />
      </div>
      
      <p className="text-xs text-gray-500 mt-4">
        💡 Tips: Ändra tiden för att se hur kuvertet ser ut vid olika tidpunkter under kvällen.
      </p>
    </div>
  );
}

function PreviewLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-lg p-4 hover:shadow-md transition-shadow border border-transparent hover:border-indigo-200"
    >
      <div className="font-medium text-gray-900 mb-1">{title}</div>
      <div className="text-sm text-gray-500">{description}</div>
    </a>
  );
}
