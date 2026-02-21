import Link from 'next/link';

export function LandingNav() {
  return (
    <nav className="w-full border-b border-amber-100 bg-white/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-amber-900">
          <span className="text-2xl">🚴</span>
          Cykelfesten
        </Link>
        <div className="flex items-center gap-2 sm:gap-4 text-sm font-medium">
          <Link
            href="/organizer/login"
            className="hidden sm:inline-flex text-amber-700 hover:text-amber-900 transition"
          >
            Logga in
          </Link>
          <Link
            href="/organizer/login"
            className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white px-4 py-2 shadow-sm hover:bg-amber-600 transition"
          >
            Skapa event
          </Link>
        </div>
      </div>
      <div className="sm:hidden px-4 pb-4 flex gap-3">
        <Link
          href="/organizer/login"
          className="flex-1 text-center rounded-full border border-amber-200 text-amber-700 py-2 text-sm font-medium"
        >
          Logga in
        </Link>
        <Link
          href="/organizer/login"
          className="flex-1 text-center rounded-full bg-amber-500 text-white py-2 text-sm font-medium"
        >
          Skapa event
        </Link>
      </div>
    </nav>
  );
}
