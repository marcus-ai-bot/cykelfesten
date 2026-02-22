'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import StatusDropdown from '@/components/organizer/StatusDropdown';
import { HamburgerMenu } from '@/components/organizer/HamburgerMenu';

interface Props {
  eventName: string;
  eventDate: string;
  city: string | null;
  eventId: string;
  eventSlug: string;
  status: string;
  couplesCount: number;
  hostCount: number;
}

export function CollapsibleHeader({ eventName, eventDate, city, eventId, eventSlug, status, couplesCount, hostCount }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Sentinel — when this scrolls out of view, show sticky bar */}
      <div ref={sentinelRef} className="h-0" />

      {/* Expanded header */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{eventName}</h1>
              <StatusDropdown eventId={eventId} currentStatus={status} />
            </div>
            <p className="text-gray-600 capitalize">{eventDate}</p>
            {city && <p className="text-gray-500 text-sm">{city}</p>}
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <span>👥 {couplesCount} anmälda</span>
              {hostCount > 0 && <span>🏠 {hostCount} värdar</span>}
            </div>
          </div>
          <Link
            href={`/e/${eventSlug}`}
            target="_blank"
            className="text-indigo-600 hover:text-indigo-700 text-sm shrink-0"
          >
            Gästsida →
          </Link>
        </div>
      </div>

      {/* Sticky collapsed bar */}
      {collapsed && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-b shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-semibold text-gray-900 truncate">{eventName}</span>
              <span className="text-gray-400">·</span>
              <span className="text-sm text-gray-500 shrink-0">{couplesCount} par</span>
              <StatusDropdown eventId={eventId} currentStatus={status} />
            </div>
            <HamburgerMenu eventId={eventId} />
          </div>
        </div>
      )}
    </>
  );
}
