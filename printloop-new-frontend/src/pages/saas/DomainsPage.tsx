import { useState } from "react";
import {
  useListDomainsQuery,
  useClaimDomainMutation,
  useVerifyDomainMutation,
  useDeleteDomainMutation,
  useGetLmsStatusQuery,
  useRegenerateLmsKeyMutation,
  type DomainClaimResponse,
} from "@/store/services/saasApi";

/**
 * `/saas/settings/domains` — custom-domain wizard (Dimension 8).
 * Claim → publish the shown TXT + CNAME at your DNS provider →
 * Verify. Status pills reflect the backend DomainStatus.
 */
export default function DomainsPage() {
  const { data: domains, isLoading } = useListDomainsQuery();
  const [claim, claimState] = useClaimDomainMutation();
  const [verify, verifyState] = useVerifyDomainMutation();
  const [del] = useDeleteDomainMutation();

  const [newDomain, setNewDomain] = useState("");
  const [claimed, setClaimed] = useState<DomainClaimResponse | null>(null);

  const onClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await claim({ domain: newDomain.trim() }).unwrap();
      setClaimed(r);
      setNewDomain("");
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">Custom domain</h2>
        <p className="text-sm text-ink/60">
          Serve your customers on your own domain instead of a
          PrintLoop subdomain. You'll add two DNS records, then verify.
        </p>
      </div>

      <form onSubmit={onClaim} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase tracking-wider mb-1">
            Domain to add
          </label>
          <input
            className="pl-input"
            value={newDomain}
            placeholder="print.your-school.edu.ng"
            onChange={(e) => setNewDomain(e.target.value.toLowerCase())}
            required
          />
        </div>
        <button
          type="submit"
          disabled={claimState.isLoading}
          className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {claimState.isLoading ? "Claiming…" : "Claim"}
        </button>
      </form>
      {claimState.isError && (
        <p className="text-persimmon text-sm font-semibold">
          {(claimState.error as any)?.data?.message || "Claim failed."}
        </p>
      )}

      {claimed && (
        <div className="bg-paper-warm border-2 border-ink rounded-pl p-4 space-y-3">
          <h3 className="font-bold">
            Add these DNS records for {claimed.domain}
          </h3>
          <DnsRow
            type="TXT"
            name={claimed.dns.txt.name}
            value={claimed.dns.txt.value}
          />
          <DnsRow
            type="CNAME"
            name={claimed.dns.cname.name}
            value={claimed.dns.cname.value}
          />
          <p className="text-xs text-ink/60">
            DNS can take a few minutes to propagate. Once added, hit
            Verify on the row below.
          </p>
        </div>
      )}

      <div>
        <h3 className="font-bold mb-2">Your domains</h3>
        {isLoading && <p className="text-fog text-sm pl-serif italic">Loading…</p>}
        {domains && domains.length === 0 && (
          <p className="text-fog text-sm">No domains yet.</p>
        )}
        <div className="space-y-2">
          {domains?.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between border-2 border-ink rounded-pl p-3 bg-paper-light"
            >
              <div>
                <div className="font-bold">{d.domain}</div>
                {d.lastCheckError && (
                  <div className="text-xs text-persimmon">{d.lastCheckError}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={d.status} />
                {d.status !== "verified" && (
                  <button
                    onClick={() => verify({ id: d.id })}
                    disabled={verifyState.isLoading}
                    className="pl-btn-dark !px-3 !py-1.5 !text-xs disabled:opacity-50"
                  >
                    Verify
                  </button>
                )}
                <button
                  onClick={() => del({ id: d.id })}
                  className="text-sm font-bold text-persimmon"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {verifyState.isError && (
          <p className="text-persimmon text-sm mt-2 font-semibold">
            {(verifyState.error as any)?.data?.message ||
              "Verification failed — check the TXT record."}
          </p>
        )}
      </div>

      <LmsLinkCard />
    </div>
  );
}

/**
 * Campus LMS button (V2-44). One URL a Moodle/Canvas admin pastes
 * behind a course button — students land on this shop signed-in-ish
 * (email pre-filled, single-use link). The URL embeds a secret key,
 * so it's shown ONCE on generate; rotating kills the old link.
 */
function LmsLinkCard() {
  const { data: lms } = useGetLmsStatusQuery();
  const [regen, regenState] = useRegenerateLmsKeyMutation();
  const [revealed, setRevealed] = useState<{ url: string; urlWithEmail: string } | null>(null);

  const onGenerate = async () => {
    if (
      lms?.keySet &&
      !window.confirm(
        "Generate a new campus link? The old link stops working everywhere it was pasted.",
      )
    )
      return;
    try {
      const r = await regen().unwrap();
      setRevealed({ url: r.url, urlWithEmail: r.urlWithEmail });
    } catch {
      /* error surfaced below */
    }
  };

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).catch(() => undefined);

  return (
    <div className="border-t-2 border-ink pt-6">
      <h3 className="font-bold mb-1">Campus LMS button</h3>
      <p className="text-sm text-ink/60 mb-3 max-w-xl">
        Put your shop one tap from every course page. Paste this link
        behind a button in Moodle / Canvas / Blackboard (using the
        LMS's own link or HTML block) — students land on your shop
        with sign-in pre-filled. Links are single-use and expire in 5
        minutes, so forwarding one around the class chat does nothing.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onGenerate}
          disabled={regenState.isLoading}
          className="pl-btn-dark !px-3 !py-1.5 !text-xs disabled:opacity-50"
        >
          {regenState.isLoading
            ? "Generating…"
            : lms?.keySet
              ? "Rotate campus link"
              : "Generate campus link"}
        </button>
        {lms?.keySet && !revealed && (
          <span className="px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial bg-sage/20 text-sage">
            link active
          </span>
        )}
      </div>
      {regenState.isError && (
        <p className="text-persimmon text-sm mt-2 font-semibold">
          {(regenState.error as any)?.data?.message || "Could not generate the link."}
        </p>
      )}
      {revealed && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-persimmon">
            Shown once — copy it now
          </p>
          <div className="bg-paper-light border-2 border-ink rounded-pl-sm p-2 font-mono text-xs break-all">
            {revealed.url}
          </div>
          <div className="flex gap-2">
            <button onClick={() => copy(revealed.url)} className="pl-btn-ghost !px-3 !py-1.5 !text-xs">
              Copy link
            </button>
            <button
              onClick={() => copy(revealed.urlWithEmail)}
              className="pl-btn-ghost !px-3 !py-1.5 !text-xs"
              title="For LMSes that can substitute the student's email into the URL"
            >
              Copy with email template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DnsRow({
  type,
  name,
  value,
}: {
  type: string;
  name: string;
  value: string;
}) {
  return (
    <div className="bg-paper-light border-2 border-ink rounded-pl-sm p-2 font-mono text-xs grid grid-cols-[60px_1fr] gap-2">
      <span className="font-bold">{type}</span>
      <div className="break-all">
        <div>
          <span className="text-ink/40">name </span>
          {name}
        </div>
        <div>
          <span className="text-ink/40">value </span>
          {value}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "verified"
      ? "bg-sage/20 text-sage"
      : status === "failed"
      ? "bg-persimmon/15 text-persimmon"
      : "bg-ochre/20 text-ochre";
  return (
    <span
      className={`px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial ${color}`}
    >
      {status}
    </span>
  );
}
