import { useListKiosksQuery, useCreateKioskMutation, useUpdateKioskStatusMutation, useRegenerateKioskKeyMutation, useMarkKioskTestPrintMutation, useDeleteKioskMutation, useSetDiscoverableMutation } from '@printloop/shared/operator-api';
import { useGetTenantMeQuery } from '@printloop/shared/operator-api';
import { LucideIcons } from '@/components/LucideIcons';
import { formatRelativeTime } from '@printloop/shared/utils';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useState } from 'react';

export function Kiosks() {
  const { data: kiosks, refetch: refetchKiosks } = useListKiosksQuery();
  const { data: tenant } = useGetTenantMeQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [newKiosk, setNewKiosk] = useState({ name: '', location: '', printerName: '' });
  
  const [createKiosk] = useCreateKioskMutation();
  const [updateStatus] = useUpdateKioskStatusMutation();
  const [regenerateKey] = useRegenerateKioskKeyMutation();
  const [markTestPrint] = useMarkKioskTestPrintMutation();
  const [deleteKiosk] = useDeleteKioskMutation();
  const [setDiscoverable] = useSetDiscoverableMutation();
  
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createKiosk(newKiosk).unwrap();
    setShowCreate(false);
    setNewKiosk({ name: '', location: '', printerName: '' });
    refetchKiosks();
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Kiosks</h1>
          <p className="text-ink/50 mt-1">Manage your kiosk fleet</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="pl-btn-primary flex items-center gap-2">
          <LucideIcons name="plus" size={18} />
          Add Kiosk
        </Button>
      </div>
      
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Marketplace Visibility</h3>
            <p className="text-sm text-ink/50">Allow customers to find this shop on the marketplace</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={tenant?.isDiscoverable || false}
              onChange={(e) => setDiscoverable({ isDiscoverable: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-persimmon/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-persimmon"></div>
          </label>
        </div>
      </Card>
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-ink text-left text-sm font-medium text-ink/60">
                <th className="p-4">Name</th>
                <th className="p-4">Location</th>
                <th className="p-4">Printer</th>
                <th className="p-4">Status</th>
                <th className="p-4">Jobs Printed</th>
                <th className="p-4">Last Seen</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {kiosks?.map((kiosk: any) => (
                <tr key={kiosk.id} className="hover:bg-paper-light transition-colors">
                  <td className="p-4">
                    <p className="font-medium">{kiosk.name}</p>
                    {kiosk.isDefault && <Badge className="ml-2 bg-persimmon/10 text-persimmon">Default</Badge>}
                  </td>
                  <td className="p-4 text-ink/50">{kiosk.location || 'Not set'}</td>
                  <td className="p-4 text-ink/50">{kiosk.printerName || 'Not configured'}</td>
                  <td className="p-4">
                    <Badge className={
                      kiosk.online ? 'bg-green-100 text-green-800' :
                      kiosk.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }>
                      {kiosk.online ? 'Online' : kiosk.status === 'busy' ? 'Busy' : 'Offline'}
                    </Badge>
                  </td>
                  <td className="p-4 text-center">{kiosk.totalJobsPrinted}</td>
                  <td className="p-4 text-ink/50 text-sm">
                    {kiosk.lastSeenAt ? formatRelativeTime(kiosk.lastSeenAt) : 'Never'}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleTestPrint(kiosk.id)}>
                        <LucideIcons name="printer" size={16} className="mr-1" />
                        Test Print
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRegenerateKey(kiosk.id)}>
                        <LucideIcons name="key" size={16} className="mr-1" />
                        Regenerate Key
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(kiosk.id)} className="text-red-600 hover:text-red-700">
                        <LucideIcons name="trash-2" size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-paper rounded-xl border-2 border-ink p-6 w-full max-w-md">
              <h2 className="font-serif font-bold text-2xl mb-4">Add New Kiosk</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Kiosk Name *</label>
                  <Input
                    value={newKiosk.name}
                    onChange={(e) => setNewKiosk({ ...newKiosk, name: e.target.value })}
                    placeholder="e.g., Main Library Kiosk"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <Input
                    value={newKiosk.location}
                    onChange={(e) => setNewKiosk({ ...newKiosk, location: e.target.value })}
                    placeholder="e.g., Ground Floor, Main Library"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Printer Name</label>
                  <Input
                    value={newKiosk.printerName}
                    onChange={(e) => setNewKiosk({ ...newKiosk, printerName: e.target.value })}
                    placeholder="e.g., HP LaserJet Pro"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" variant="primary">Create Kiosk</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
  
  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createKiosk(newKiosk).unwrap().then(() => {
      setShowCreate(false);
      setNewKiosk({ name: '', location: '', printerName: '' });
    });
  }
  
  function handleTestPrint(kioskId: string) {
    console.log('Test print for kiosk:', kioskId);
  }
  
  function handleRegenerateKey(kioskId: string) {
    if (confirm('Regenerate API key? This will invalidate the current key.')) {
      // regenerateKey({ id: kioskId }).unwrap().then(refetch);
    }
  }
  
  function handleDelete(kioskId: string) {
    if (confirm('Delete this kiosk? This cannot be undone.')) {
      // deleteKiosk({ id: kioskId }).unwrap().then(refetch);
    }
  }
}

export default Kiosks;