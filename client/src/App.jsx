// src/App.jsx — Main router
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RefDataProvider } from './context/RefDataContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import QuotationsList from './pages/QuotationsList';
import QuotationDetail from './pages/QuotationDetail';
import ApprovalsList from './pages/ApprovalsList';
import ApprovalDetail from './pages/ApprovalDetail';
import FulfillmentList from './pages/FulfillmentList';
import FulfillmentDetail from './pages/FulfillmentDetail';
import SubscriptionsList from './pages/SubscriptionsList';
import SubscriptionDetail from './pages/SubscriptionDetail';
import InvoicesList from './pages/InvoicesList';
import InvoiceDetail from './pages/InvoiceDetail';
import DealHealth from './pages/DealHealth';
import Reports from './pages/Reports';
import AdminSettings from './pages/admin/AdminSettings';
import Customers from './pages/Customers';
import Portal from './pages/Portal';
import Layout from './components/Layout';

function ProtectedRoute({ children, roles, portalOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const isCust = Boolean(user.customerId || user.role === 'customer');
  if (isCust && !portalOnly) return <Navigate to="/portal" replace />;
  if (!isCust && portalOnly) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Customer Portal */}
      <Route path="/portal/*" element={
        <ProtectedRoute portalOnly={true}>
          <Portal />
        </ProtectedRoute>
      } />

      {/* Internal App */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="quotations" element={<QuotationsList />} />
        <Route path="quotations/new" element={<Navigate to="/quotations?new=true" replace />} />
        <Route path="quotations/:id" element={<QuotationDetail />} />
        <Route path="approvals" element={<ApprovalsList />} />
        <Route path="approvals/:id" element={<ApprovalDetail />} />
        <Route path="fulfillment" element={<FulfillmentList />} />
        <Route path="fulfillment/:id" element={<FulfillmentDetail />} />
        <Route path="subscriptions" element={<SubscriptionsList />} />
        <Route path="subscriptions/:id" element={<SubscriptionDetail />} />
        <Route path="invoices" element={<InvoicesList />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="deal-health" element={<DealHealth />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<AdminSettings />} />
        <Route path="manager" element={<Navigate to="/approvals" replace />} />
        <Route path="finance" element={<Navigate to="/invoices" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RefDataProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Toaster position="top-right" toastOptions={{ className: 'bg-slate-800 text-white border border-slate-700' }} />
          <AppRoutes />
        </BrowserRouter>
      </RefDataProvider>
    </AuthProvider>
  );
}
