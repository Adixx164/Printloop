import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useGetSettingsQuery, useUpdateSettingMutation } from "@/store/services/adminApi";

const CATEGORY_ORDER = [
  "Storage",
  "Jobs",
  "Printing",
  "Payments",
  "Notifications",
  "Branding",
  "System",
];

/** documentRetentionHours → "Document Retention Hours" */
function labelFromKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export default function OptionsTab({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useGetSettingsQuery();
  const [updateSetting] = useUpdateSettingMutation();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const settings: any[] = data?.settings || [];

  useEffect(() => {
    if (settings.length) {
      const init: Record<string, string> = {};
      settings.forEach((s) => {
        init[s.key] = String(s.value);
      });
      setDrafts(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleChange = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const handleSave = async (s: any) => {
    const raw = drafts[s.key];
    let parsed: string | number | boolean = raw;
    if (s.valueType === "number") parsed = Number(raw);
    if (s.valueType === "boolean") parsed = raw === "true";
    try {
      await updateSetting({ key: s.key, value: parsed }).unwrap();
      setDirty((prev) => {
        const n = new Set(prev);
        n.delete(s.key);
        return n;
      });
      toast.success(`"${labelFromKey(s.key)}" saved.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save");
    }
  };

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = settings.filter((s) => s.category === cat);
    return acc;
  }, {} as Record<string, any[]>);
  const uncategorized = settings.filter((s) => !CATEGORY_ORDER.includes(s.category));
  if (uncategorized.length) grouped["Other"] = uncategorized;

  if (isLoading)
    return <div className="text-center italic opacity-50 py-20">Loading system options…</div>;

  return (
    <div className="max-w-4xl space-y-7">
      <div>
        <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-ink mb-1">System Options</h1>
        <p className="pl-serif italic text-ink/60">
          Configure global system behaviour. Read-only settings are enforced by the platform.
        </p>
      </div>

      {dirty.size > 0 && (
        <div className="border-2 border-ochre bg-ochre/10 px-4 py-3 text-sm font-semibold text-ink">
          ⚠ {dirty.size} unsaved change{dirty.size > 1 ? "s" : ""}. Save each field individually.
        </div>
      )}

      {Object.keys(grouped).map((cat) => {
        const items = grouped[cat] || [];
        if (items.length === 0) return null;
        return (
          <div key={cat} className="border-2 border-ink overflow-hidden">
            <div className="bg-ink text-paper px-5 py-3">
              <div className="editorial-label">{cat.toUpperCase()} SETTINGS</div>
            </div>
            <div className="divide-y-2 divide-ink/10 bg-paper-light">
              {items.map((s) => {
                const isDirty = dirty.has(s.key);
                const currentVal = drafts[s.key] ?? String(s.value);
                const ro = s.isReadOnly || !canManage;
                return (
                  <div key={s.key} className={`p-5 ${s.isReadOnly ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-6 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-ink">{labelFromKey(s.key)}</span>
                          {s.isReadOnly && (
                            <span className="pl-pill bg-ink/10 text-fog text-[10px]">
                              READ-ONLY
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-fog leading-relaxed">{s.description}</div>
                        <div className="pl-mono text-[10px] text-ink/30 mt-1">{s.key}</div>
                      </div>
                      <div className="flex items-center gap-2 min-w-48">
                        {s.valueType === "boolean" ? (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <div
                              onClick={() =>
                                !ro &&
                                handleChange(s.key, currentVal === "true" ? "false" : "true")
                              }
                              className={`w-11 h-6 rounded-full relative transition-colors border-2 ${
                                currentVal === "true"
                                  ? "bg-sage border-sage"
                                  : "bg-ink/10 border-ink/20"
                              } ${!ro ? "cursor-pointer" : "cursor-not-allowed"}`}
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-paper transition-all shadow ${
                                  currentVal === "true" ? "left-5" : "left-0.5"
                                }`}
                              />
                            </div>
                            <span
                              className={`text-sm font-bold ${
                                currentVal === "true" ? "text-sage" : "text-fog"
                              }`}
                            >
                              {currentVal === "true" ? "Enabled" : "Disabled"}
                            </span>
                          </label>
                        ) : (
                          <input
                            type={s.valueType === "number" ? "number" : "text"}
                            value={currentVal}
                            onChange={(e) => !ro && handleChange(s.key, e.target.value)}
                            readOnly={ro}
                            className={`pl-input pl-mono text-sm w-48 ${
                              ro ? "opacity-60 cursor-not-allowed" : ""
                            } ${isDirty ? "border-ochre" : ""}`}
                          />
                        )}
                        {!s.isReadOnly && canManage && (
                          <button
                            onClick={() => handleSave(s)}
                            disabled={!isDirty}
                            className={`text-xs font-bold px-3 py-1.5 border-2 transition-colors whitespace-nowrap ${
                              isDirty
                                ? "border-sage bg-sage text-paper"
                                : "border-ink/20 text-fog cursor-not-allowed"
                            }`}
                          >
                            SAVE
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!canManage && (
        <div className="border-2 border-ink/20 bg-ink/5 p-4 text-sm text-fog italic text-center">
          You need the <strong className="text-ink">manage_settings</strong> privilege to edit
          system options.
        </div>
      )}
    </div>
  );
}
