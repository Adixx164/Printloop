import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CONFIG } from "@/constants/config";
import QrBlock from "@/components/ui/QrBlock";
import {
  useListKiosksQuery,
  useCreateKioskMutation,
  useUpdateKioskStatusMutation,
  useRegenerateKioskKeyMutation,
  useMarkKioskTestPrintMutation,
  useDeleteKioskMutation,
  type OperatorKiosk,
} from "@/store/services/saasApi";

/**
 * `/saas/operator/printers` — self-service printer/kiosk management
 * (V2-39, the turnkey console). Shop owners add/remove printers, confirm
 * a test print, and pair the kiosk PC by scanning a QR — no support
 * ticket, no PowerShell config typing. Mirrors what EFI's M600 does at
 * onboarding, but in a web console.
 */

// The cloud base URL the on-site agent should poll. Derived from the
// configured API base; the agent appends /api/agent/* itself.
function cloudBaseUrl(): string {
  try {
    const u = new URL(CONFIG.apiBaseUrl, window.location.origin);
    return u.origin;
  } catch {
    return window.location.origin;
  }
}

/** Pairing payload the kiosk installer scans. */
function pairingPayload(kioskId: string, apiKey: string): string {
  const base = cloudBaseUrl();
  return `printloop://pair?base=${encodeURIComponent(base)}&kiosk=${encodeURIComponent(
    kioskId,
  )}&key=${encodeURIComponent(apiKey)}`;
}

