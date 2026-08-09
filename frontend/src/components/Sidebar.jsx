import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Activity,
  Network,
  ShieldCheck,
  Archive,
  Settings as SettingsIcon,
  LogOut,
  Radio,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/traffic', label: 'Traffic', icon: Activity },
  { to: '/connections', label: 'Connections', icon: Network },
  { to: '/xray', label: 'Xray', icon: ShieldCheck },
  { to: '/backups', label: 'Backups', icon: Archive },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-surface-800 bg-surface-950">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-surface-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600/20 text-accent-400">
          <Radio size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-surface-50 leading-none">Xray Panel</p>
          <p className="text-[11px] text-surface-400 mt-0.5">VLESS Manager</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent-600/15 text-accent-400 ring-1 ring-accent-600/30'
                  : 'text-surface-300 hover:bg-surface-800 hover:text-surface-50'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-surface-800">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-surface-300 hover:bg-surface-800 hover:text-red-400 transition-colors"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </aside>
  );
}
