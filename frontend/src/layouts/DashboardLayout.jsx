import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useTitleContext } from '../context/PageTitleContext';

export default function DashboardLayout() {
  const { title } = useTitleContext();
  return (
    <div className="flex h-screen bg-surface-950 text-surface-100">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
