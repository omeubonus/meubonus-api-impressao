import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Companies } from './pages/Companies';
import { Agents } from './pages/Agents';
import { Playground } from './pages/Playground';
import { Jobs } from './pages/Jobs';
import { Download } from './pages/Download';
import { Branding } from './pages/Branding';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Download />} />
          <Route path="/download" element={<Download />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/painel"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="companies" element={<Companies />} />
            <Route path="agents" element={<Agents />} />
            <Route path="playground" element={<Playground />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="branding" element={<Branding />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
