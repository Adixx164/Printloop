import { useGetTenantMeQuery, useGetBrandingQuery, useUpdateBrandingMutation, useListDomainsQuery, useClaimDomainMutation, useVerifyDomainMutation, useDeleteDomainMutation, useListWebhooksQuery, useCreateWebhookMutation, useUpdateWebhookMutation, useDeleteWebhookMutation, useSetup2faMutation, useEnable2faMutation, useDisable2faMutation, useCloseTenantMutation } from '@printloop/shared/operator-api';
import { useGetTenantBalanceQuery } from '@printloop/shared/operator-api';
import { LucideIcons } from '@/components/LucideIcons';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useState } from 'react';

export function Settings() {
  const { data: tenant } = useGetTenantMeQuery();
  const { data: branding } = useGetBrandingQuery();
  const [updateBranding] = useUpdateBrandingMutation();
  const { data: domains, refetch: refetchDomains } = useListDomainsQuery();
  const [claimDomain] = useClaimDomainMutation();
  const [verifyDomain] = useVerifyDomainMutation();
  const [deleteDomain] = useDeleteDomainMutation();
  const { data: webhooks } = useListWebhooksQuery();
  const [createWebhook] = useCreateWebhookMutation();
  const [updateWebhook] = useUpdateWebhookMutation();
  const [deleteWebhook] = useDeleteWebhookMutation();
  const [setup2fa] = useSetup2faMutation();
  const [enable2fa] = useEnable2faMutation();
  const [disable2fa] = useDisable2faMutation();
  const [closeTenant] = useCloseTenantMutation();
  const { data: balance } = useGetTenantBalanceQuery();
  
  const [activeTab, setActiveTab] = useState<'branding' | 'domains' | 'webhooks' | 'security' | 'account'>('branding');
  const [showClaimDomain, setShowClaimDomain] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: [] as string[] });
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Settings</h1>
          <p className="text-ink/50 mt-1">Manage your shop configuration</p>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="border-b-2 border-ink">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Settings tabs">
          {[
            { id: 'branding', label: 'Branding', icon: 'palette' },
            { id: 'domains', label: 'Domains', icon: 'globe' },
            { id: 'webhooks', label: 'Webhooks', icon: 'webhook' },
            { id: 'security', label: 'Security', icon: 'shield' },
            { id: 'account', label: 'Account', icon: 'user' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink/50 hover:text-ink/70 hover:border-persimmon/50'
              }`}
            >
              <LucideIcons name={tab.icon} size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      
      <div className="space-y-6">
        {activeTab === 'branding' && <BrandingTab branding={branding} />}
        {activeTab === 'domains' && <DomainsTab />}
        {activeTab === 'webhooks' && <WebhooksTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'account' && <AccountTab />}
      </div>
    </div>
  );
  
  function BrandingTab({ branding }: any) {
    const [formData, setFormData] = useState({
      wordmark: branding?.wordmark || '',
      tagline: branding?.tagline || '',
      primaryColor: branding?.primaryColor || '#D14B2C',
      secondaryColor: branding?.secondaryColor || '#C7944A',
      accentColor: branding?.accentColor || '#6B7A5C',
      emailFromName: branding?.emailFromName || '',
      supportEmail: branding?.supportEmail || '',
      supportPhone: branding?.supportPhone || '',
    });
    
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      // await updateBranding(formData).unwrap();
    };
    
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Visual Identity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Wordmark</label>
              <Input value={formData.wordmark} onChange={(e) => setFormData({ ...formData, wordmark: e.target.value })} placeholder="PrintLoop" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tagline</label>
              <Input value={formData.tagline} onChange={(e) => setFormData({ ...formData, tagline: e.target.value })} placeholder="Your printing partner" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={formData.primaryColor} onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })} className="w-12 h-10 rounded-lg border-2 border-ink cursor-pointer" />
                <Input value={formData.primaryColor} onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={formData.secondaryColor} onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })} className="w-12 h-10 rounded-lg border-2 border-ink cursor-pointer" />
                <Input value={formData.secondaryColor} onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Accent Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={formData.accentColor} onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })} className="w-12 h-10 rounded-lg border-2 border-ink cursor-pointer" />
                <Input value={formData.accentColor} onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })} />
              </div>
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Communication</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email From Name</label>
              <Input value={formData.emailFromName} onChange={(e) => setFormData({ ...formData, emailFromName: e.target.value })} placeholder="PrintLoop Support" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Support Email</label>
              <Input value={formData.supportEmail} onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })} placeholder="support@printloop.app" type="email" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Support Phone</label>
              <Input value={formData.supportPhone} onChange={(e) => setFormData({ ...formData, supportPhone: e.target.value })} placeholder="+234 800 123 4567" />
            </div>
          </div>
        </Card>
        
        <div className="flex justify-end">
          <Button type="submit" variant="primary">Save Branding</Button>
        </div>
      </form>
    );
  };
  
  function DomainsTab() {
    const [showClaim, setShowClaim] = useState(false);
    const [newDomain, setNewDomain] = useState('');
    
    const handleClaim = async (e: React.FormEvent) => {
      e.preventDefault();
      // await claimDomain({ domain: newDomain }).unwrap().then(refetchDomains);
      setShowClaim(false);
      setNewDomain('');
    };
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Custom Domains</h3>
          <Button onClick={() => setShowClaim(true)} variant="primary">
            <LucideIcons name="plus" size={18} className="mr-1" />
            Add Domain
          </Button>
        </div>
        
        {domains?.length === 0 ? (
          <Card className="p-8 text-center">
            <LucideIcons name="globe" size={48} className="mx-auto mb-3 text-ink/20" />
            <h3 className="font-semibold text-lg">No custom domains</h3>
            <p className="text-ink/50 mt-1">Add a custom domain to replace your printloop.app subdomain</p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-ink text-left text-sm font-medium text-ink/60">
                    <th className="p-4">Domain</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">DNS Config</th>
                    <th className="p-4">Verified</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {/* Domain rows would go here */}
                </tbody>
              </table>
            </table>
          </div>
        </Card>
      )}
    );
  };
  
  function WebhooksTab() {
    const [showCreate, setShowCreate] = useState(false);
    const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: [] as string[] });
    
    const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      // await createWebhook(newWebhook).unwrap().then(refetchWebhooks);
    };
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Webhooks</h3>
          <Button onClick={() => setShowCreate(true)} variant="primary">
            <LucideIcons name="plus" size={18} className="mr-1" />
            Add Webhook
          </Button>
        </div>
        
        {webhooks?.length === 0 ? (
          <Card className="p-8 text-center">
            <LucideIcons name="webhook" size={48} className="mx-auto mb-3 text-ink/20" />
            <h3 className="font-semibold text-lg">No webhooks configured</h3>
            <p className="text-ink/50 mt-1">Add webhooks to receive real-time event notifications</p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-ink text-left text-sm font-medium text-ink/60">
                    <th className="p-4">Name</th>
                    <th className="p-4">URL</th>
                    <th className="p-4">Events</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Last Success</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {/* Webhook rows would go here */}
                </tbody>
              </table>
            </table>
          </Card>
        )}
        
        {showCreateWebhook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-paper rounded-xl border-2 border-ink p-6 w-full max-w-md">
              <h2 className="font-serif font-bold text-2xl mb-4">Create Webhook</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <Input value={newWebhook.name} onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })} placeholder="Order Notifications" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL</label>
                  <Input value={newWebhook.url} onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })} placeholder="https://your-app.com/webhooks/printloop" type="url" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Events</label>
                  <div className="space-y-2">
                    {['job.completed', 'job.failed', 'customer.signed_up', 'payout.paid'].map((event) => (
                      <label key={event} className="flex items-center gap-2">
                        <input type="checkbox" value={event} onChange={(e) => setNewWebhook({ ...newWebhook, events: e.target.checked ? [...newWebhook.events, event] : newWebhook.events.filter((ev: string) => ev !== event) })} />
                        <span className="text-sm">{event}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" variant="primary">Create Webhook</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  function SecurityTab() {
    const [setup2fa] = useSetup2faMutation();
    const [enable2fa] = useEnable2faMutation();
    const [disable2fa] = useDisable2faMutation();
    
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Two-Factor Authentication</h3>
          <div className="flex items-center justify-between p-4 bg-paper-light rounded-lg">
            <div>
              <h4 className="font-semibold">2FA Status</h4>
              <p className="text-sm text-ink/50">Not enabled</p>
            </div>
            <Button variant="primary" onClick={handleSetup2fa}>Enable 2FA</Button>
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Session Management</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-paper-light rounded-lg">
              <div>
                <h4 className="font-semibold">Active Sessions</h4>
                <p className="text-sm text-ink/50">1 active session</p>
              </div>
              <Button variant="ghost" size="sm">Revoke All</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  };
  
  function AccountTab() {
    const [closeTenant] = useCloseTenantMutation();
    
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Account Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Business Name</label>
              <p className="text-ink/70">{tenant?.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Slug</label>
              <p className="font-mono text-ink/70">{tenant?.slug}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <p className="text-ink/70 capitalize">{tenant?.status}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Commission</label>
              <p className="text-ink/70">{tenant?.commissionPct ? (tenant.commissionPct * 100).toFixed(1) + '%' : '10%'}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-6 border-red-500">
          <h3 className="font-semibold text-lg mb-4 text-red-600">Danger Zone</h3>
          <p className="text-ink/50 mb-4">Closing your tenant account is irreversible. All data, kiosks, transactions, and payouts will be permanently deleted.</p>
          <Button variant="ghost" onClick={() => {
            if (confirm('Type "CLOSE" to confirm')) {
              // closeTenant({ confirmSlug: tenant?.slug }).unwrap();
            }
          }} className="text-red-600 hover:text-red-700 border-red-500">
            Close Account
          </Button>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl tracking-tight">Settings</h1>
          <p className="text-ink/50 mt-1">Manage your shop configuration</p>
        </div>
      </div>
      
      <div className="border-b-2 border-ink">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Settings tabs">
          {[
            { id: 'branding', label: 'Branding', icon: 'palette' },
            { id: 'domains', label: 'Domains', icon: 'globe' },
            { id: 'webhooks', label: 'Webhooks', icon: 'webhook' },
            { id: 'security', label: 'Security', icon: 'shield' },
            { id: 'account', label: 'Account', icon: 'user' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink/50 hover:text-ink/70 hover:border-persimmon/50'
              }`}
            >
              <LucideIcons name={tab.icon} size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      
      <div className="space-y-6">
        {activeTab === 'branding' && <BrandingTab />}
        {activeTab === 'domains' && <DomainsTab />}
        {activeTab === 'webhooks' && <WebhooksTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'account' && <AccountTab />}
      </div>
    </div>
  );
}

export default Settings;