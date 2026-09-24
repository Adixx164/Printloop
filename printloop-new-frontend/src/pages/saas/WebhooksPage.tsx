import { useState } from "react";
import {
  useListWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  type WebhookEventName,
  type TenantWebhook,
} from "@/store/services/saasApi";

const ALL_EVENTS: WebhookEventName[] = [
  "job.completed",
  "job.failed",
  "customer.signed_up",
  "payout.paid",
];

/**
 * `/saas/settings/webhooks` — outbound webhook config (Dimension 14).
 * Create shows the signing secret ONCE; list masks it. Toggle active,
 * edit events, delete. Last success/failure surfaced per row.
 */
export default function WebhooksPage() {
  const { data: hooks, isLoading } = useListWebhooksQuery();
  const [create, createState] = useCreateWebhookMutation();
  const [update] = useUpdateWebhookMutation();
  const [del] = useDeleteWebhookMutation();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventName[]>([
    "job.completed",
    "job.failed",
  ]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const toggleEvent = (e: WebhookEventName) =>
    setEvents((cur) =>
      cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e],
    );

  const onCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      const row = await create({ name, url, events }).unwrap();
      setRevealedSecret(row.secret);
      setName("");
      setUrl("");
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">Webhooks</h2>
        <p className="text-sm text-ink/60">
          We POST a signed JSON payload to your URL when events happen.
          Verify the <code className="bg-paper-warm px-1 rounded">X-PrintLoop-Signature</code> header
          (HMAC-SHA256 of the body with your secret).
        </p>
      </div>

      <form onSubmit={onCreate} className="border-2 border-ink rounded-pl p-4 space-y-3 bg-paper-light">
        <h3 className="font-bold">Add a webhook</h3>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="pl-input"
            placeholder="Label (e.g. LMS sync)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="pl-input"
            placeholder="https://your-system/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {ALL_EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={events.includes(e)}
                onChange={() => toggleEvent(e)}
              />
              <code>{e}</code>
            </label>
          ))}
        </div>
        {createState.isError && (
          <p className="text-persimmon text-sm font-semibold">
            {(createState.error as any)?.data?.message || "Create failed."}
          </p>
        )}
        <button
          type="submit"
          disabled={createState.isLoading}
          className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createState.isLoading ? "Creating…" : "Create webhook"}
        </button>
      </form>

      {revealedSecret && (
        <div className="bg-ochre/15 border-2 border-ochre rounded-pl p-4">
          <p className="text-sm font-bold mb-1">
            Save this signing secret now — it won't be shown again:
          </p>
          <code className="block bg-paper-light border-2 border-ink rounded-pl-sm p-2 text-xs break-all">
            {revealedSecret}
          </code>
          <button
            className="text-xs font-bold text-persimmon border-b-2 border-persimmon mt-2"
            onClick={() => setRevealedSecret(null)}
          >
            I've saved it
          </button>
        </div>
      )}

      <div>
        <h3 className="font-bold mb-2">Configured webhooks</h3>
        {isLoading && <p className="text-fog text-sm pl-serif italic">Loading…</p>}
        {hooks && hooks.length === 0 && (
          <p className="text-fog text-sm">None yet.</p>
        )}
        <div className="space-y-2">
          {hooks?.map((h) => (
            <WebhookRow
              key={h.id}
              hook={h}
              onToggle={() =>
                update({ id: h.id, isActive: !h.isActive })
              }
              onDelete={() => del({ id: h.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WebhookRow({
  hook,
  onToggle,
  onDelete,
}: {
  hook: TenantWebhook;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-2 border-ink rounded-pl p-3 bg-paper-light">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold">
            {hook.name}{" "}
            <span
              className={`ml-2 px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial ${
                hook.isActive
                  ? "bg-sage/20 text-sage"
                  : "bg-ink/10 text-ink/50"
              }`}
            >
              {hook.isActive ? "active" : "paused"}
            </span>
          </div>
          <div className="text-xs text-ink/60 break-all font-mono">{hook.url}</div>
          <div className="text-xs text-ink/40 mt-1 font-mono">
            {hook.events.join(", ") || "no events"}
          </div>
          {hook.lastFailureReason && (
            <div className="text-xs text-persimmon mt-1">
              last failure: {hook.lastFailureReason}
            </div>
          )}
          {hook.lastSuccessAt && (
            <div className="text-xs text-sage mt-1">
              last ok: {new Date(hook.lastSuccessAt).toLocaleString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={onToggle} className="text-sm font-bold text-persimmon">
            {hook.isActive ? "Pause" : "Resume"}
          </button>
          <button onClick={onDelete} className="text-sm font-bold text-persimmon">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
