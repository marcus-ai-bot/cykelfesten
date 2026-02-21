'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';

const organizerSteps = [
  {
    title: 'Skapa eventet',
    text: 'Sätt datum, tider och antal rätter. Skapa enkelt på några minuter.',
    icon: '🗓️',
  },
  {
    title: 'Bjud in kvarteret',
    text: 'Dela länken i en grupp eller lapp i brevlådan.',
    icon: '📬',
  },
  {
    title: 'Matchning & logistik',
    text: 'Vi sköter smart matchning, allergier och scheman.',
    icon: '🎯',
  },
  {
    title: 'Cykelfest!',
    text: 'Digitala kuvert öppnas och gäster rullar vidare.',
    icon: '🚴‍♀️',
  },
];

const guestSteps = [
  {
    title: 'Få inbjudan',
    text: 'Du får en länk från arrangören och anmäler dig enkelt.',
    icon: '✨',
  },
  {
    title: 'Fyll i detaljer',
    text: 'Adress, allergier och vilken rätt ni vill laga.',
    icon: '🍽️',
  },
  {
    title: 'Se ditt schema',
    text: 'Dina kuvert öppnas automatiskt under kvällen.',
    icon: '✉️',
  },
  {
    title: 'Träffa nya grannar',
    text: 'Njut av tre stopp och nya samtal vid varje bord.',
    icon: '🥂',
  },
];

