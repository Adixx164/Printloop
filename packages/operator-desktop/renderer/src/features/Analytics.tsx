import { useGetOpsSummaryQuery, useListTransactionsQuery } from '@printloop/shared/operator-api';
import { LucideIcons } from '@/components/LucideIcons';
import { formatCurrency, formatNumber } from '@printloop/shared/utils';
import { Card } from './ui/Card';
import { useState } from 'react';

export function Analytics() {
  const { data: ops } = useGetOpsSummaryQuery();
  const { data: transactions } = useListTransactionsQuery({ limit: 100 });
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  
  // Calculate metrics from transactions
  const metrics = transactions?.items?.reduce((acc: any, tx: any) => {
    const date = new Date(tx.createdAt);
    const isToday = date.toDateString() === new Date().toDateString();
    const isThisWeek = date >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const isThisMonth = date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (isToday) {
      acc.today.revenue += tx.amount;
      acc.today.commission += tx.commissionAmount;
      acc.today.jobs += 1;
    }
    if (isThisWeek) {
      acc.week.revenue += tx.amount;
      acc.week.commission += tx.commissionAmount;
      acc.week.jobs += 1;
    }
    if (isThisMonth) {
      acc.month.revenue += tx.amount;
      acc.month.commission += tx.commissionAmount;
      acc.month.jobs += 1;
    }
    return acc;
  }, {
    today: { revenue: 0, commission: 0, jobs: 0 },
    week: { revenue: 0, commission: 0, jobs: 0 },
    month: { revenue: 0, commission: 0, jobs: 0 },
  }) || { today: { revenue: 0, commission: 0, jobs: 0 }, week: { revenue: 0, commission: 0, jobs: 0 }, month: { revenue: 0, commission: 0, jobs: 0 } };
  
  const current = metrics[timeRange];
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Analytics</h1>
          <p className="text-ink/50 mt-1">Track your shop performance</p>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-ink text-paper'
                  : 'bg-paper-light text-ink/70 hover:bg-ink/10'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="REVENUE"
          value={0}
          icon="dollar-sign"
          color="text-ochre"
        />
        <StatCard
          label="COMMISSION PAID"
          value={0}
          icon="percent"
          color="text-persimmon"
        />
        <StatCard
          label="JOBS PROCESSED"
          value={0}
          icon="file-text"
          color="text-sage"
        />
        <StatCard
          label="AVG JOB VALUE"
          value={0}
          icon="calculator"
          color="text-persimmon"
        />
      </div>
      
      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Revenue Trend</h3>
          <div className="h-64 flex items-center justify-center text-ink/30">
            <LucideIcons name="bar-chart-2" size={64} />
            <span className="ml-4 text-ink/50">Revenue chart would go here</span>
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Job Volume</h3>
          <div className="h-64 flex items-center justify-center text-ink/30">
            <LucideIcons name="activity" size={64} />
            <span className="ml-4 text-ink/50">Job volume chart would go here</span>
          </div>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Top Print Configurations</h3>
          <div className="space-y-3">
            <ConfigRow config="A4 B&W 300 DPI" jobs="45" revenue="22500" />
            <ConfigRow config="A4 Color 300 DPI" jobs="23" revenue="57500" />
            <ConfigRow config="A3 B&W 300 DPI" jobs="12" revenue="12000" />
            <ConfigRow config="A4 Color 600 DPI" jobs="8" revenue="20000" />
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Peak Hours</h3>
          <div className="space-y-3">
            <HourRow hour="9 AM - 11 AM" jobs="34" percentage={28} />
            <HourRow hour="11 AM - 1 PM" jobs="42" percentage={35} />
            <HourRow hour="1 PM - 3 PM" jobs="28" percentage={23} />
            <HourRow hour="3 PM - 5 PM" jobs="17" percentage={14} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-wider text-ink/40 uppercase">{label}</p>
          <p className="font-serif font-extrabold text-2xl lg:text-3xl mt-1">{value}</p>
        </div>
        <div className="p-3 rounded-lg text-ink/10">
          <LucideIcons name={icon} size={24} className={color} />
        </div>
      </div>
    </Card>
  );
}

function ConfigRow({ config, jobs, revenue }: any) {
  return (
    <div className="flex items-center justify-between p-3 bg-paper-light rounded-lg">
      <span className="font-medium">{config}</span>
      <div className="flex items-center gap-4 text-sm text-ink/60">
        <span>{jobs} jobs</span>
        <span className="font-medium">{revenue.toLocaleString()}</span>
      </div>
    </div>
  );
}

function HourRow({ hour, jobs, percentage }: any) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-32 text-sm font-medium">{hour}</span>
      <div className="flex-1 h-4 bg-paper-light rounded-full overflow-hidden">
        <div className="h-full bg-persimmon rounded-full transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-16 text-sm text-right font-medium">{jobs} jobs</span>
      <span className="w-12 text-sm text-ink/50 text-right">{percentage}%</span>
    </div>
  );
}

export default Analytics;