import Link from 'next/link';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RegisteredPage({ params }: Props) {
  const { slug } = await params;
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center">
        <div className="text-8xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold text-amber-900 mb-4">
          Anmälan mottagen!
        </h1>
        <p className="text-amber-700 mb-8">
          Tack för din anmälan! Du får ett mail med bekräftelse och din
          personliga länk när matchningen är klar.
        </p>
        
        <div className="bg-white rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-lg font-semibold text-amber-900 mb-3">
            Vad händer nu?
          </h2>
          <ol className="text-left text-amber-700 space-y-2">
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">1.</span>
              Arrangören samlar in fler anmälningar
            </li>
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">2.</span>
              Matchningen körs — du får veta vilken rätt du lagar
            </li>
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">3.</span>
              Kvällen innan: förbered din rätt!
            </li>
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">4.</span>
              Festdagen: öppna kuvert och cykla! 🚴
            </li>
          </ol>
        </div>
        
        <Link 
          href={`/e/${slug}`}
          className="text-amber-500 hover:text-amber-600 font-medium"
        >
          ← Tillbaka till eventet
        </Link>
      </div>
    </main>
  );
}
