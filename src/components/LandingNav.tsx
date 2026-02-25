'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-amber-100 bg-white/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-base sm:text-lg font-semibold text-amber-900">
          <span className="text-xl">🚴</span>
          <span>Cykelfesten</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-amber-700 hover:text-amber-900 text-sm font-medium transition cursor-pointer"
          >
            Kom igång
            <svg
              className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-amber-100 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <Link
                href="/organizer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition"
              >
                <span className="text-lg">🎉</span>
                <div>
                  <div className="text-sm font-medium text-amber-900">Arrangör</div>
                  <div className="text-xs text-amber-600">Skapa ett nytt event</div>
                </div>
              </Link>

              <Link
                href="/guest"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition"
              >
                <span className="text-lg">🍽️</span>
                <div>
                  <div className="text-sm font-medium text-amber-900">Gäst</div>
                  <div className="text-xs text-amber-600">Jag är inbjuden</div>
                </div>
              </Link>

              <div className="border-t border-amber-100 my-1" />

              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 transition"
              >
                <span className="text-lg">👤</span>
                <div className="text-sm font-medium text-amber-700">Logga in</div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
