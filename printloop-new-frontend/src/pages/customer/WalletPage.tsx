import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useGetWalletQuery, useTopUpMutation, useInitializeTopUpMutation } from "@/store/services/walletApi";
import { extractError } from "@/lib/errors";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/layout/ResponsiveTable";

const presets = [500, 1000, 2000, 5000, 10000];

type Transaction = {
  id: string;
  type: "topup" | "print";
  amount: number;
  description: string;
  createdAt: string;
};

function formatDate(value?: string) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WalletPage() {
  const [amount, setAmount] = useState(1000);
  const { data: wallet, isLoading, isError } = useGetWalletQuery();
  const [topUp, { isLoading: isToppingUp }] = useTopUpMutation();
  const [initializeTopUp, { isLoading: isInitializing }] = useInitializeTopUpMutation();
  const transactions: Transaction[] = wallet?.transactions || [];
  const balance = Number(wallet?.balance || 0);

  const handleTopUp = async () => {
    try {
      const res = await initializeTopUp({ amount }).unwrap();
      if (res?.data?.authorizationUrl) {
        toast.info("Redirecting to secure payment gateway...");
        window.location.href = res.data.authorizationUrl;
        return;
      }
      await topUp({ amount }).unwrap();
      toast.success(`Mock top-up of ₦${amount.toLocaleString()} completed.`);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const columns: ResponsiveColumn<Transaction>[] = [
    {
      label: "",
      cell: (t) => (
        <span className={`text-lg font-extrabold ${t.amount > 0 ? "text-sage" : "text-persimmon"}`}>
          {t.amount > 0 ? "+" : "-"}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      label: "Description",
      cell: (t) => <span className="font-semibold text-[13px]">{t.description}</span>,
    },
    {
      label: "When",
      cell: (t) => <span className="text-xs text-fog">{formatDate(t.createdAt)}</span>,
    },
    {
      label: "Amount",
      align: "right",
      cell: (t) => (
        <span className={`pl-mono text-[13px] font-bold ${t.amount > 0 ? "text-sage" : "text-ink"}`}>
          {t.amount > 0 ? "+" : "-"}₦{Math.abs(t.amount).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="editorial-label text-persimmon mb-1">WALLET</div>
      <h1 className="pl-serif text-3xl sm:text-4xl font-bold tracking-tight mb-1">
        Your <em className="italic text-persimmon font-semibold">printing balance</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-6 sm:mb-7">
        Top up once, print across every station.
      </p>

      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Wallet data could not be loaded from the backend.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-3 mb-6">
        {/* ── Balance card ────────────────────────────────────────── */}
        <div className="bg-ink text-paper p-5 sm:p-7 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-32 sm:w-40 h-32 sm:h-40 rounded-full bg-persimmon/15 pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-ochre/15 pointer-events-none" />
          <div className="relative z-10">
            <div className="editorial-label opacity-70 mb-2">CURRENT BALANCE</div>
            <div className="pl-serif text-[44px] sm:text-[52px] lg:text-[58px] font-bold leading-none tracking-tight mb-1 break-all">
              ₦{isLoading ? "--" : balance.toLocaleString()}
            </div>
            <div className="text-[11px] text-sage font-semibold mb-4 sm:mb-5">
              Synced from /api/wallet
            </div>
            <div className="text-xs opacity-80 leading-relaxed">
              <span className="pl-serif italic">Roughly</span>{" "}
              <b className="font-bold">{Math.floor(balance / 5).toLocaleString()} B&amp;W pages</b>{" "}
              <span className="pl-serif italic">or</span>{" "}
              <b className="font-bold">
                {Math.floor(balance / 25).toLocaleString()} colour pages
              </b>{" "}
              <span className="pl-serif italic">at standard rates.</span>
            </div>
          </div>
        </div>

        {/* ── Top-up card ─────────────────────────────────────────── */}
        <div className="border-2 border-ink p-5 sm:p-6">
          <div className="editorial-label mb-3">TOP UP AMOUNT</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset)}
                className={`pl-chip ${amount === preset ? "pl-chip-active" : ""}`}
              >
                ₦{preset.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            <span className="pl-mono text-xl sm:text-2xl font-bold flex-shrink-0">₦</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="pl-input pl-mono text-lg sm:text-xl font-bold flex-1 min-w-0"
            />
          </div>
          <p className="pl-serif italic text-ink/60 text-xs mb-4 -mt-2 sm:hidden">
            Or pick a preset above.
          </p>

          <Button
            variant="primary"
            arrow
            className="w-full"
            onClick={handleTopUp}
            loading={isToppingUp || isInitializing}
            disabled={amount <= 0}
          >
            PAY ₦{amount.toLocaleString()}
          </Button>

          <p className="text-[11px] text-fog text-center mt-3">
            You will be redirected to Paystack securely.
          </p>
        </div>
      </div>

      <h2 className="pl-serif text-xl sm:text-2xl font-bold tracking-tight mb-3">
        Recent transactions{" "}
        <em className="italic text-ochre font-medium text-base sm:text-lg">
          — live wallet ledger
        </em>
      </h2>

      <ResponsiveTable
        columns={columns}
        rows={transactions}
        rowKey={(t) => t.id}
        mobileTitle={(t) => (
          <span className="flex items-center gap-2">
            <span className={`text-base font-extrabold ${t.amount > 0 ? "text-sage" : "text-persimmon"}`}>
              {t.amount > 0 ? "+" : "-"}
            </span>
            <span className="truncate">{t.description}</span>
          </span>
        )}
        emptyState={!isLoading ? "No wallet transactions yet." : "Loading…"}
      />
    </div>
  );
}
