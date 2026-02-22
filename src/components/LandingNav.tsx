import Link from 'next/link';

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-amber-100 bg-white/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-base sm:text-lg font-semibold text-amber-900">
          <span className="text-xl">🚴</span>
          <span>Cykelfesten</span>
        </Link>

        <Link
          href="/login"
          className="text-amber-700 hover:text-amber-900 text-sm font-medium transition"
        >
          Logga in
        </Link>
      </div>
    </nav>
  );
}
