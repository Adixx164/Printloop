import { useState } from "react";
import { toast } from "sonner";
import {
  useGetAdminKiosksQuery,
  useCreateKioskMutation,
  useUpdateKioskMutation,
  useUpdateKioskStatusMutation,
  useDeleteKioskMutation,
  useRegenerateKioskKeyMutation,
  useTestKioskConnectionMutation,
} from "@/store/services/adminApi";

const STATUS_COLOURS: Record<string, string> = {
  ACTIVE: "bg-emerald-600 text-gray-50",
  OFFLINE: "bg-indigo-600 text-gray-50",
  MAINTENANCE: "bg-amber-500 text-gray-50",
  DISABLED: "bg-gray-900/30 text-gray-50",
};

const STATUS_CYCLE = ["ACTIVE", "MAINTENANCE", "OFFLINE"];

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`pl-pill text-[10px] font-bold uppercase ${
        STATUS_COLOURS[status] ?? "bg-gray-900/10 text-gray-900"
      }`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
          status === "ACTIVE" ? "animate-pulse" : ""
        } bg-current opacity-70`}
      />
      {status}
    </span>
  );
}

export default function PrintersTab({ canManage }: { canManage: boolean }) {
  const [filterStatus, setFilterStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    location: "",
    campus: "",
    ipAddress: "",
    printerModel: "",
    notes: "",
    mapsUrl: "",
    isPublic: true,
  });

  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const { data, isLoading, refetch } = useGetAdminKiosksQuery({ status: filterStatus });
  const [createKiosk, { isLoading: creating }] = useCreateKioskMutation();
  const [updateKiosk] = useUpdateKioskMutation();
  const [updateStatus] = useUpdateKioskStatusMutation();
  const [deleteKiosk] = useDeleteKioskMutation();
  const [regenerateKey] = useRegenerateKioskKeyMutation();
  const [testKioskConnection, { isLoading: testing }] = useTestKioskConnectionMutation();

  const copyKey = (key: string) =>
    navigator.clipboard.writeText(key).then(
      () => toast.success("API key copied."),
      () => toast.error("Copy failed — select and copy manually.")
    );

  const handleRegenerate = async (id: string, name: string) => {
    if (
      !confirm(
        `Regenerate the API key for "${name}"?\n\nThe old key stops working immediately — you must re-pair that kiosk with the new key.`
      )
    )
      return;
    try {
      const r: any = await regenerateKey(id).unwrap();
      const key = r?.data?.kiosk?.apiKey || r?.data?.apiKey;
      if (key) {
        setRevealed({ name, key });
        toast.success("New key generated.");
      } else {
        toast.error("No key returned.");
      }
    } catch {
      toast.error("Failed to regenerate key");
    }
  };

  const kiosks: any[] = data?.kiosks || [];

  const handleStatusChange = async (id: string, current: string) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    try {
      await updateStatus({ id, status: next }).unwrap();
      toast.success(`Kiosk set to ${next}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Disable "${name}"? (soft delete)`)) return;
    try {
      await deleteKiosk(id).unwrap();
      toast.success(`${name} disabled.`);
    } catch {
      toast.error("Failed to remove kiosk");
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      // Empty strings are not "intent to unset" — strip them so the
      // server doesn't store empty mapsUrl/etc.
      const payload: Record<string, any> = {
        name: form.name,
        isPublic: form.isPublic,
      };
      (["location", "campus", "ipAddress", "printerModel", "notes", "mapsUrl"] as const).forEach((k) => {
        const v = form[k]?.trim?.();
        if (v) payload[k] = v;
      });
      const r: any = await createKiosk(payload).unwrap();
      const key = r?.data?.kiosk?.apiKey || r?.data?.apiKey;
      const name = form.name;
      toast.success(`${name} added — and live on the customer Stations page.`);
      setForm({
        name: "", location: "", campus: "", ipAddress: "",
        printerModel: "", notes: "", mapsUrl: "", isPublic: true,
      });
      setShowAdd(false);
      if (key) setRevealed({ name, key });
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to create kiosk");
    }
  };

  const handleTestConnection = async (id: string, name: string) => {
    try {
      const r: any = await testKioskConnection(id).unwrap();
      const ok = r?.data?.ok;
      const msg = r?.data?.message || (ok ? "Reachable" : "Not reachable");
      setPingResult((p) => ({ ...p, [id]: { ok, message: msg } }));
      ok ? toast.success(`${name}: ${msg}`) : toast.error(`${name}: ${msg}`);
    } catch (err: any) {
      const msg = err?.data?.message || "Test failed";
      setPingResult((p) => ({ ...p, [id]: { ok: false, message: msg } }));
      toast.error(`${name}: ${msg}`);
    }
  };

  const handleTogglePublic = async (id: string, name: string, next: boolean) => {
    try {
      await updateKiosk({ id, isPublic: next }).unwrap();
      toast.success(`${name} is now ${next ? "visible" : "hidden"} on customer Stations.`);
    } catch {
      toast.error("Failed to change visibility");
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-indigo-600 mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-gray-900 mb-1">Printers & Kiosks</h1>
          <p className="pl-serif italic text-gray-50/60">
            Manage the physical printer fleet and monitor status.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="pl-btn bg-emerald-600 text-gray-50 border-emerald-600 hover:bg-gray-900 hover:border-gray-900"
          >
            {showAdd ? "CANCEL" : "+ ADD KIOSK"}
          </button>
        )}
      </div>

      {revealed && (
        <div className="border-2 border-amber-500 bg-amber-500/10 p-5">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <div className="editorial-label text-amber-500 mb-1">
                KIOSK API KEY — {revealed.name}
              </div>
              <p className="pl-serif italic text-gray-50/70 text-sm mb-3">
                Copy this now and paste it into that kiosk's setup screen. For security it
                is <strong>shown only once</strong> — if you lose it, use “Regen Key”.
              </p>
              <code className="block bg-gray-900 text-gray-50 px-4 py-2.5 pl-mono text-sm break-all select-all">
                {revealed.key}
              </code>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copyKey(revealed.key)}
                className="pl-btn bg-gray-900 text-gray-50 border-gray-900"
              >
                COPY KEY
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="pl-btn-ghost text-xs px-3 py-2"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="border-2 border-emerald-600 p-5 bg-emerald-600/5 space-y-3">
          <div className="editorial-label text-emerald-600 mb-2">REGISTER NEW KIOSK</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="editorial-label text-[11px] block mb-1">STATION NAME *</label>
              <input
                className="pl-input"
                placeholder="Yaba Central"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">LOCATION</label>
              <input
                className="pl-input"
                placeholder="Yaba, Lagos"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">CAMPUS</label>
              <input
                className="pl-input"
                placeholder="UNILAG"
                value={form.campus}
                onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">IP ADDRESS</label>
              <input
                className="pl-input pl-mono"
                placeholder="192.168.1.100"
                value={form.ipAddress}
                onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">PRINTER MODEL</label>
              <input
                className="pl-input"
                placeholder="HP LaserJet Pro M404n"
                value={form.printerModel}
                onChange={(e) => setForm((f) => ({ ...f, printerModel: e.target.value }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">NOTES</label>
              <input
                className="pl-input"
                placeholder="Optional internal notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="editorial-label text-[11px] block mb-1">
                MAPS URL <span className="text-gray-500 normal-case italic">— pasteable Google Maps / Apple Maps share link; shown on the customer Stations page as “Directions →”</span>
              </label>
              <input
                className="pl-input"
                placeholder="https://maps.google.com/?q=..."
                value={form.mapsUrl}
                onChange={(e) => setForm((f) => ({ ...f, mapsUrl: e.target.value }))}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="kiosk-is-public"
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
                className="accent-sage w-4 h-4"
              />
              <label htmlFor="kiosk-is-public" className="text-xs text-gray-900 cursor-pointer">
                <strong>Show on the customer Stations page.</strong>{" "}
                <span className="text-gray-500">
                  Uncheck if you're still commissioning this kiosk.
                </span>
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="pl-btn bg-emerald-600 text-gray-50 border-emerald-600"
          >
            {creating ? "ADDING..." : "ADD KIOSK →"}
          </button>
        </form>
      )}

      <div className="flex gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="pl-input"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="OFFLINE">Offline</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <button onClick={() => refetch()} className="pl-btn-ghost text-xs px-3 py-2">
          ↻ REFRESH
        </button>
      </div>

      <div className="grid grid-cols-3 border-2 border-gray-900">
        {[
          { label: "TOTAL KIOSKS", value: kiosks.length },
          { label: "ACTIVE", value: kiosks.filter((k) => k.status === "ACTIVE").length },
          {
            label: "OFFLINE / MAINT.",
            value: kiosks.filter((k) => k.status !== "ACTIVE").length,
          },
        ].map((s, i) => (
          <div key={s.label} className={`p-4 ${i > 0 ? "border-l-2 border-gray-900" : ""}`}>
            <div className="editorial-label text-gray-50/50 mb-1">{s.label}</div>
            <div className="pl-mono text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center italic opacity-50 py-12">Loading kiosks…</div>
      ) : (
        <div className="border-2 border-gray-900 overflow-hidden">
          <div className="bg-gray-900 text-gray-50 px-5 py-3">
            <div className="editorial-label">KIOSK FLEET — {kiosks.length} STATIONS</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-900/20 bg-gray-900/5 text-gray-50/70">
                  <th className="p-3 font-semibold">Station</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Campus</th>
                  <th className="p-3 font-semibold">IP / Maps</th>
                  <th className="p-3 font-semibold text-right">Jobs</th>
                  <th className="p-3 font-semibold text-right">Pages</th>
                  <th className="p-3 font-semibold">Last Seen</th>
                  {canManage && <th className="p-3 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {kiosks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                      No kiosks found.
                    </td>
                  </tr>
                )}
                {kiosks.map((k) => {
                  const ping = pingResult[k.id];
                  return (
                  <tr
                    key={k.id}
                    className="border-b border-gray-900/10 last:border-0 hover:bg-gray-900/5 transition-colors align-top"
                  >
                    <td className="p-3">
                      <div className="font-bold text-gray-900">{k.name}</div>
                      <div className="text-xs text-gray-500">{k.location || "—"}</div>
                      {!k.isPublic && (
                        <span className="pl-pill text-[10px] bg-gray-900/10 text-gray-900 mt-1 inline-block">
                          HIDDEN
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={k.status} />
                      {ping && (
                        <div className={`mt-1 text-[10px] font-bold ${ping.ok ? "text-emerald-600" : "text-indigo-600"}`}>
                          {ping.ok ? "● REACHABLE" : "● UNREACHABLE"}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-500">{k.campus || "—"}</td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      <div className="pl-mono text-gray-900">{k.ipAddress || "—"}</div>
                      {k.mapsUrl ? (
                        <a
                          href={k.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-emerald-600 hover:underline"
                        >
                          MAP LINK ↗
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-500 italic">No map link</span>
                      )}
                    </td>
                    <td className="p-3 pl-mono font-bold text-right">
                      {k.totalJobsPrinted ?? "—"}
                    </td>
                    <td className="p-3 pl-mono font-bold text-right">
                      {k.totalPagesPrinted ?? "—"}
                    </td>
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {k.lastSeenAt ? new Date(k.lastSeenAt).toLocaleString() : "—"}
                    </td>
                    {canManage && (
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-3 flex-wrap">
                          <button
                            onClick={() => handleTestConnection(k.id, k.name)}
                            disabled={testing}
                            className="text-xs text-emerald-600 font-bold hover:underline disabled:opacity-50"
                          >
                            {testing ? "TESTING…" : "TEST"}
                          </button>
                          <button
                            onClick={() => handleTogglePublic(k.id, k.name, !k.isPublic)}
                            className="text-xs text-gray-900 font-bold hover:underline"
                            title={k.isPublic ? "Hide from customer Stations page" : "Show on customer Stations page"}
                          >
                            {k.isPublic ? "HIDE" : "SHOW"}
                          </button>
                          <button
                            onClick={() => handleStatusChange(k.id, k.status)}
                            className="text-xs text-emerald-600 font-bold hover:underline"
                          >
                            CYCLE
                          </button>
                          <button
                            onClick={() => handleRegenerate(k.id, k.name)}
                            className="text-xs text-amber-500 font-bold hover:underline"
                          >
                            REGEN KEY
                          </button>
                          <button
                            onClick={() => handleDelete(k.id, k.name)}
                            className="text-xs text-indigo-600 font-bold hover:underline"
                          >
                            DISABLE
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
