export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-amber-900 mb-4">
            🚴 Cykelfesten
          </h1>
          <p className="text-xl text-amber-700 max-w-2xl mx-auto">
            Modern plattform för dinner safaris, matstafetter och cykelfester.
            Rotera mellan hem, träffa nya människor, och upplev magin i digitala kuvert.
          </p>
        </div>
        
        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="text-4xl mb-4">✉️</div>
            <h3 className="text-xl font-semibold text-amber-900 mb-2">
              Digitala kuvert
            </h3>
            <p className="text-amber-700">
              Animerade kuvert som öppnas vid rätt tid. Mystik, spänning och fest-känsla.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-amber-900 mb-2">
              Smart matchning
            </h3>
            <p className="text-amber-700">
              Automatisk fördelning som garanterar att du träffar nya personer vid varje stopp.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="text-4xl mb-4">🔄</div>
            <h3 className="text-xl font-semibold text-amber-900 mb-2">
              Hanterar avhopp
            </h3>
            <p className="text-amber-700">
              Flex-värdar och akuthem — festen rullar på även om någon blir sjuk.
            </p>
          </div>
        </div>
        
        {/* How it works */}
        <div className="bg-white rounded-xl p-8 shadow-lg mb-16">
          <h2 className="text-2xl font-bold text-amber-900 mb-6 text-center">
            Så funkar det
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <span className="bg-amber-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0">1</span>
              <div>
                <h4 className="font-semibold text-amber-900">Arrangör skapar event</h4>
                <p className="text-amber-700">Sätt datum, tider och bjud in grannar.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-amber-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0">2</span>
              <div>
                <h4 className="font-semibold text-amber-900">Deltagare anmäler sig</h4>
                <p className="text-amber-700">Par/singlar fyller i adress, allergier och önskad rätt.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-amber-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0">3</span>
              <div>
                <h4 className="font-semibold text-amber-900">Matchning körs</h4>
                <p className="text-amber-700">Algoritmen fördelar rätter och matchar gäster.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-amber-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0">4</span>
              <div>
                <h4 className="font-semibold text-amber-900">Fest!</h4>
                <p className="text-amber-700">Kuvert öppnas vid rätt tid — cykla till nästa hus!</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <footer className="text-center text-amber-600">
          <p>
            Byggd med ❤️ i Piteå
          </p>
        </footer>
      </div>
    </main>
  );
}
