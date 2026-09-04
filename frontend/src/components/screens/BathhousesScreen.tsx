import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Sparkles, CalendarDays } from 'lucide-react';
import { termburgLocations } from '@/data/termburgLocations';

export function BathhousesScreen() {
  return (
    <div className="h-full flex flex-col bg-dark-surface overflow-hidden">
      <header className="screen-safe-header px-5 pb-3">
        <div className="gold-separator mb-3" />
        <div className="flex items-center gap-2.5">
          <img src="/images/brand/termburg-fish-96-v2.webp" alt="" aria-hidden="true" className="w-8 h-8 object-contain" width="32" height="32" />
          <h1 className="font-heading text-xl font-bold text-primary tracking-[0.1em]">
            ТЕРМБУРГИ
          </h1>
        </div>
        <p className="mt-1 text-base font-semibold leading-tight text-white/70">
          Наши термальные комплексы
        </p>
      </header>

      <div className="gold-separator" />

      <section
        aria-label="Наши термальные комплексы"
        className="phone-scroll flex-1 overflow-y-auto px-3 py-3"
      >
        <div className="space-y-3">
          {termburgLocations.map((location) => {
            const cityName = location.city.replace(/^г\.\s*/i, '');

            return (
              <article
                key={location.id}
                aria-labelledby={`bathhouse-city-${location.id}`}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                {/* Color accent top bar */}
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: location.color }}
                />

                {/* Complex and city */}
                <div className="flex items-center gap-3 px-3 pb-2 pt-3">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${location.color}30` }}
                  >
                    <img
                      src="/images/brand/termburg-fish-96-v2.webp"
                      alt=""
                      aria-hidden="true"
                      className="h-7 w-7 object-contain"
                      width="28"
                      height="28"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-none text-white/60">
                      {location.name}
                    </p>
                    <h2
                      id={`bathhouse-city-${location.id}`}
                      className="mt-1 font-heading text-3xl font-bold leading-tight text-white"
                    >
                      {cityName}
                    </h2>
                  </div>
                </div>

                {/* Primary actions */}
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  <Link
                    to={`/bathhouses/${location.id}/schedule`}
                    aria-label={`Открыть расписание комплекса «${location.name}» в городе ${location.city}`}
                    className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-2 text-sm font-bold text-dark-surface transition-opacity hover:opacity-90"
                  >
                    <CalendarDays size={16} aria-hidden="true" />
                    <span>Расписание</span>
                  </Link>
                  <a
                    href={location.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Открыть сайт комплекса «${location.name}» в городе ${location.city} в новой вкладке`}
                    className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-sm font-semibold text-white/90 transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: `${location.color}26`,
                    }}
                  >
                    <Sparkles size={16} aria-hidden="true" />
                    <span>Перейти на сайт</span>
                  </a>
                </div>

                {/* Contact details */}
                <div className="space-y-2 border-t border-white/10 px-3 py-3">
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
                    <p className="text-sm leading-snug text-white/75">
                      {location.city}, {location.address}
                    </p>
                  </div>

                  <div className="flex min-h-6 items-center gap-2">
                    <Phone size={16} className="flex-shrink-0 text-primary" aria-hidden="true" />
                    <a
                      href={`tel:${location.phone.replace(/[\s()-]/g, '')}`}
                      className="text-sm leading-snug text-white/75 transition-colors hover:text-primary"
                    >
                      {location.phone}
                    </a>
                  </div>

                  <div className="flex items-start gap-2">
                    <Clock size={16} className="mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-white/75">
                        {location.workHours}
                      </p>
                      {location.workHoursNote && (
                        <p className="mt-0.5 text-xs leading-snug text-white/55">
                          {location.workHoursNote}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Promo banner */}
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/20 to-primary/5 p-4">
            <p className="mb-1 text-sm font-semibold text-primary">
              Стресс долой — семья с тобой!
            </p>
            <p className="text-xs text-white/50">
              Термбург — семейный термальный комплекс с множеством бань, бассейнов и зон отдыха для всей семьи.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
