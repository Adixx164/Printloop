import { useState } from "react";
import { toast } from "sonner";
import {
  useGetPromotionsQuery,
  useCreatePromotionMutation,
  useUpdatePromotionMutation,
} from "@/store/services/adminApi";

const DISCOUNT_TYPES = ["percentage", "fixed", "free_pages"];

export default function PromotionsTab({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useGetPromotionsQuery();
  const [createPromotion, { isLoading: creating }] = useCreatePromotionMutation();
  const [updatePromotion] = useUpdatePromotionMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    discountType: "percentage",
    discountValue: "10",
  });

  const promotions: any[] = data?.promotions || [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    try {
      await createPromotion({
        ...form,
        discountValue: Number(form.discountValue),
        status: "active",
      }).unwrap();
      toast.success(`Promotion "${form.name}" created.`);
      setForm({ code: "", name: "", description: "", discountType: "percentage", discountValue: "10" });
      setShowAdd(false);
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to create promotion");
    }
  };

  const toggleStatus = async (p: any) => {
    const next = p.status === "active" ? "inactive" : "active";
    try {
      await updatePromotion({ id: p.id, status: next }).unwrap();
      toast.success(`"${p.name}" → ${next}`);
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to update");
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Promotions</h1>
          <p className="pl-serif italic text-ink/60">
            Discount rules and campaign credits.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="pl-btn bg-sage text-paper border-sage hover:bg-ink hover:border-ink"
          >
            {showAdd ? "CANCEL" : "+ NEW PROMOTION"}
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="border-2 border-sage p-5 bg-sage/5 space-y-3">
          <div className="editorial-label text-sage mb-2">CREATE PROMOTION</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="editorial-label text-[11px] block mb-1">CODE *</label>
              <input
                className="pl-input pl-mono"
                placeholder="EXAMWEEK"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">NAME *</label>
              <input
                className="pl-input"
                placeholder="Exam week boost"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">DISCOUNT TYPE</label>
              <select
                className="pl-input"
                value={form.discountType}
                onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}
              >
                {DISCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="editorial-label text-[11px] block mb-1">VALUE</label>
              <input
                type="number"
                className="pl-input pl-mono"
                value={form.discountValue}
                onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="editorial-label text-[11px] block mb-1">DESCRIPTION</label>
            <input
              className="pl-input"
              placeholder="20 free pages after 100"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="pl-btn bg-sage text-paper border-sage"
          >
            {creating ? "CREATING..." : "CREATE →"}
          </button>
        </form>
      )}

      <div className="border-2 border-ink overflow-hidden">
        <div className="bg-ink text-paper px-5 py-3">
          <div className="editorial-label">
            {isLoading ? "LOADING…" : `PROMOTIONS — ${promotions.length}`}
          </div>
        </div>
        <div className="overflow-x-auto bg-paper-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
                <th className="p-3 font-semibold">Code</th>
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold text-right">Value</th>
                <th className="p-3 font-semibold text-right">Used</th>
                <th className="p-3 font-semibold">Status</th>
                {canManage && <th className="p-3 font-semibold text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {!isLoading && promotions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-fog italic">
                    No promotions yet.
                  </td>
                </tr>
              )}
              {promotions.map((p) => (
                <tr key={p.id} className="border-b border-ink/10 last:border-0 hover:bg-ink/5">
                  <td className="p-3 pl-mono font-bold">{p.code}</td>
                  <td className="p-3">
                    <div className="font-bold text-ink">{p.name}</div>
                    <div className="text-xs text-fog">{p.description}</div>
                  </td>
                  <td className="p-3 text-xs text-fog">{p.discountType}</td>
                  <td className="p-3 pl-mono text-right">{p.discountValue}</td>
                  <td className="p-3 pl-mono text-right">{p.usageCount}</td>
                  <td className="p-3">
                    <span
                      className={`pl-pill text-[10px] font-bold uppercase ${
                        p.status === "active"
                          ? "bg-sage/15 text-sage border border-sage/30"
                          : "bg-ink/10 text-fog border border-ink/20"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="p-3 text-right">
                      <button
                        onClick={() => toggleStatus(p)}
                        className="text-xs text-sage font-bold hover:underline"
                      >
                        {p.status === "active" ? "DEACTIVATE" : "ACTIVATE"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