export default function Home() {
  const [tab, setTab] = useState<'organizer' | 'guest'>('organizer');

  const steps = useMemo(() => (tab === 'organizer' ? organizerSteps : guestSteps), [tab]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => {
        el.classList.remove('opacity-0', 'translate-y-4');
        el.classList.add('opacity-100', 'translate-y-0');
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('opacity-0', 'translate-y-4');
            entry.target.classList.add('opacity-100', 'translate-y-0');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-white text-gray-900">
      <LandingNav />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-8 pb-10 sm:py-20">
        <div className="text-center lg:text-left lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs sm:text-sm font-medium text-amber-800">
              🌟 Byggd i Piteå · Perfekt för kvarteret
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-amber-900 leading-tight">
              Gör ditt kvarter till en restaurang för en kväll
            </h1>
            <p className="text-base sm:text-xl text-amber-800 max-w-xl mx-auto lg:mx-0">
              Cykelfesten gör det enkelt att ordna en dinner safari där grannar möts, nya vänskaper uppstår och logistik sköts automatiskt.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
              <Link
                href="/organizer/login"
                className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white px-6 py-3 text-base font-semibold shadow-lg hover:bg-amber-600 transition"
              >
                Skapa ett event
              </Link>
              <Link
                href="/guest"
                className="inline-flex items-center justify-center rounded-full border border-amber-300 text-amber-800 px-6 py-3 text-base font-semibold hover:bg-amber-100 transition"
              >
                Jag är inbjuden
              </Link>
            </div>
            <div className="flex flex-wrap gap-4 sm:gap-6 text-xs sm:text-sm text-amber-700 justify-center lg:justify-start">
              <div>👥 1 200+ gäster</div>
              <div>🏡 75+ kvarter</div>
              <div>⭐ 4,9 / 5</div>
            </div>
          </div>

          <div className="hidden lg:block bg-white/80 rounded-3xl shadow-lg p-8 border border-amber-100" data-reveal>
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-amber-900">Varför Cykelfesten?</h2>
              <ul className="space-y-3 text-amber-700">
                <li className="flex gap-3"><span>🎉</span>Skapar gemenskap utan krångel</li>
                <li className="flex gap-3"><span>🧭</span>Smart ruttplanering och matchning</li>
                <li className="flex gap-3"><span>🧾</span>Allergier & matpreferenser hanteras</li>
                <li className="flex gap-3"><span>🔔</span>Digitala kuvert öppnas i rätt tid</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-10 sm:pb-12" data-reveal>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: '✉️',
              title: 'Digitala kuvert',
              text: 'Animerade kuvert som öppnas när det är dags att cykla vidare.',
            },
            {
              icon: '🧠',
              title: 'Smart matchning',
              text: 'Algoritmen ser till att ni möter nya personer vid varje rätt.',
            },
            {
              icon: '🥗',
              title: 'Allergier & preferenser',
              text: 'Vi håller koll på specialkost, antal gäster och önskade rätter.',
            },
            {
              icon: '🎁',
              title: 'Wraps & efterfest',
              text: 'Avsluta med en gemensam final - vi håller koll på tiderna.',
            },
          ].map((feature) => (
            <div key={feature.title} className="bg-white rounded-2xl shadow-md p-4 sm:p-6 border border-amber-100">
              <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">{feature.icon}</div>
              <h3 className="text-sm sm:text-lg font-semibold text-amber-900 mb-1 sm:mb-2">{feature.title}</h3>
              <p className="text-amber-700 text-xs sm:text-sm leading-relaxed">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-10 sm:py-12" data-reveal>
        <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-8 border border-amber-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-amber-900">Så funkar det</h2>
              <p className="text-amber-700 text-sm sm:text-base mt-1">Välj perspektiv.</p>
            </div>
            <div className="flex gap-1 bg-amber-50 rounded-full p-1 self-start">
              <button
                onClick={() => setTab('organizer')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  tab === 'organizer'
                    ? 'bg-white text-amber-900 shadow'
                    : 'text-amber-600 hover:text-amber-800'
                }`}
              >
                Som arrangör
              </button>
              <button
                onClick={() => setTab('guest')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  tab === 'guest'
                    ? 'bg-white text-amber-900 shadow'
                    : 'text-amber-600 hover:text-amber-800'
                }`}
              >
                Som gäst
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-xl sm:text-2xl">{step.icon}</span>
                  <span className="text-xs sm:text-sm font-semibold text-amber-400">0{index + 1}</span>
                </div>
                <h3 className="font-semibold text-amber-900 text-sm sm:text-base mb-1 sm:mb-2">{step.title}</h3>
                <p className="text-xs sm:text-sm text-amber-700 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases + testimonial */}
      <section className="max-w-6xl mx-auto px-4 pb-10 sm:pb-12" data-reveal>
        <div className="space-y-6 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-6 lg:space-y-0 lg:items-center">
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-amber-900">Perfekt för föreningar, kvarter och vängrupper</h2>
            <p className="text-sm sm:text-base text-amber-700">
              Cykelfesten skapar gemenskap där du bor. Enkelt, tryggt och inspirerande.
            </p>
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-amber-700">
              <span className="rounded-full bg-amber-100 px-3 py-1">🏘️ Kvartersfest</span>
              <span className="rounded-full bg-amber-100 px-3 py-1">🤝 Föreningar</span>
              <span className="rounded-full bg-amber-100 px-3 py-1">🎈 Vängrupper</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-md p-5 border border-amber-100">
            <p className="text-amber-700 text-sm italic">
              "Vi fick 36 grannar att mötas på en kväll, utan att behöva Excel eller utskrifter."
            </p>
            <p className="text-amber-500 text-xs mt-3">- Testimonial kommer snart</p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-12 sm:pb-16" data-reveal>
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
            <div>
              <h2 className="text-xl sm:text-3xl font-bold">Redo att starta?</h2>
              <p className="text-white/90 text-sm sm:text-base mt-1">Skapa eventet på fem minuter.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/organizer/login"
                className="rounded-full bg-white text-amber-700 px-5 py-2.5 text-sm font-semibold text-center"
              >
                Skapa ett event
              </Link>
              <Link
                href="/guest"
                className="rounded-full border border-white/70 px-6 py-3 text-sm font-semibold text-center"
              >
                Jag är inbjuden
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-amber-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-amber-700">
          <div className="flex flex-wrap gap-4">
            <Link href="/organizer/login" className="hover:text-amber-900">Skapa event</Link>
            <Link href="/organizer/login" className="hover:text-amber-900">Logga in</Link>
            <Link href="/" className="hover:text-amber-900">Om oss</Link>
          </div>
          <div>Byggd med ❤️ i Piteå</div>
        </div>
      </footer>
    </main>
  );
}
