'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Props {
  eventId: string;
}

export function HamburgerMenu({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const items = [
    { icon: '⚙️', label: 'Eventinställningar', href: `/organizer/event/${eventId}/settings` },
    { icon: '⏰', label: 'Tider & kuvert', href: `/organizer/event/${eventId}/timing` },
    { icon: '🔗', label: 'Gästlänkar', href: `/organizer/event/${eventId}/settings#links` },
    { icon: '👥', label: 'Arrangörsteam', href: `#invite-team`, scroll: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-gray-700"
        aria-label="Meny"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 animate-fade-in">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 my-1" />
          <button
            disabled
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 cursor-not-allowed w-full text-left opacity-50"
          >
            <span>🗑️</span>
            Radera event
          </button>
        </div>
      )}
    </div>
  );
}
