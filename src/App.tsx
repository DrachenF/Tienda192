import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminGuard } from './components/AdminGuard';
import { ClientAppPage } from './pages/ClientAppPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';

export const App = () => (
  <main>
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<ClientAppPage />} />
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <AdminPage />
          </AdminGuard>
        }
      />
    </Routes>
  </main>
);
