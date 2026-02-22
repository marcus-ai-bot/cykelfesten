'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function AfterpartyPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href={`/organizer/event/${eventId}?phase=dinner`} className="text-gray-500 hover:text-gray-700 text-sm">← Middag</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">🎉 Efterfesten</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Kommer snart</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Här kommer du kunna hantera efterfesten — samlingsplats, DJ, aktiviteter och allt som händer efter middagen.
          </p>
        </div>
      </main>
    </div>
  );
}
