import { useEffect, useState } from 'react';
import { User, Clock } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Topbar({ title }) {
  const { user } = useAuth();
  const [xrayActive, setXrayActive] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let mounted = true;
    const fetchStatus = () => {
      api
        .get('/xray/status')
        .then((res) => mounted && setXrayActive(res.data.active))
        .catch(() => mounted && setXrayActive(null));
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-16 shrink-0 border-b border-surface-800 bg-surface-950/80 backdrop-blur flex items-center justify-between px-4 md:px-6">
      <h1 className="text-lg font-semibold text-surface-50">{title}</h1>

      <div className="flex items-center gap-4 md:gap-6 text-sm text-surface-300">
        <div className="hidden sm:flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              xrayActive === null ? 'bg-surface-500' : xrayActive ? 'bg-emerald-400' : 'bg-red-400'
            } ${xrayActive ? 'animate-pulse' : ''}`}
          />
          <span>Xray {xrayActive === null ? 'unknown' : xrayActive ? 'running' : 'stopped'}</span>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Clock size={15} className="text-surface-400" />
          <span>{now.toLocaleTimeString()}</span>
        </div>

        <div className="flex items-center gap-2 pl-3 border-l border-surface-800">
          <div className="h-7 w-7 rounded-full bg-accent-600/20 text-accent-400 flex items-center justify-center">
            <User size={14} />
          </div>
          <span className="hidden sm:inline font-medium text-surface-100">{user?.username}</span>
        </div>
      </div>
    </header>
  );
}
