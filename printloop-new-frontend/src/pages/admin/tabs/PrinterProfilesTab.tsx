import { useState } from "react";
import { toast } from "sonner";
import {
  useGetPrinterProfilesQuery,
  useCreatePrinterProfileMutation,
  useUpdatePrinterProfileMutation,
  useDeletePrinterProfileMutation,
} from "@/store/services/adminApi";

/**
 * Admin printer profiles (V2-56). Each profile declares what a
 * physical printer can do (DPI cap, mono-or-colour, paper size,
 * duplex). The tenant's DEFAULT profile drives cloud renders — the
 * worker rasterizes at the machine's capability, never above it.
 */

const DRIVERS = ["unknown", "hplip", "gutenprint", "ps", "gs", "retrofit"];
const DPIS = [100, 300, 600];
const PAPERS = ["A4", "A3", "LETTER", "LEGAL"];

const EMPTY = {
  displayName: "",
  ippUri: "",
  driverKind: "unknown",
  maxDpi: 300,
  colorMode: "color" as "bw" | "color",
  paperSize: "A4" as "A4" | "A3" | "LETTER" | "LEGAL" | "",
  duplex: true,
  isDefault: false,
};

function capsSummary(p: any): string {
  const c = p?.capabilities || {};
  return `${c.maxDpi ?? "?"}dpi · ${c.colorMode === "bw" ? "mono only" : "colour"} · ${
    c.paperSize || "auto"
  } · ${c.duplex ? "duplex" : "simplex"}`;
}

