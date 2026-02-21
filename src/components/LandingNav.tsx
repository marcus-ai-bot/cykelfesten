'use client';

import { useState } from 'react';
import Link from 'next/link';

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-amber-100 bg-white/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-amber-900">
          <span className="text-xl">🚴</span>
          <span>Cykelfesten</span>
        </Link>

        {/* Desktop */}
        <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
          <Link href="/guest" className="text-amber-700 hover:text-amber-900 transition">
            Jag är inbjuden
          </Link>
          <Link href="/organizer/login" className="text-amber-700 hover:text-amber-900 transition">
            Logga in
          </Link>
          <Link
            href="/organizer/login"
            className="rounded-full bg-amber-500 text-white px-5 py-2 shadow-sm hover:bg-amber-600 transition"
          >
            Skapa event
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="sm:hidden p-2 text-amber-700"
          aria-label="Meny"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-amber-100 bg-white px-4 py-3 space-y-2">
          <Link
            href="/guest"
            onClick={() => setOpen(false)}
            className="block text-center rounded-xl border border-amber-200 text-amber-700 py-2.5 text-sm font-medium"
          >
            Jag är inbjuden
          </Link>
          <Link
            href="/organizer/login"
            onClick={() => setOpen(false)}
            className="block text-center rounded-xl border border-amber-200 text-amber-700 py-2.5 text-sm font-medium"
          >
            Logga in
          </Link>
          <Link
            href="/organizer/login"
            onClick={() => setOpen(false)}
            className="block text-center rounded-xl bg-amber-500 text-white py-2.5 text-sm font-medium"
          >
            Skapa event
          </Link>
        </div>
      )}
    </nav>
  );
}
