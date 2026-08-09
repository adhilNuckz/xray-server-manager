import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PageTitleProvider } from './context/PageTitleContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Traffic from './pages/Traffic';
import Connections from './pages/Connections';
import XrayConfigPage from './pages/XrayConfigPage';
import Backups from './pages/Backups';
import Settings from './pages/Settings';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PageTitleProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="clients" element={<Clients />} />
                <Route path="traffic" element={<Traffic />} />
                <Route path="connections" element={<Connections />} />
                <Route path="xray" element={<XrayConfigPage />} />
                <Route path="backups" element={<Backups />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PageTitleProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
