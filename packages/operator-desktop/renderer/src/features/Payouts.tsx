import { useGetTenantBalanceQuery, useListPayoutsQuery, useListTransactionsQuery, useRequestInstantPayoutMutation } from '@printloop/shared/operator-api';
import { LucideIcons } from '@/components/LucideIcons';
import { formatCurrency, formatRelativeTime } from '@printloop/shared/utils';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useState } from 'react';

export function Payouts() {
  const { data: balance } = useGetTenantBalanceQuery();
  const { data: payouts, refetch: refetchPayouts } = useListPayoutsQuery();
  const { data: transactions } = useListTransactionsQuery();
  const [requestInstantPayout] = useRequestInstantPayoutMutation();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  
  const handleRequestPayout = async () => {
    const amount = parseFloat(requestAmount);
    if (isNaN(amount) || amount <= 0) return;
    await requestInstantPayout().unwrap();
    setShowRequestModal(false);
    setRequestAmount('');
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Payouts</h1>
          <p className="text-ink/50 mt-1">Manage your earnings and withdrawals</p>
        </div>
        <Button 
          onClick={() => setShowRequestModal(true)}
          disabled={!balance || balance.availableBalance < 5000}
          className="pl-btn-primary flex items-center gap-2"
        >
          <LucideIcons name="banknote" size={18} />
          Request Payout
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <p className="text-sm text-ink/50 uppercase tracking-wider">Available Balance</p>
          <p className="font-serif font-extrabold text-3xl mt-2">{balance ? formatCurrency(balance.availableBalance) : '0'}</p>
          <p className="text-sm text-ink/50 mt-2">Min payout: 5000</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-ink/50 uppercase tracking-wider">Pending Payout</p>
          <p className="font-serif font-extrabold text-3xl mt-2">{balance ? formatCurrency(balance.pendingPayout) : '0'}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-ink/50 uppercase tracking-wider">Lifetime Platform Commission</p>
          <p className="font-serif font-extrabold text-3xl mt-2">{balance ? formatCurrency(balance.lifetimeCommissionPaidToPlatform) : '0'}</p>
        </Card>
      </div>
      
      <Card>
        <h3 className="font-semibold text-lg mb-4">Payout History</h3>
        {payouts?.items?.length === 0 ? (
          <div className="text-center py-8 text-ink/50">
            <LucideIcons name="credit-card" size={48} className="mx-auto mb-3 text-ink/20" />
            <p>No payouts yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-ink text-left text-sm font-medium text-ink/60">
                  <th className="p-4">Date</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Fee</th>
                  <th className="p-4">Net</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {payouts?.items?.map((payout: any) => (
                  <tr key={payout.id} className="hover:bg-paper-light transition-colors">
                    <td className="p-4 text-sm">{new Date(payout.requestedAt).toLocaleDateString()}</td>
                    <td className="p-4 font-medium">{formatCurrency(payout.amount)}</td>
                    <td className="p-4 text-ink/50">{formatCurrency(payout.feeAmount)}</td>
                    <td className="p-4 font-medium">{formatCurrency(payout.amount - payout.feeAmount)}</td>
                    <td className="p-4">
                      <Badge className={
                        payout.status === 'paid' ? 'bg-green-100 text-green-800' :
                        payout.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                        payout.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }>
                        {payout.status}
                      </Badge>
                    </td>
                    <td className="p-4 font-mono text-sm text-ink/50">{payout.reference || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-paper rounded-xl border-2 border-ink p-6 w-full max-w-md">
              <h2 className="font-serif font-bold text-2xl mb-4">Request Instant Payout</h2>
              <div className="space-y-4">
                <p className="text-sm text-ink/50">Available: {balance ? formatCurrency(balance.availableBalance) : '0'}</p>
                <p className="text-sm text-ink/50">Min: 5000 | Fee: 100</p>
                <div>
                  <label className="block text-sm font-medium mb-1">Amount</label>
                  <input
                    type="number"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full p-3 border-2 border-ink rounded-lg bg-paper"
                    min={5000}
                    max={balance?.availableBalance || 0}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setShowRequestModal(false)}>Cancel</Button>
                  <Button variant="primary" onClick={handleRequestPayout} disabled={isNaN(parseFloat(requestAmount))}>
                    Request Payout (100 fee)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
      
      <Card>
        <h3 className="font-semibold text-lg mb-4">Recent Transactions</h3>
        {transactions?.items?.length === 0 ? (
          <div className="text-center py-8 text-ink/50">No transactions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-ink text-left text-sm font-medium text-ink/60">
                  <th className="p-4">Date</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Commission</th>
                  <th className="p-4">Balance After</th>
                  <th className="p-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {transactions?.items?.slice(0, 20).map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-paper-light transition-colors">
                    <td className="p-4 text-sm">{new Date(tx.createdAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <Badge className={
                        tx.type === 'print' ? 'bg-blue-100 text-blue-800' :
                        tx.type === 'topup' ? 'bg-green-100 text-green-800' :
                        tx.type === 'refund' ? 'bg-red-100 text-red-800' :
                        'bg-purple-100 text-purple-800'
                      }>
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="p-4 font-medium">{formatCurrency(tx.amount)}</td>
                    <td className="p-4 text-ink/50">{formatCurrency(tx.commissionAmount)}</td>
                    <td className="p-4">{formatCurrency(tx.balanceAfter)}</td>
                    <td className="p-4 text-ink/50 text-sm">{tx.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default Payouts;