export default function OperatorPrintersPage() {
  const { data: kiosks, isLoading, isError } = useListKiosksQuery();
  const [createKiosk, createState] = useCreateKioskMutation();
  const [setStatus] = useUpdateKioskStatusMutation();
  const [regen, regenState] = useRegenerateKioskKeyMutation();
  const [markTest] = useMarkKioskTestPrintMutation();
  const [del] = useDeleteKioskMutation();

  const [form, setForm] = useState({ name: "", location: "", printerName: "" });
  // Pairing modal: { kioskId, apiKey } — apiKey only known right after
  // create / regenerate (the API never re-discloses it).
  const [pairing, setPairing] = useState<{
    id: string;
    name: string;
    apiKey: string;
  } | null>(null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      const k = await createKiosk({
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        printerName: form.printerName.trim() || undefined,
      }).unwrap();
      setForm({ name: "", location: "", printerName: "" });
      setPairing({ id: k.id, name: k.name, apiKey: k.apiKey });
      toast.success("Printer added — scan the QR on the kiosk PC to pair.");
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not add printer.");
    }
  };

  const onRepair = async (k: OperatorKiosk) => {
    try {
      const r = await regen({ id: k.id }).unwrap();
      setPairing({ id: k.id, name: k.name, apiKey: r.apiKey });
      toast.message("New pairing key issued — the old one stops working.");
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not regenerate key.");
    }
  };

  const onTestPass = async (k: OperatorKiosk) => {
    try {
      await markTest({ id: k.id }).unwrap();
      toast.success(`Test print confirmed for ${k.name}.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not mark test print.");
    }
  };

  const onToggle = async (k: OperatorKiosk) => {
    const next = k.status === "ACTIVE" ? "OFFLINE" : "ACTIVE";
    try {
      await setStatus({ id: k.id, status: next }).unwrap();
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not change status.");
    }
  };

  const onDelete = async (k: OperatorKiosk) => {
    if (!window.confirm(`Remove ${k.name}? This can't be undone.`)) return;
    try {
      await del({ id: k.id }).unwrap();
      toast.success("Printer removed.");
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not remove printer.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="editorial-label text-persimmon mb-1">▸ PRINTERS</div>
          <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
            Your printers
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Add a printer, pair the kiosk PC by QR, confirm a test print.
          </p>
        </div>
        <Link
          to="/saas/operator"
          className="text-sm font-bold text-persimmon border-b-2 border-persimmon whitespace-nowrap"
        >
          ← Console
        </Link>
      </div>

      {/* Add printer */}
      <form
        onSubmit={onCreate}
        className="border-2 border-ink rounded-pl p-4 sm:p-5 bg-paper-light space-y-3"
      >
        <h2 className="pl-serif font-extrabold text-xl">Add a printer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">
              Name
            </label>
            <input
              className="pl-input"
              placeholder="Front desk LaserJet"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">
              Location (optional)
            </label>
            <input
              className="pl-input"
              placeholder="Counter / back room"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">
              Printer queue (optional)
            </label>
            <input
              className="pl-input"
              placeholder="HP_LaserJet_Pro"
              value={form.printerName}
              onChange={(e) => setForm({ ...form, printerName: e.target.value })}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={createState.isLoading || !form.name.trim()}
          className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createState.isLoading ? "Adding…" : "Add printer + get pairing QR"}
        </button>
      </form>

      {/* Printer list */}
      <div className="space-y-3">
        {isLoading && (
          <p className="text-fog text-sm pl-serif italic">Loading printers…</p>
        )}
        {isError && (
          <p className="text-persimmon text-sm font-semibold">
            Could not load printers.
          </p>
        )}
        {kiosks && kiosks.length === 0 && !isLoading && (
          <div className="border-2 border-dashed border-ink/40 rounded-pl p-8 text-center">
            <p className="pl-serif italic text-ink/60">
              No printers yet. Add your first one above to go live.
            </p>
          </div>
        )}
        {kiosks?.map((k) => (
          <KioskRow
            key={k.id}
            k={k}
            onTestPass={() => onTestPass(k)}
            onRepair={() => onRepair(k)}
            onToggle={() => onToggle(k)}
            onDelete={() => onDelete(k)}
            repairBusy={regenState.isLoading}
          />
        ))}
      </div>

      {/* Pairing modal */}
      {pairing && (
        <PairingModal
          name={pairing.name}
          payload={pairingPayload(pairing.id, pairing.apiKey)}
          apiKey={pairing.apiKey}
          baseUrl={cloudBaseUrl()}
          onClose={() => setPairing(null)}
        />
      )}
    </div>
  );
}

function KioskRow({
  k,
  onTestPass,
  onRepair,
  onToggle,
  onDelete,
  repairBusy,
}: {
  k: OperatorKiosk;
  onTestPass: () => void;
  onRepair: () => void;
  onToggle: () => void;
  onDelete: () => void;
  repairBusy: boolean;
}) {
  return (
    <div className="border-2 border-ink rounded-pl p-4 bg-paper-light">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{k.name}</span>
            <OnlinePill online={k.online} status={k.status} />
            {k.testPrintPassedAt ? (
              <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-sage/20 text-sage">
                test print ✓
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-ochre/20 text-ochre">
                test pending
              </span>
            )}
          </div>
          <div className="text-xs text-ink/50 mt-1 font-mono">
            {[k.location, k.printerName].filter(Boolean).join(" · ") || "—"}
            {k.lastSeenAt && (
              <> · last seen {new Date(k.lastSeenAt).toLocaleString()}</>
            )}
          </div>
          {/* V2-44: hardware truth, auto-discovered over IPP by the
              agent. Only shown once the agent has reported (null =
              unknown = say nothing rather than guess). */}
          {(k.capColor != null || k.capDuplex != null || k.capA3 != null) && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {k.capColor != null && (
                <span className={`px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial ${k.capColor ? "bg-persimmon/15 text-persimmon" : "bg-ink/10 text-ink/50"}`}>
                  {k.capColor ? "colour" : "b&w only"}
                </span>
              )}
              {k.capDuplex != null && k.capDuplex && (
                <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-sage/20 text-sage">
                  duplex
                </span>
              )}
              {k.capA3 != null && k.capA3 && (
                <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-ochre/20 text-ochre">
                  a3
                </span>
              )}
              <span className="text-[10px] text-ink/35 font-mono">auto-detected</span>
            </div>
          )}
          <div className="text-xs text-ink/40 mt-0.5">
            {k.totalJobsPrinted} jobs printed
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!k.testPrintPassedAt && (
            <button
              onClick={onTestPass}
              className="pl-btn-ghost !px-3 !py-1.5 !text-xs"
            >
              Confirm test print
            </button>
          )}
          <button
            onClick={onRepair}
            disabled={repairBusy}
            className="pl-btn-dark !px-3 !py-1.5 !text-xs disabled:opacity-50"
          >
            Pairing QR
          </button>
          <button
            onClick={onToggle}
            className="text-sm font-bold text-persimmon"
          >
            {k.status === "ACTIVE" ? "Pause" : "Activate"}
          </button>
          <button onClick={onDelete} className="text-sm font-bold text-persimmon">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlinePill({ online, status }: { online: boolean; status: string }) {
  if (online) {
    return (
      <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-sage/20 text-sage">
        online
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-ink/10 text-ink/50">
      {status === "ACTIVE" ? "offline" : status.toLowerCase()}
    </span>
  );
}

function PairingModal({
  name,
  payload,
  apiKey,
  baseUrl,
  onClose,
}: {
  name: string;
  payload: string;
  apiKey: string;
  baseUrl: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper border-2 border-ink rounded-pl-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editorial-label text-persimmon mb-1">▸ PAIR THE KIOSK PC</div>
        <h3 className="pl-serif font-extrabold text-2xl tracking-tight mb-1">
          {name}
        </h3>
        <p className="text-sm text-ink/60 mb-4">
          On the kiosk PC, open the PrintLoop installer and scan this QR — it
          carries the cloud address and this printer's pairing key. No typing.
        </p>

        <div className="flex justify-center mb-4">
          <QrBlock value={payload} label="SCAN ON THE KIOSK PC" fileName={`printloop-pair-${name}`} />
        </div>

        <details className="mb-4">
          <summary className="text-xs font-bold uppercase tracking-wider cursor-pointer text-ink/60">
            Can't scan? Enter manually
          </summary>
          <div className="mt-2 space-y-1 font-mono text-xs">
            <div className="bg-paper-warm border-2 border-ink rounded-pl-sm p-2 break-all">
              <span className="text-ink/40">cloud </span>
              {baseUrl}
            </div>
            <div className="bg-paper-warm border-2 border-ink rounded-pl-sm p-2 break-all">
              <span className="text-ink/40">key </span>
              {apiKey}
            </div>
          </div>
        </details>

        <p className="text-[11px] text-ochre font-semibold mb-4">
          This key won't be shown again. Pair the kiosk now, or hit "Pairing QR"
          later to issue a fresh one.
        </p>

        <button onClick={onClose} className="pl-btn-primary w-full">
          Done
        </button>
      </div>
    </div>
  );
}
