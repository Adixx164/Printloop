import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useGetWalletQuery, useTopUpMutation, useInitializeTopUpMutation } from "@/store/services/walletApi";
import { extractError } from "@/lib/errors";

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
      // 1. First we call the real backend controller we just created
      const res = await initializeTopUp({ amount }).unwrap();
      
      // 2. If it returns an authorizationUrl (Paystack checkout link), we redirect to it
      if (res?.data?.authorizationUrl) {
        toast.info("Redirecting to secure payment gateway...");
        window.location.href = res.data.authorizationUrl;
        return;
      }

      // Fallback for dev mode where the mock API just directly adds funds
      await topUp({ amount }).unwrap();
      toast.success(`Mock top-up of ₦${amount.toLocaleString()} completed.`);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div>
      <div className="editorial-label text-persimmon mb-1">WALLET</div>
      <h1 className="pl-serif text-4xl font-bold tracking-tight mb-1">
        Your <em className="italic text-persimmon font-semibold">printing balance</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">Top up once, print across every station.</p>

      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Wallet data could not be loaded from the backend.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-3 mb-6">
        <div className="bg-ink text-paper p-7 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-persimmon/15" />
          <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-ochre/15" />
          <div className="relative z-10">
            <div className="editorial-label opacity-70 mb-2">CURRENT BALANCE</div>
            <div className="pl-serif text-[58px] font-bold leading-none tracking-tight mb-1">
              ₦{isLoading ? "--" : balance.toLocaleString()}
            </div>
            <div className="text-[11px] text-sage font-semibold mb-5">Synced from /api/wallet</div>
            <div className="text-xs opacity-80">
              <span className="pl-serif italic">Roughly</span>{" "}
              <b className="font-bold">{Math.floor(balance / 5).toLocaleString()} B&amp;W pages</b>{" "}
              <span className="pl-serif italic">or</span>{" "}
              <b className="font-bold">{Math.floor(balance / 25).toLocaleString()} colour pages</b>
              {" "}<span className="pl-serif italic">at standard rates.</span>
            </div>
          </div>
        </div>

        <div className="border-2 border-ink p-6">
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
          <div className="flex items-center gap-2 mb-5">
            <span className="pl-mono text-2xl font-bold">₦</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="pl-input pl-mono text-xl font-bold w-40"
            />
            <span className="pl-serif italic text-ink/60 text-sm">or pick a preset above.</span>
          </div>

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

          <p className="text-[11px] text-fog text-center mt-3">You will be redirected to Paystack securely.</p>
        </div>
      </div>

      <h2 className="pl-serif text-2xl font-bold tracking-tight mb-3">
        Recent transactions <em className="italic text-ochre font-medium text-lg">— live wallet ledger</em>
      </h2>

      <div className="border-2 border-ink">
        <div className="bg-ink text-paper grid grid-cols-[24px_1fr_130px_90px] gap-3 px-3 py-2 text-[10px] tracking-editorial font-bold">
          <div></div><div>DESCRIPTION</div><div>WHEN</div><div>AMOUNT</div>
        </div>
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="grid grid-cols-[24px_1fr_130px_90px] gap-3 px-3 py-3 border-b border-ink/10 last:border-0 items-center hover:bg-paper-light transition-colors"
          >
            <div className={`text-lg font-extrabold ${transaction.amount > 0 ? "text-sage" : "text-persimmon"}`}>
              {transaction.amount > 0 ? "+" : "-"}
            </div>
            <div className="font-semibold text-[13px]">{transaction.description}</div>
            <div className="text-xs text-fog">{formatDate(transaction.createdAt)}</div>
            <div className={`pl-mono text-[13px] font-bold ${transaction.amount > 0 ? "text-sage" : "text-ink"}`}>
              ₦{Math.abs(transaction.amount).toLocaleString()}
            </div>
          </div>
        ))}
        {!isLoading && transactions.length === 0 && (
          <div className="p-10 text-center text-ink/50 pl-serif italic">No wallet transactions yet.</div>
        )}
      </div>
    </div>
  );
}
