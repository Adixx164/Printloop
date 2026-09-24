import { useState } from "react";
import { toast } from "sonner";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { Reveal } from "@/components/ui/scrollFx";

/**
 * Marketing Contact page (V2-54). No backend endpoint needed: the
 * form composes a mailto: message and the details list the real
 * channels. Swap in a contact API later if needed.
 */

const CHANNELS = [
  { k: "EMAIL", v: "support@printloop.ng", href: "mailto:support@printloop.ng" },
  { k: "WHATSAPP", v: "+234 800 000 0000", href: "https://wa.me/2348000000000" },
  { k: "SHOPS", v: "Start a shop → /saas/signup", href: "/saas/signup" },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Fill in every field — we can't reply to half a message.");
      return;
    }
    const subject = encodeURIComponent(`PrintLoop message from ${form.name}`);
    const body = encodeURIComponent(`${form.message}\n\n— ${form.name} (${form.email})`);
    window.location.href = `mailto:support@printloop.ng?subject=${subject}&body=${body}`;
    toast.success("Opening your mail app…");
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <PublicHeader />
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <Reveal variant="rise">
            <div className="editorial-label text-persimmon mb-3">▸ CONTACT</div>
            <h1 className="pl-serif font-extrabold text-[38px] leading-[1.02] sm:text-[54px] sm:leading-[0.98] tracking-tight mb-5 max-w-3xl">
              Talk to a <em className="italic text-persimmon font-semibold">human.</em>
            </h1>
            <p className="pl-serif italic text-ink/60 text-sm sm:text-base max-w-2xl mb-10">
              Questions, lost codes, shop partnerships — we reply within one business day.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Reveal variant="rise">
              <form onSubmit={submit} className="border-4 border-ink bg-paper-light p-6 sm:p-8 space-y-4">
                <div>
                  <label className="editorial-label block mb-1.5">YOUR NAME</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Amina Bello"
                    className="pl-input"
                  />
                </div>
                <div>
                  <label className="editorial-label block mb-1.5">EMAIL</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@university.edu.ng"
                    className="pl-input"
                  />
                </div>
                <div>
                  <label className="editorial-label block mb-1.5">MESSAGE</label>
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="What's on your mind?"
                    className="pl-input resize-y"
                  />
                </div>
                <button type="submit" className="pl-btn-primary w-full py-3 text-sm font-bold">
                  SEND MESSAGE →
                </button>
              </form>
            </Reveal>

            <Reveal variant="rise">
              <div className="space-y-4">
                {CHANNELS.map((c) => (
                  <a
                    key={c.k}
                    href={c.href}
                    className="block border-4 border-ink bg-paper p-5 transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#1A1410]"
                  >
                    <div className="editorial-label text-persimmon mb-1">{c.k}</div>
                    <div className="font-bold text-lg pl-serif">{c.v}</div>
                  </a>
                ))}
                <div className="border-4 border-ink bg-ink text-paper p-5">
                  <div className="editorial-label text-persimmon mb-1">HOURS</div>
                  <div className="pl-mono text-sm text-paper/80">
                    MON–SAT · 08:00–20:00 WAT
                  </div>
                  <div className="text-[11px] text-paper/50 mt-2">
                    Kiosks run on their own shop hours — the app shows live station status.
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <EditorialFooter />
    </div>
  );
}
