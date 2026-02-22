'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';

interface CoupleOption {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

export default function PreviewHubPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [slug, setSlug] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [couples, setCouples] = useState<CoupleOption[]>([]);
  const [selectedCoupleId, setSelectedCoupleId] = useState('');
  const [previewTime, setPreviewTime] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/organizer/events/${eventId}/settings`).then(r => r.json()),
      fetch(`/api/organizer/events/${eventId}/couples?limit=200`).then(r => r.json()).catch(() => ({ couples: [] })),
    ]).then(([settingsData, couplesData]) => {
      if (settingsData.event) {
        setSlug(settingsData.event.slug);
        setEventDate(settingsData.event.event_date);
      }
      if (couplesData.couples) {
        setCouples(couplesData.couples);
        if (couplesData.couples.length > 0) setSelectedCoupleId(couplesData.couples[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [eventId]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const simulateTimeParam = previewTime && eventDate
    ? `&simulateTime=${eventDate}T${previewTime}:00`
    : '';

  const previews = [
    {
      icon: '📨',
      title: 'Inbjudan & Registrering',
      description: 'Så ser anmälningsformuläret ut för gästerna',
      href: `${baseUrl}/e/${slug}/register?invite=preview`,
      requiresCouple: false,
    },
    {
      icon: '✉️',
      title: 'Kuvert (Reveals)',
      description: 'Se hur kuvertet avslöjas steg för steg',
      href: `${baseUrl}/e/${slug}/live?coupleId=${selectedCoupleId}${simulateTimeParam}`,
      requiresCouple: true,
    },
    {
      icon: '🏠',
      title: 'Värd-vy',
      description: 'Information som värdar ser — allergier, gäster, ledtrådar',
      href: `${baseUrl}/e/${slug}/host?coupleId=${selectedCoupleId}`,
      requiresCouple: true,
    },
    {
      icon: '🎬',
      title: 'Wrap',
      description: 'Personlig statistik och minnen efter festen',
      href: `/organizer/event/${eventId}/wrap?tab=preview`,
      requiresCouple: false,
    },
    {
      icon: '🏆',
      title: 'Awards',
      description: 'Prisutdelning — så ser det ut för mottagaren',
      href: `/organizer/event/${eventId}/awards`,
      requiresCouple: false,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Laddar...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="👁️ Gästperspektiv" />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Couple + time picker */}
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">Visa som</h2>
          <div className="space-y-3">
            <select
              value={selectedCoupleId}
              onChange={(e) => setSelectedCoupleId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            >
              {couples.map(c => (
                <option key={c.id} value={c.id}>
                  {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 shrink-0">Simulera tid:</label>
              <input
                type="time"
                value={previewTime}
                onChange={(e) => setPreviewTime(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
              {previewTime && (
                <button onClick={() => setPreviewTime('')} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              )}
              <span className="text-xs text-gray-400">
                {previewTime ? `Kl ${previewTime} på eventdagen` : 'Aktuell tid'}
              </span>
            </div>
          </div>
        </div>

        {/* Preview cards */}
        <div className="grid gap-4">
          {previews.map((p) => {
            const disabled = p.requiresCouple && !selectedCoupleId;
            if (disabled) {
              return (
                <div key={p.title} className="bg-gray-50 rounded-xl p-5 opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{p.title}</h3>
                      <p className="text-sm text-gray-500">{p.description}</p>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <a
                key={p.title}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{p.icon}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{p.title}</h3>
                    <p className="text-sm text-gray-500">{p.description}</p>
                  </div>
                  <span className="text-gray-300 group-hover:text-indigo-400 transition">↗</span>
                </div>
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
