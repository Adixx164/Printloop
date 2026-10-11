import { useGetOpsSummaryQuery } from '@printloop/shared/operator-api';
import { LucideIcons } from '@/components/LucideIcons';
import { formatCurrency, formatNumber, formatRelativeTime } from '@printloop/shared/utils';
import { Card } from './ui/Card';

export function Dashboard() {
  const { data, isLoading, error } = useGetOpsSummaryQuery();
  
  const stats = data ? [
    {
      label: 'REVENUE TODAY',
      value: formatCurrency(data.revenueTodayGross),
      icon: 'dollar-sign',
      color: 'text-ochre',
      change: '+12%',
      changeType: 'positive',
    },
    {
      label: 'COMMISSION TODAY',
      value: formatCurrency(data.commissionTodayPaid),
      icon: 'percent',
      color: 'text-persimmon',
      change: '+8%',
      changeType: 'positive',
    },
    {
      label: 'JOBS TODAY',
      value: formatNumber(data.jobsToday),
      icon: 'file-text',
      color: 'text-sage',
      change: '+5%',
      changeType: 'positive',
    },
    {
      label: 'ACTIVE KIOSKS',
      value: `${data.onlineCount}/${data.kioskCount}`,
      icon: 'monitor',
      color: 'text-ink',
      change: data.onlineCount === data.kioskCount ? 'All online' : `${data.kioskCount - data.onlineCount} offline`,
      changeType: data.onlineCount === data.kioskCount ? 'positive' : 'warning',
    },
  ] : [];
  
  const liveGate = data?.liveGate;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Dashboard</h1>
          <p className="text-ink/50 mt-1">Real-time overview of your print shop operations</p>
        </div>
        <button className="pl-btn-primary flex items-center gap-2">
          <LucideIcons name="refresh-cw" size={18} />
          Refresh
        </button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      
      {liveGate && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif font-bold text-xl">Live Gate Status</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              liveGate.liveGateMet ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {liveGate.liveGateMet ? 'LIVE' : 'NOT READY'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
            <GateItem label="Location Set" value={liveGate.locationSet ? 'Yes' : 'No'} icon="map-pin" status={liveGate.locationSet} />
            <GateItem label="Status Active" value={liveGate.statusActive ? 'Open' : 'Closed'} icon="unlock" status={liveGate.statusActive} />
            <GateItem label="Test Print" value={liveGate.testPrintDone ? 'Passed' : 'Pending'} icon="printer" status={liveGate.testPrintDone} />
            <GateItem label="Kiosk Online" value={liveGate.kioskOnline ? 'Yes' : 'No'} icon="wifi" status={liveGate.kioskOnline} />
            <GateItem label="Discoverable" value={liveGate.isDiscoverable ? 'Yes' : 'No'} icon="globe" status={liveGate.isDiscoverable} />
          </div>
        </Card>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-lg mb-4">Kiosk Fleet</h3>
          <div className="space-y-3">
            {data?.kiosks?.map((kiosk: any) => (
              <div key={kiosk.id} className="flex items-center justify-between p-3 bg-paper-light rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-persimmon/10 flex items-center justify-center">
                    <LucideIcons name="monitor" size={20} className="text-persimmon" />
                  </div>
                  <div>
                    <p className="font-medium">{kiosk.name}</p>
                    <p className="text-sm text-ink/50">{kiosk.location || 'No location'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className={`flex items-center gap-1 ${kiosk.online ? 'text-green-600' : 'text-red-600'}`}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    {kiosk.online ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-ink/50">{kiosk.totalJobsPrinted} jobs</span>
                  <span className="text-ink/50">Last seen: {formatRelativeTime(kiosk.lastSeenAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        
        <Card>
          <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
          <div className="space-y-3">
            <div className="text-center py-8 text-ink/50">
              <LucideIcons name="activity" size={48} className="mx-auto mb-3 text-ink/20" />
              <p>No recent activity</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, change, changeType }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-wider text-ink/40 uppercase">{label}</p>
          <p className="font-serif font-extrabold text-2xl lg:text-3xl mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}/10`}>
          <LucideIcons name={icon} size={24} className={color} />
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-ink/10">
        <span className={`text-xs font-medium ${changeType === 'positive' ? 'text-green-600' : changeType === 'warning' ? 'text-yellow-600' : 'text-red-600'}`}>
          {change}
        </span>
      </div>
    </Card>
  );
}

function GateItem({ label, value, icon, status }: any) {
  return (
    <div className={`p-4 rounded-lg border-2 ${status ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
      <div className="flex items-center gap-2 text-sm text-ink/60 mb-1">
        <LucideIcons name={icon} size={16} className={status ? 'text-green-600' : 'text-red-600'} />
        <span className="font-medium">{label}</span>
      </div>
      <p className="font-bold text-lg">{value}</p>
    </div>
  );
}

function Card({ children, className = '' }: any) {
  return (
    <div className={`border-2 border-ink bg-paper rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export default Dashboard;