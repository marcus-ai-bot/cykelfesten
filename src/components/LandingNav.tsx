import Link from 'next/link';

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-amber-100 bg-white/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-base sm:text-lg font-semibold text-amber-900">
          <span className="text-xl">🚴</span>
          <span>Cykelfesten</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 text-sm font-medium">
          <Link
            href="/guest"
            className="text-amber-700 hover:text-amber-900 transition px-2 py-1.5 text-xs sm:text-sm"
          >
            Jag är inbjuden
          </Link>
          <Link
            href="/organizer/login"
            className="rounded-full bg-amber-500 text-white px-3 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm shadow-sm hover:bg-amber-600 transition"
          >
            Skapa event
          </Link>
        </div>
      </div>
    </nav>
  );
}
