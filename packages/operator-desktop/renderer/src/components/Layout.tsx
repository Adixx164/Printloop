import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDispatch } from 'react-redux';
import { logOut } from '@/features/auth/authSlice';
import { LucideIcons } from './LucideIcons';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { path: '/queue', label: 'Print Queue', icon: 'printer' },
  { path: '/kiosks', label: 'Kiosks', icon: 'monitor' },
  { path: '/payouts', label: 'Payouts', icon: 'banknote' },
  { path: '/analytics', label: 'Analytics', icon: 'bar-chart-2' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

export function Layout({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const dispatch = useDispatch();
  
  const handleLogout = () => {
    dispatch(logOut());
    onLogout();
  };
  
  return (
    <div className="min-h-screen bg-paper flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-paper-light border-r-2 border-ink transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b-2 border-ink flex items-center justify-between">
            <div className="font-serif font-extrabold text-xl tracking-tight">
              PrintLoop<span className="text-persimmon">.</span>
            </div>
            <button
              className="lg:hidden p-2 rounded border-2 border-ink hover:bg-ink hover:text-paper"
              onClick={() => setSidebarOpen(false)}
            >
              <LucideIcons name="x" size={20} />
            </button>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-all ${
                    isActive
                      ? 'bg-ink text-paper border-ink'
                      : 'text-ink/70 border-transparent hover:border-persimmon hover:bg-persimmon/10'
                  }`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <LucideIcons name={item.icon} size={20} />
                <span className="font-medium text-sm">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          
          {/* Footer */}
          <div className="p-4 border-t-2 border-ink">
            <div className="flex items-center gap-3 px-3 py-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-persimmon flex items-center justify-center text-paper font-bold text-sm">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{user?.firstName} {user?.lastName}</p>
                <p className="text-[11px] text-ink/50 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 border-ink text-ink/70 hover:bg-ink hover:text-paper hover:border-ink transition-all"
            >
              <LucideIcons name="log-out" size={20} />
              <span className="font-medium text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
      
      {/* Mobile menu toggle */}
      <button
        className="lg:hidden fixed bottom-4 right-4 z-50 p-3 rounded-full bg-ink text-paper border-2 border-ink shadow-lg"
        onClick={() => setSidebarOpen(true)}
      >
        <LucideIcons name="menu" size={24} />
      </button>
      
      {/* Main content */}
      <main className="flex-1 lg:ml-64 min-h-screen">
        <header className="sticky top-0 z-40 bg-paper border-b-2 border-ink px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <h1 className="font-serif font-bold text-2xl tracking-tight">
              {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
            </h1>
            <div className="flex items-center gap-4">
              {/* Availability toggle would go here */}
            </div>
          </header>
          
          <div className="p-6">
            <Outlet />
          </div>
        </header>
      </main>
    </div>
  );
}

export default Layout;