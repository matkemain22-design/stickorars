import { createFileRoute } from "@tanstack/react-router";
import { OrderForm } from "@/components/OrderForm";
import logo from "@/assets/stickora-logo.png.asset.json";
import logoWhite from "@/assets/stickora-logo-white.png.asset.json";
import hero from "@/assets/hero-stickers.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stickora.rs — Štampa nalepnica po želji" },
      { name: "description", content: "Nalepnice po meri za brendove, pakovanja, automobile i događaje. Ubacite dizajn ili zatražite izradu." },
      { property: "og:title", content: "Stickora.rs — Štampa nalepnica po želji" },
      { property: "og:description", content: "Nalepnice po meri za brendove, pakovanja, automobile i događaje." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { n: "01", t: "Pošaljite dizajn", d: "Ubacite svoj fajl (PNG, PDF, SVG, AI) ili nam opišite šta želite." },
  { n: "02", t: "Provera i ponuda", d: "Pregledamo fajl, šaljemo vam pripremu i cenu na mejl." },
  { n: "03", t: "Štampa i isporuka", d: "Nakon potvrde štampamo i šaljemo na vašu adresu." },
];

const uses = ["Logo nalepnice", "Pakovanja i etikete", "Auto nalepnice", "Laptop i telefon", "Događaji", "Promo materijal"];

function Index() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="#"><img src={logo.url} alt="Stickora.rs" className="h-9 w-auto" /></a>
          <nav className="hidden gap-8 text-sm font-semibold md:flex">
            <a href="#kako" className="hover:text-muted-foreground">Kako radi</a>
            <a href="#primena" className="hover:text-muted-foreground">Primena</a>
            <a href="#porudzbina" className="hover:text-muted-foreground">Poruči</a>
          </nav>
          <a href="#porudzbina" className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-ink-foreground transition hover:opacity-90">Poruči nalepnice</a>
        </div>
      </header>

      <section className="bg-ink text-ink-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-block -rotate-2 rounded-md bg-primary px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-foreground">Štampa po meri</span>
            <h1 className="mt-6 text-4xl font-black leading-[1.05] md:text-6xl">
              Nalepnice koje <span className="text-primary">se pamte.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-ink-foreground/70">
              Bilo koji oblik, veličina i količina. Pošaljite svoj dizajn ili nam recite ideju — mi ćemo ga napraviti.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#porudzbina" className="rounded-full bg-primary px-7 py-3.5 font-bold text-primary-foreground transition hover:-translate-y-0.5">Pošalji dizajn</a>
              <a href="#porudzbina" className="rounded-full border border-ink-foreground/30 px-7 py-3.5 font-bold transition hover:bg-ink-foreground/10">Napravite mi dizajn</a>
            </div>
          </div>
          <img src={hero} alt="Šarene nalepnice po meri" width={1600} height={1104} className="w-full rounded-2xl" />
        </div>
        <div className="overflow-hidden border-t border-ink-foreground/10 py-4">
          <div className="marquee flex w-max gap-10 whitespace-nowrap font-display text-lg font-bold uppercase text-ink-foreground/80">
            {[...uses, ...uses, ...uses, ...uses].map((u, i) => (
              <span key={i} className="flex items-center gap-10">{u}<span className="text-primary">✦</span></span>
            ))}
          </div>
        </div>
      </section>

      <section id="kako" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-3xl font-bold md:text-4xl">Kako radi</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border-2 border-ink bg-card p-7 shadow-sticker">
              <div className="font-display text-3xl font-black text-hot">{s.n}</div>
              <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
              <p className="mt-2 text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="primena" className="border-y border-border bg-secondary">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-bold md:text-4xl">Za šta sve štampamo</h2>
          <div className="mt-10 flex flex-wrap gap-3">
            {uses.map((u, i) => (
              <span key={u} className={`rounded-full border-2 border-ink px-5 py-2.5 font-semibold ${i % 3 === 0 ? "bg-primary" : "bg-card"}`}>{u}</span>
            ))}
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[["Vinil", "Vodootporan, za spoljnu upotrebu"], ["Papir", "Idealno za etikete i pakovanja"], ["Providne", "Elegantan izgled na staklu"]].map(([t, d]) => (
              <div key={t} className="rounded-xl bg-card p-6"><div className="font-display font-bold">{t}</div><p className="mt-1 text-sm text-muted-foreground">{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section id="porudzbina" className="mx-auto max-w-3xl px-5 py-20">
        <h2 className="text-3xl font-bold md:text-4xl">Poručite nalepnice</h2>
        <p className="mt-3 text-muted-foreground">Popunite formu i javićemo vam se na mejl sa pripremom i cenom.</p>
        <div className="mt-10"><OrderForm /></div>
      </section>

      <footer className="bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 md:flex-row">
          <img src={logoWhite.url} alt="Stickora.rs" className="h-10 w-auto" />
          <p className="text-sm text-ink-foreground/60">© {new Date().getFullYear()} Stickora.rs — Štampa nalepnica po želji</p>
        </div>
      </footer>
    </div>
  );
}
