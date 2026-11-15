import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { submitOrder } from "@/lib/orders.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const shapes = ["Krug", "Kvadrat", "Pravougaonik", "Ovalna", "Po konturi (die-cut)"];
const materials = ["Papir"];

export function OrderForm() {
  const send = useServerFn(submitOrder);
  const [type, setType] = useState<"upload" | "custom">("upload");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("order_type", type);
    setLoading(true);
    try {
      const res = await send({ data: fd });
      setDone(res.id);
      form.reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Greška";
      toast.error(msg.startsWith("[") ? "Proverite unete podatke." : msg);
    } finally {
      setLoading(false);
    }
  }

  if (done)
    return (
      <div className="rounded-2xl border-2 border-ink bg-primary p-10 text-center shadow-sticker">
        <h3 className="text-2xl font-black">Hvala na porudžbini!</h3>
        <p className="mt-3">Primili smo vaš zahtev. Javićemo vam se na mejl uskoro.</p>
        <p className="mt-2 text-sm opacity-70">Broj porudžbine: {done.slice(0, 8).toUpperCase()}</p>
        <button onClick={() => setDone(null)} className="mt-6 rounded-full bg-ink px-6 py-3 font-bold text-ink-foreground">Nova porudžbina</button>
      </div>
    );

  const sel = "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

  return (
    <form onSubmit={onSubmit} className="space-y-8 rounded-2xl border-2 border-ink bg-card p-6 shadow-sticker md:p-10">
      <div className="grid grid-cols-2 gap-3">
        {([["upload", "Imam svoj dizajn", "Ubacujem fajl za štampu"], ["custom", "Napravite mi dizajn", "Opisujem šta želim"]] as const).map(([v, t, d]) => (
          <button type="button" key={v} onClick={() => setType(v)}
            className={`rounded-xl border-2 p-4 text-left transition ${type === v ? "border-ink bg-primary" : "border-border hover:border-ink"}`}>
            <div className="font-bold">{t}</div><div className="text-sm opacity-70">{d}</div>
          </button>
        ))}
      </div>

      {type === "upload" ? (
        <div className="space-y-2">
          <Label htmlFor="design">Fajl sa dizajnom *</Label>
          <Input id="design" name="design" type="file" required accept=".png,.jpg,.jpeg,.svg,.pdf,.ai,.eps,.webp" className="h-auto py-2" />
          <p className="text-xs text-muted-foreground">PNG, JPG, SVG, PDF, AI, EPS — do 20MB.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="desc">Opišite dizajn *</Label>
          <Textarea id="desc" name="design_description" required minLength={10} maxLength={3000} rows={5}
            placeholder="Npr. logo sa tekstom 'Moja pekara', crveno-bele boje, okrugla nalepnica..." />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="shape">Oblik</Label>
          <select id="shape" name="sticker_shape" className={sel}>{shapes.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="mat">Materijal</Label>
          <select id="mat" name="material" className={sel}>{materials.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="w">Širina (cm) *</Label><Input id="w" name="width_cm" type="number" min={1} max={200} step="0.1" defaultValue={5} required /></div>
        <div className="space-y-2"><Label htmlFor="h">Visina (cm) *</Label><Input id="h" name="height_cm" type="number" min={1} max={200} step="0.1" defaultValue={5} required /></div>
        <div className="space-y-2"><Label htmlFor="q">Količina *</Label><Input id="q" name="quantity" type="number" min={1} max={100000} defaultValue={50} required /></div>
      </div>

      <div className="grid gap-5 border-t border-border pt-8 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="name">Ime i prezime *</Label><Input id="name" name="full_name" required minLength={2} maxLength={100} /></div>
        <div className="space-y-2"><Label htmlFor="email">Email *</Label><Input id="email" name="email" type="email" required maxLength={255} /></div>
        <div className="space-y-2"><Label htmlFor="phone">Telefon</Label><Input id="phone" name="phone" maxLength={30} /></div>
        <div className="space-y-2"><Label htmlFor="addr">Adresa za dostavu</Label><Input id="addr" name="address" maxLength={300} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="note">Napomena</Label><Textarea id="note" name="note" maxLength={2000} rows={3} /></div>
      </div>

      <button disabled={loading} className="w-full rounded-full bg-ink py-4 font-display font-bold text-ink-foreground transition hover:opacity-90 disabled:opacity-50">
        {loading ? "Šaljem..." : "Pošalji porudžbinu"}
      </button>
    </form>
  );
}
