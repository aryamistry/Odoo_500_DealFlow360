// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@dealflow.com', pass: 'Admin@123' },
  { label: 'Sales Rep', email: 'rep@dealflow.com', pass: 'Rep@123' },
  { label: 'Sales Manager', email: 'manager@dealflow.com', pass: 'Manager@123' },
  { label: 'Finance', email: 'finance@dealflow.com', pass: 'Finance@123' },
  { label: 'Customer', email: 'acme@customer.com', pass: 'Customer@123' },
];

/**
 * Normalizes role string and computes the initial destination URL.
 * The backend database is the single source of truth for the role.
 */
export function getDestinationForRole(user) {
  if (!user) return '/login';
  if (user.customerId) return '/portal';

  const role = String(user.role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  switch (role) {
    case 'customer':
    case 'client':
      return '/portal';

    case 'admin':
    case 'administrator':
      return '/admin';

    case 'sales_manager':
    case 'salesmanager':
    case 'manager':
      return '/manager';

    case 'finance':
    case 'finance_manager':
      return '/finance';

    case 'sales_rep':
    case 'salesrep':
    case 'sales_representative':
    case 'salesrepresentative':
    case 'rep':
    default:
      return '/';
  }
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect directly to the appropriate workspace
  if (user) {
    return <Navigate to={getDestinationForRole(user)} replace />;
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return toast.error('Please enter your email address');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return toast.error('Please enter a valid email address (e.g. user@dealflow.com)');
    }
    if (!password) {
      return toast.error('Please enter your password');
    }

    setLoading(true);
    try {
      // Calls unified POST /auth/login — backend inspects credentials and returns role
      const authenticatedUser = await login(cleanEmail, password);
      const destination = getDestinationForRole(authenticatedUser);
      toast.success(`Welcome, ${authenticatedUser.name || authenticatedUser.companyName || 'User'}!`);
      navigate(destination);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // Demo accounts helper: ONLY fills email/password input fields (does NOT assign role/type)
  const handleQuickFill = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-400 tracking-tight">
            DealFlow<span className="text-slate-100">360</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Unified Quotation-to-Cash Platform</p>
        </div>

        <div className="card shadow-2xl border-slate-800">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-100">Sign In</h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your credentials to access your workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="input text-sm"
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input text-sm"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              id="login-btn"
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 font-medium text-sm transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo Accounts (Helper to auto-fill inputs only) */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Demo Accounts
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickFill(acc.email, acc.pass)}
                  className="text-left p-2 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-700 text-xs transition-all hover:scale-[1.02] cursor-pointer"
                  title={`Click to fill ${acc.email}`}
                >
                  <div className="font-semibold text-slate-200 truncate">{acc.label}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{acc.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
