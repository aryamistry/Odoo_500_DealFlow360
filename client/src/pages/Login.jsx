// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@dealflow.com', pass: 'Admin@123', badge: 'Internal', color: 'text-rose-400 bg-rose-950/40 border-rose-800/50' },
  { label: 'Sales Rep', email: 'rep@dealflow.com', pass: 'Rep@123', badge: 'Internal', color: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/50' },
  { label: 'Sales Manager', email: 'manager@dealflow.com', pass: 'Manager@123', badge: 'Internal', color: 'text-blue-400 bg-blue-950/40 border-blue-800/50' },
  { label: 'Finance', email: 'finance@dealflow.com', pass: 'Finance@123', badge: 'Internal', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' },
  { label: 'Customer (Acme)', email: 'acme@customer.com', pass: 'Customer@123', badge: 'Portal', color: 'text-amber-400 bg-amber-950/40 border-amber-800/50' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-redirect if already logged in
  if (user) {
    if (user.customerId || user.role === 'customer') {
      return <Navigate to="/portal" replace />;
    }
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      return toast.error('Please enter both email and password');
    }

    setLoading(true);
    try {
      // Unified login: backend checks internal users then customer portal automatically
      const loggedUser = await login(email, password);
      if (loggedUser.customerId || loggedUser.role === 'customer') {
        toast.success(`Welcome to Customer Portal, ${loggedUser.companyName || 'Customer'}!`);
        navigate('/portal');
      } else {
        toast.success(`Welcome back, ${loggedUser.name}!`);
        navigate('/');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

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
          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full text-xs font-medium bg-indigo-950/70 border border-indigo-800/40 text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Internal Staff & Customer Portal Unified
          </div>
        </div>

        <div className="card shadow-2xl border-slate-800">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-100">Sign In</h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your email and password. The system will automatically direct you to your internal role workspace or customer portal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="input text-sm"
                placeholder="name@company.com or acme@customer.com"
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

          {/* Quick Fill Demo Credentials */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Quick Fill Demo Accounts
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickFill(acc.email, acc.pass)}
                  className={`text-left p-2 rounded-lg border text-xs transition-all hover:scale-[1.02] cursor-pointer ${acc.color}`}
                  title={`Click to fill ${acc.email}`}
                >
                  <div className="font-semibold truncate">{acc.label}</div>
                  <div className="text-[10px] opacity-75 font-mono truncate">{acc.email.split('@')[0]}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Hint */}
        <p className="text-center text-xs text-slate-500 mt-6">
          DealFlow360 automatically routes sales reps, managers, finance, admins, and portal customers based on authenticated account credentials.
        </p>
      </div>
    </div>
  );
}
