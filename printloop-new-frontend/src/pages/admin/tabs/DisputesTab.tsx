import { useState } from "react";
import { toast } from "sonner";
import { useGetAdminDisputesQuery, useResolveDisputeMutation } from "@/store/services/adminApi";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-ochre/15 text-ochre border border-ochre/30",
  resolved: "bg-sage/15 text-sage border border-sage/30",
  rejected: "bg-persimmon/15 text-persimmon border border-persimmon/30",
};

export default function DisputesTab({ canResolve }: { canResolve: boolean }) {
  const { data, isLoading, refetch } = useGetAdminDisputesQuery();
  const [resolveDispute, { isLoading: isResolving }] = useResolveDisputeMutation();

  const [notes, setNotes] = useState("");
  const [activeDisputeId, setActiveDisputeId] = useState<string | null>(null);

  const disputes: any[] = data || [];

  const handleResolve = async (id: string, status: "resolved" | "rejected") => {
    if (!notes.trim()) {
      toast.error("Please provide resolution notes first.");
      return;
    }

    try {
      await resolveDispute({
        id,
        status,
        resolutionNotes: notes,
      }).unwrap();

      toast.success(`Dispute successfully marked as ${status}.`);
      setActiveDisputeId(null);
      setNotes("");
      refetch();
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to resolve dispute");
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Disputes Queue</h1>
        <p className="pl-serif italic text-ink/60">
          Manage and resolve customer complaints.
        </p>
      </div>

      <div className="border-2 border-ink overflow-hidden">
        <div className="bg-ink text-paper px-5 py-3">
          <div className="editorial-label">
            {isLoading ? "LOADING…" : `DISPUTES — ${disputes.length} TOTAL`}
          </div>
        </div>
        <div className="overflow-x-auto bg-paper-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
                <th className="p-3 font-semibold">User</th>
                <th className="p-3 font-semibold">Print Job</th>
                <th className="p-3 font-semibold">Reason for Dispute</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold whitespace-nowrap">Filed At</th>
                <th className="p-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-fog italic">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && disputes.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-fog italic">
                    No disputes filed yet.
                  </td>
                </tr>
              )}
              {disputes.map((d) => {
                const u = d.user || {};
                const j = d.printJob || {};
                const isPending = d.status === "pending";

                return (
                  <tr
                    key={d.id}
                    className="border-b border-ink/10 last:border-0 hover:bg-ink/5"
                  >
                    <td className="p-3">
                      <div className="font-bold text-ink text-xs">
                        {u.firstName ? `${u.firstName} ${u.lastName}` : "Anonymous"}
                      </div>
                      <div className="text-xs text-fog">{u.email}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-xs text-ink">{j.fileName || "document"}</div>
                      <div className="text-xs text-fog">
                        Code: <span className="font-mono">{j.code || "—"}</span> · ₦{Number(j.cost || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-fog max-w-xs break-words">
                      {d.reason}
                    </td>
                    <td className="p-3">
                      <span
                        className={`pl-pill text-[10px] font-bold uppercase ${
                          STATUS_STYLES[d.status] || "bg-ink/10"
                        }`}
                      >
                        {d.status}
                      </span>
                      {d.resolutionNotes && (
                        <div className="text-[10px] text-fog mt-1 italic">
                          Notes: {d.resolutionNotes}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-fog whitespace-nowrap">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      {canResolve && isPending ? (
                        activeDisputeId === d.id ? (
                          <div className="text-left space-y-3 bg-white p-3 border border-ink rounded max-w-sm ml-auto">
                            <div>
                              <label className="block text-[10px] font-bold text-fog mb-1">RESOLUTION NOTES</label>
                              <textarea
                                rows={2}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Explain why you are approving/rejecting..."
                                className="w-full text-xs p-1.5 border border-ink/30 rounded focus:outline-none"
                              />
                            </div>

                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setActiveDisputeId(null)}
                                className="text-[10px] font-bold border border-ink/35 px-2 py-1 hover:bg-gray-100"
                              >
                                CANCEL
                              </button>
                              <button
                                onClick={() => handleResolve(d.id, "rejected")}
                                disabled={isResolving}
                                className="text-[10px] font-bold text-white bg-persimmon px-2 py-1 hover:opacity-90"
                              >
                                REJECT
                              </button>
                              <button
                                onClick={() => handleResolve(d.id, "resolved")}
                                disabled={isResolving}
                                className="text-[10px] font-bold text-white bg-sage px-2 py-1 hover:opacity-90"
                              >
                                RESOLVE
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setActiveDisputeId(d.id);
                              setNotes("");
                            }}
                            className="text-xs text-sage font-bold hover:underline"
                          >
                            RESOLVE
                          </button>
                        )
                      ) : !isPending ? (
                        <span className="text-xs text-fog italic">closed</span>
                      ) : (
                        <span className="text-fog">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
