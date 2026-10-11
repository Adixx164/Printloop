import { useListEditQueueQuery, useStartEditMutation, useCompleteEditMutation, useRejectEditMutation, useGetEditJobQuery } from '@printloop/shared/operator-api';
import { LucideIcons } from '@/components/LucideIcons';
import { formatRelativeTime, formatCurrency } from '@printloop/shared/utils';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useState } from 'react';

export function PrintQueue() {
  const { data, isLoading, refetch } = useListEditQueueQuery();
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  const [startEdit] = useStartEditMutation();
  const [completeEdit] = useCompleteEditMutation();
  const [rejectEdit] = useRejectEditMutation();
  
  const statusColors: Record<string, string> = {
    pending_shop: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    pending_customer: 'bg-purple-100 text-purple-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    completed: 'bg-gray-100 text-gray-800',
  };
  
  const jobs = data?.items || [];
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Edit Queue</h1>
          <p className="text-ink/50 mt-1">Manage document editing jobs</p>
        </div>
        <button onClick={() => refetch()} className="pl-btn-primary flex items-center gap-2">
          <LucideIcons name="refresh-cw" size={18} />
          Refresh
        </button>
      </div>
      
      {isLoading ? (
        <Card className="p-8 text-center">
          <LucideIcons name="loader" size={48} className="mx-auto animate-spin text-persimmon" />
          <p className="mt-4 text-ink/50">Loading edit queue...</p>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="p-8 text-center">
          <LucideIcons name="inbox" size={48} className="mx-auto mb-3 text-ink/20" />
          <h3 className="font-semibold text-lg">No edit jobs</h3>
          <p className="text-ink/50 mt-1">All caught up!</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-ink text-left text-sm font-medium text-ink/60">
                  <th className="p-4">Job</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Pages</th>
                  <th className="p-4">Fee</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Updated</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {jobs.map((job: any) => (
                  <tr key={job.id} className="hover:bg-paper-light transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-mono text-sm font-medium">{job.printJob?.code || job.id.slice(0, 8)}</p>
                        <p className="text-xs text-ink/50">{job.printJob?.totalPages} pages</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-medium">{job.printJob?.customerName || 'Unknown'}</p>
                    </td>
                    <td className="p-4 text-center">{job.printJob?.totalPages || 0}</td>
                    <td className="p-4 font-medium">{formatCurrency(job.totalEditFee || 0)}</td>
                    <td className="p-4">
                      <Badge className={statusColors[job.status] || 'bg-gray-100 text-gray-800'}>
                        {job.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="p-4 text-ink/50 text-sm">{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : '-'}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.status === 'pending_shop' && (
                          <Button variant="secondary" size="sm" onClick={() => handleStartEdit(job.id)}>
                            <LucideIcons name="edit" size={16} className="mr-1" />
                            Start
                          </Button>
                        )}
                        {job.status === 'in_progress' && (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => handleCompleteEdit(job.id)}>
                              <LucideIcons name="check" size={16} className="mr-1" />
                              Complete
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleRejectEdit(job.id)}>
                              <LucideIcons name="x" size={16} className="mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {job.status === 'pending_customer' && (
                          <Badge className="bg-purple-100 text-purple-800">Awaiting Customer</Badge>
                        )}
                        {job.status === 'approved' && (
                          <Badge className="bg-green-100 text-green-800">Approved</Badge>
                        )}
                        {job.status === 'rejected' && (
                          <Badge className="bg-red-100 text-red-800">Rejected</Badge>
                        )}
                        {job.status === 'completed' && (
                          <Badge className="bg-gray-100 text-gray-800">Completed</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
  
  function handleStartEdit(jobId: string) {
    startEdit({ jobId }).unwrap().then((result: any) => {
      if (result.editorUrl) {
        window.open(result.editorUrl, '_blank');
      }
      refetch();
    });
  }
  
  function handleCompleteEdit(jobId: string) {
    completeEdit({ jobId }).unwrap().then(refetch);
  }
  
  function handleRejectEdit(jobId: string) {
    const reason = prompt('Rejection reason (optional):');
    rejectEdit({ jobId, reason: reason || 'Rejected by shop' }).unwrap().then(refetch);
  }
}

export default PrintQueue;