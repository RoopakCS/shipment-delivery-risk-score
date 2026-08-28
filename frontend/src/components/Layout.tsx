import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Box, LayoutDashboard, Target, Users, ShieldAlert } from 'lucide-react';
import { cn } from './shared/BandPill';

const navItems = [
  { path: '/', label: 'Risk Queue', icon: <LayoutDashboard size={18} /> },
  { path: '/backtest', label: 'Backtest', icon: <Target size={18} /> },
  { path: '/model', label: 'Model Trust', icon: <ShieldAlert size={18} /> },
  { path: '/community', label: 'Community', icon: <Users size={18} /> },
];

export const Layout: React.FC = () => {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-alt font-sans">
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center bg-ups-brown-800 px-6 shadow-sm z-10 relative">
        <div className="absolute left-0 top-0 h-full w-1 bg-ups-gold"></div>
        <div className="flex items-center gap-3">
          <Box className="text-ups-gold" size={24} />
          <h1 className="text-lg font-semibold tracking-wide text-white">
            Shipment Delivery Risk Score
          </h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 bg-ups-brown-600 text-white shadow-inner flex flex-col justify-between">
          <nav className="flex flex-col py-4">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors border-l-4",
                    isActive
                      ? "border-ups-gold bg-ups-brown-800 text-white"
                      : "border-transparent text-gray-300 hover:bg-ups-brown-800/50 hover:text-white"
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
          
          <div className="p-4 text-xs text-gray-400 border-t border-ups-brown-400/30">
            <p>V1.0.0-prototype</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 relative flex flex-col">
          <div className="flex-1 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
          
          {/* Footer */}
          <footer className="mt-12 py-4 text-center text-sm text-text-muted border-t border-border-warm w-full max-w-7xl mx-auto">
            Prototype - not an official UPS product.
          </footer>
        </main>
      </div>
    </div>
  );
};
