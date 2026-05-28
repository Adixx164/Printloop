import { useEffect, useMemo, useState } from "react";
import { Lock, Share2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import QrBlock from "@/components/ui/QrBlock";
import {
  useCloseGroupSessionMutation,
  useCreateGroupSessionMutation,
  useGetGroupSessionQuery,
  useListGroupSessionsQuery,
} from "@/store/services/groupApi";
import { extractError } from "@/lib/errors";

const HOST_KEY = "pl_group_hostId";
function getHostId(): string {
  let id = localStorage.getItem(HOST_KEY);
  if (!id) {
    id =
      (crypto as any).randomUUID?.() ||
      "host_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(HOST_KEY, id);
  }
  return id;
}

function defaultDeadline() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied.`),
    () => toast.error("Could not copy.")
  );
}

function SessionCard({ session, hostId }: { session: any; hostId: string }) {
  const { data } = useGetGroupSessionQuery(
    { id: session.id, hostId },
    { skip: !session.id }
  );
  const [closeSession, { isLoading: isClosing }] = useCloseGroupSessionMutation();
  const participants: any[] = data?.participants || [];
  const summary = data?.summary || {};
  const joinUrl = `${window.location.origin}/join/${session.shareId}`;
  const isOpen = session.status === "open";

  const close = async () => {
    try {
      await closeSession({ id: session.id, hostId }).unwrap();
      toast.success("Group closed. Batch token generated.");
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="border-2 border-ink bg-paper-light animate-fadein">
      <div className="bg-ink text-paper px-5 py-3 flex justify-between gap-3 items-center flex-wrap">
        <div>
          <div className="editorial-label text-persimmon mb-1">{isOpen ? "OPEN" : "CLOSED"}</div>
          <h2 className="pl-serif text-xl sm:text-2xl font-bold">{session.groupName}</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => copy(joinUrl, "Share link")} className="pl-btn-primary py-2 px-3 text-[11px]">
            <Share2 size={15} /> COPY LINK
          </button>
          <a href={joinUrl} target="_blank" rel="noreferrer" className="pl-btn-ghost bg-paper text-ink py-2 px-3 text-[11px]">
            <ExternalLink size={15} /> OPEN
          </a>
          {isOpen && (
            <button onClick={close} disabled={isClosing} className="pl-btn-ghost bg-paper text-ink py-2 px-3 text-[11px]">
              <Lock size={15} /> CLOSE
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_210px] gap-4 p-5">
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 border-2 border-ink mb-4">
            {[
              ["PARTICIPANTS", participants.length],
              ["PAID", summary.paid ?? 0],
              ["PAGES", summary.totalPages ?? 0],
              ["DEADLINE", new Date(session.deadline).toLocaleString()],
            ].map(([label, value], i) => (
              <div key={String(label)} className={`p-3 ${i < 3 ? "border-r border-ink" : ""}`}>
                <div className="editorial-label opacity-60">{label}</div>
                <div className="pl-mono font-bold text-sm">{String(value)}</div>
              </div>
            ))}
          </div>

          <div className="border-2 border-ink">
            <div className="bg-ink text-paper grid grid-cols-[1fr_120px_90px] px-3 py-2 text-[10px] tracking-editorial font-bold">
              <div>PARTICIPANT</div><div>STATUS</div><div>PAID</div>
            </div>
            {participants.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_120px_90px] px-3 py-3 border-b border-ink/10 last:border-0 items-center">
                <div>
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-xs text-fog">{p.email || p.phoneNumber || "—"}</div>
                </div>
                <div className="text-xs font-bold uppercase">{String(p.status).toLowerCase()}</div>
                <div className="text-xs font-bold uppercase text-sage">{p.status === "PAID" ? "yes" : "—"}</div>
              </div>
            ))}
            {!participants.length && (
              <div className="p-6 text-center text-ink/50 pl-serif italic text-sm">
                No one has joined yet — share the link.
              </div>
            )}
          </div>
        </div>

        <aside className="border-2 border-ink bg-paper p-4 text-center h-fit flex flex-col items-center">
          {session.batchCode ? (
            <>
              <QrBlock
                value={`printloop://group/${session.batchCode}`}
                caption={session.batchCode}
                label="KIOSK BATCH CODE"
                size={150}
                fileName={`printloop-group-${session.batchCode}`}
              />
              <div className="text-xs text-ink/60 mt-2">Scan or type at any kiosk.</div>
            </>
          ) : (
            <>
              <QrBlock
                value={joinUrl}
                label="SCAN TO JOIN"
                size={150}
                fileName={`printloop-join-${session.shareId}`}
              />
              <div className="text-xs text-ink/55 mt-2 pl-serif italic">
                Close the group to generate the kiosk batch token.
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function GroupPrintPage() {
  const hostId = useMemo(() => getHostId(), []);
  const { data, isLoading } = useListGroupSessionsQuery(hostId);
  const [createSession, { isLoading: isCreating }] = useCreateGroupSessionMutation();
  const sessions: any[] = data?.sessions || [];

  const [form, setForm] = useState({
    groupName: "",
    deadline: defaultDeadline(),
    color: "bw" as "bw" | "color",
    sided: "double" as "single" | "double",
    paper: "A4" as "A4" | "A3" | "Letter",
    qualityDpi: 300,
    orientation: "portrait" as "portrait" | "landscape",
    enforce: true,
  });

  useEffect(() => {
    if (!form.groupName) setForm((f) => ({ ...f, groupName: "" }));
  }, []); // eslint-disable-line

  const submit = async () => {
    if (!form.groupName.trim()) return toast.error("Name the session first.");
    if (!form.deadline) return toast.error("Set a deadline.");
    try {
      // Watermarking is permanently removed — no watermark fields sent.
      await createSession({
        groupName: form.groupName.trim(),
        deadline: new Date(form.deadline).toISOString(),
        hostId,
        defaultOptions: {
          paper: form.paper,
          color: form.color,
          sided: form.sided,
          qualityDpi: form.qualityDpi,
          orientation: form.orientation,
          enforce: form.enforce,
        },
      }).unwrap();
      toast.success("Group link created — share it with your group.");
      setForm((f) => ({ ...f, groupName: "" }));
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="animate-fadein">
      <div className="editorial-label text-persimmon mb-1">GROUP PRINTING</div>
      <h1 className="pl-serif text-3xl sm:text-4xl font-bold tracking-tight mb-1">
        Name it, set a deadline, <em className="italic text-persimmon font-semibold">share the link</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">
        Anyone with the link uploads their own document, configures it, and pays — then you print the batch with one token.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <aside className="border-2 border-ink p-4 sm:p-6 bg-paper-light h-fit">
          <div className="editorial-label text-persimmon mb-3">CREATE A SESSION</div>

          <div className="editorial-label mb-2">SESSION NAME</div>
          <input
            value={form.groupName}
            onChange={(e) => setForm({ ...form, groupName: e.target.value })}
            className="pl-input mb-4"
            placeholder="e.g. CSC 301 Assignment 2"
          />

          <div className="editorial-label mb-2">DEADLINE</div>
          <input
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            className="pl-input pl-mono mb-1"
          />
          <div className="text-xs text-ink/55 pl-serif italic mb-4">
            Uploads close automatically at this time (max 7 days out).
          </div>

          <div className="editorial-label mb-2">DEFAULT SETTINGS</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(["bw", "color"] as const).map((c) => (
              <button key={c} onClick={() => setForm({ ...form, color: c })} className={`pl-chip ${form.color === c ? "pl-chip-active" : ""}`}>
                {c === "bw" ? "B&W" : "Colour"}
              </button>
            ))}
            {(["single", "double"] as const).map((s) => (
              <button key={s} onClick={() => setForm({ ...form, sided: s })} className={`pl-chip ${form.sided === s ? "pl-chip-active" : ""}`}>
                {s === "single" ? "Single" : "Duplex"}
              </button>
            ))}
            {(["A4", "A3", "Letter"] as const).map((p) => (
              <button key={p} onClick={() => setForm({ ...form, paper: p })} className={`pl-chip ${form.paper === p ? "pl-chip-active" : ""}`}>
                {p}
              </button>
            ))}
          </div>

          <div className="editorial-label mb-2">QUALITY</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {([100, 300, 600] as const).map((q) => (
              <button
                key={q}
                onClick={() => setForm({ ...form, qualityDpi: q })}
                className={`pl-chip ${form.qualityDpi === q ? "pl-chip-active" : ""}`}
              >
                {q}dpi
              </button>
            ))}
          </div>

          <div className="editorial-label mb-2">ORIENTATION</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(["portrait", "landscape"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setForm({ ...form, orientation: o })}
                className={`pl-chip ${form.orientation === o ? "pl-chip-active" : ""}`}
              >
                {o === "portrait" ? "Portrait" : "Landscape"}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 mt-2 text-sm font-semibold">
            <input type="checkbox" checked={form.enforce} onChange={(e) => setForm({ ...form, enforce: e.target.checked })} />
            Enforce these settings on every upload
          </label>
          <div className="text-[11px] text-ink/55 pl-serif italic mt-1.5 leading-snug">
            Enforce locks paper, colour, sides, and quality. Each participant
            still picks their own copies + page range.
          </div>

          <Button variant="primary" arrow className="w-full mt-5" loading={isCreating} onClick={submit}>
            CREATE GROUP LINK
          </Button>
        </aside>

        <section className="space-y-4">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} hostId={hostId} />
          ))}
          {!isLoading && !sessions.length && (
            <div className="border-2 border-ink p-10 text-center text-ink/50 pl-serif italic">
              No sessions yet. Create one to get a shareable link.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
