// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCustomer, setIsCustomer] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password, isCustomer);
      if (user.customerId || isCustomer) {
        navigate('/portal');
      } else {
        navigate('/');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-400">DealFlow<span className="text-slate-100">360</span></h1>
          <p className="text-slate-500 mt-2 text-sm">Quotation-to-cash engine</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-6">
            {isCustomer ? 'Customer Portal' : 'Internal Login'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button id="login-btn" type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800">
            <button
              onClick={() => setIsCustomer(!isCustomer)}
              className="btn-ghost text-xs w-full justify-center"
            >
              {isCustomer ? '← Back to internal login' : 'Customer Portal →'}
            </button>
          </div>
        </div>

        {/* Demo credentials */}
        <div className="mt-4 card-sm text-xs text-slate-500 space-y-1">
          <p className="text-slate-400 font-medium mb-2">Demo credentials</p>
          <p>Admin: admin@dealflow.com / Admin@123</p>
          <p>Rep: rep@dealflow.com / Rep@123</p>
          <p>Manager: manager@dealflow.com / Manager@123</p>
          <p>Finance: finance@dealflow.com / Finance@123</p>
          <p>Customer: acme@customer.com / Customer@123</p>
        </div>
      </div>
    </div>
  );
}