export default function PrinterProfilesTab({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useGetPrinterProfilesQuery();
  const [createProfile, { isLoading: creating }] = useCreatePrinterProfileMutation();
  const [updateProfile] = useUpdatePrinterProfileMutation();
  const [deleteProfile] = useDeletePrinterProfileMutation();

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const profiles: any[] = data || [];

  const resetForm = () => {
    setForm({ ...EMPTY });
    setEditing(null);
  };

  const openEdit = (p: any) => {
    setEditing(p.id);
    setForm({
      displayName: p.displayName || "",
      ippUri: p.ippUri || "",
      driverKind: p.driverKind || "unknown",
      maxDpi: p.capabilities?.maxDpi ?? 300,
      colorMode: p.capabilities?.colorMode ?? "color",
      paperSize: p.capabilities?.paperSize || "",
      duplex: p.capabilities?.duplex ?? true,
      isDefault: !!p.isDefault,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.displayName.trim()) {
      toast.error("Give the printer a name.");
      return;
    }
    const body = {
      displayName: form.displayName,
      ippUri: form.ippUri || null,
      driverKind: form.driverKind,
      isDefault: form.isDefault,
      capabilities: {
        maxDpi: form.maxDpi,
        colorMode: form.colorMode,
        paperSize: form.paperSize || null,
        duplex: form.duplex,
      },
    };
    try {
      if (editing) {
        await updateProfile({ id: editing, ...body }).unwrap();
        toast.success("Printer profile updated.");
      } else {
        await createProfile(body).unwrap();
        toast.success("Printer profile created.");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save printer profile");
    }
  };

  const toggleDefault = async (p: any) => {
    try {
      await updateProfile({ id: p.id, isDefault: !p.isDefault }).unwrap();
      toast.success(!p.isDefault ? `"${p.displayName}" is now the render default.` : "Default cleared.");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to update");
    }
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`Delete "${p.displayName}"? Jobs without a pinned profile will fall back to the shop default.`)) return;
    try {
      await deleteProfile(p.id).unwrap();
      toast.success("Printer profile deleted.");
      if (editing === p.id) resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete");
    }
  };

  const inputCls = "pl-input";

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Printer Profiles</h1>
          <p className="pl-serif italic text-ink/60">
            What your printers can actually do. Cloud renders rasterize at the
            <span className="font-bold"> default profile's</span> capability — never above it.
          </p>
        </div>
        {canManage && !editing && (
          <button onClick={resetForm} className="pl-btn-primary px-4 py-2 text-xs font-bold">
            + ADD PRINTER
          </button>
        )}
      </div>

      {(editing || (canManage && !isLoading && !profiles.length)) && (
        <form onSubmit={handleSave} className="border-4 border-ink bg-paper-light p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="editorial-label text-persimmon">
              {editing ? "EDIT PRINTER" : "NEW PRINTER"}
            </span>
            {editing && (
              <button type="button" onClick={resetForm} className="text-xs font-bold text-ink/55 hover:text-persimmon">
                CANCEL ✕
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Display name — e.g. Front HP LaserJet"
              className={inputCls}
            />
            <input
              value={form.ippUri}
              onChange={(e) => setForm({ ...form, ippUri: e.target.value })}
              placeholder="IPP URI (optional) — e.g. ipp://localhost:60000/ipp/print"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="editorial-label block mb-1">MAX DPI</span>
              <select
                value={form.maxDpi}
                onChange={(e) => setForm({ ...form, maxDpi: Number(e.target.value) as 100 | 300 | 600 })}
                className={inputCls}
              >
                {DPIS.map((d) => <option key={d} value={d}>{d} dpi</option>)}
              </select>
            </label>
            <label className="block">
              <span className="editorial-label block mb-1">COLOUR</span>
              <select
                value={form.colorMode}
                onChange={(e) => setForm({ ...form, colorMode: e.target.value as "bw" | "color" })}
                className={inputCls}
              >
                <option value="color">Colour capable</option>
                <option value="bw">Mono only</option>
              </select>
            </label>
            <label className="block">
              <span className="editorial-label block mb-1">PAPER</span>
              <select
                value={form.paperSize}
                onChange={(e) => setForm({ ...form, paperSize: e.target.value as any })}
                className={inputCls}
              >
                <option value="">Auto (keep page size)</option>
                {PAPERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="editorial-label block mb-1">DRIVER</span>
              <select
                value={form.driverKind}
                onChange={(e) => setForm({ ...form, driverKind: e.target.value })}
                className={inputCls}
              >
                {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={form.duplex}
                onChange={(e) => setForm({ ...form, duplex: e.target.checked })}
                className="w-4 h-4 accent-persimmon"
              />
              Duplex capable
            </label>
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="w-4 h-4 accent-persimmon"
              />
              Default for cloud renders
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="submit" className="pl-btn-primary px-4 py-2 text-xs font-bold" disabled={creating}>
              {editing ? "SAVE CHANGES" : "ADD PRINTER"} →
            </button>
          </div>
        </form>
      )}

      <div className="border-2 border-ink overflow-hidden">
        <div className="bg-ink text-paper px-5 py-3">
          <div className="editorial-label">
            {isLoading ? "LOADING…" : `PRINTERS — ${profiles.length} TOTAL`}
          </div>
        </div>
        <div className="overflow-x-auto bg-paper-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
                <th className="p-3 font-semibold">Printer</th>
                <th className="p-3 font-semibold">Capabilities</th>
                <th className="p-3 font-semibold">Driver</th>
                <th className="p-3 font-semibold">Default</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && profiles.length === 0 && !editing && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-fog italic">
                    No printer profiles yet{canManage ? " — add your first printer." : "."}
                  </td>
                </tr>
              )}
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-ink/10 last:border-0 hover:bg-ink/5">
                  <td className="p-3">
                    <div className="font-bold text-xs">{p.displayName}</div>
                    <div className="text-[11px] text-fog pl-mono mt-0.5">{p.ippUri || "no IPP URI"}</div>
                  </td>
                  <td className="p-3 text-xs text-ink/70">{capsSummary(p)}</td>
                  <td className="p-3 text-xs text-fog uppercase">{p.driverKind}</td>
                  <td className="p-3">
                    {p.isDefault ? (
                      <span className="pl-pill text-[10px] font-bold uppercase bg-persimmon/15 text-persimmon border border-persimmon/30">
                        RENDER DEFAULT
                      </span>
                    ) : (
                      <span className="text-fog text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {canManage && (
                      <>
                        <button onClick={() => toggleDefault(p)} className="text-xs font-bold text-ochre hover:underline mr-3">
                          {p.isDefault ? "CLEAR DEFAULT" : "MAKE DEFAULT"}
                        </button>
                        <button onClick={() => openEdit(p)} className="text-xs font-bold text-ink hover:underline mr-3">
                          EDIT
                        </button>
                        <button onClick={() => handleDelete(p)} className="text-xs font-bold text-persimmon hover:underline">
                          DELETE
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
