import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import AccountPage from './pages/AccountPage';
import CardDetailPage from './pages/CardDetailPage';
import CardsPage from './pages/CardsPage';
import CompanyPage from './pages/CompanyPage';
import DashboardPage from './pages/DashboardPage';
import DepartmentsPage from './pages/DepartmentsPage';
import EmployeesPage from './pages/EmployeesPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SimulatorPage from './pages/SimulatorPage';
import WalletsPage from './pages/WalletsPage';
import './styles.css';

function Routing() {
  const { me, loading } = useAuth();
  if (loading) return <div className="boot">Loading…</div>;
  if (!me) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="company" element={<CompanyPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="cards/:id" element={<CardDetailPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routing />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
