// src/pages/QuotationsList.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['', 'draft', 'pending_approval', 'approved', 'under_negotiation', 'confirmed', 'rejected'];

function StatusBadge({ status }) {
  const cls = {
    draft: 'badge-draft', pending_approval: 'badge-pending', approved: 'badge-approved',
    confirmed: 'badge-confirmed', rejected: 'badge-rejected', under_negotiation: 'badge-negotiation'
  };
  return <span className={`badge ${cls[status] || 'badge-draft'}`}>{status?.replace(/_/g, ' ')}</span>;
}

export default function QuotationsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [customers, setCustomers] = useState([]);
  const [creating, setCreating] = useState(searchParams.get('new') === 'true');
  const [newCustomerId, setNewCustomerId] = useState('');

  const fetchQuotes = () => {
    setLoading(true);
    api.get('/quotations', { params: status ? { status } : {} })
      .then(r => setQuotes(r.data))
      .catch(e => toast.error(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchQuotes(); }, [status]);

  useEffect(() => {
    api.get('/admin/products').then(() => {}).catch(() => {});
    // Fetch customers for the create form
    api.get('/admin/customer-tiers').then(() => {}).catch(() => {});
    fetch('/api/auth/me', { credentials: 'include' }).then(() => {}).catch(() => {});
    // Simple hack: get customers via quotations context
    api.get('/quotations').then(r => {
      const unique = {};
      r.data.forEach(q => { if (!unique[q.customer_id]) unique[q.customer_id] = { id: q.customer_id, name: q.customer_name }; });
      setCustomers(Object.values(unique));
    }).catch(() => {});
  }, []);

  const createQuote = async () => {
    if (!newCustomerId) return toast.error('Select a customer');
    try {
      const r = await api.post('/quotations', { customer_id: parseInt(newCustomerId) });
      toast.success('Quotation created');
      navigate(`/quotations/${r.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Quotations</h1>
          <p className="page-subtitle">{quotes.length} quotations</p>
        </div>
        {(user?.role !== 'finance') && (
          <button onClick={() => setCreating(!creating)} className="btn-primary">+ New Quotation</button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="card mb-6 flex gap-3 items-end">
          <div className="form-group flex-1">
            <label className="label">Select Customer</label>
            <select className="select" value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)}>
              <option value="">-- Choose customer --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={createQuote} className="btn-primary">Create</button>
          <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`btn-sm btn ${status === s ? 'btn-primary' : 'btn-secondary'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Customer</th>
              <th>Rep</th>
              <th>Lines</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">Loading...</td></tr>
            ) : quotes.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">No quotations found</td></tr>
            ) : quotes.map(q => (
              <tr key={q.id}>
                <td><Link to={`/quotations/${q.id}`} className="text-indigo-400 hover:underline font-mono text-xs">{q.quote_number}</Link></td>
                <td>{q.customer_name}</td>
                <td className="text-slate-400">{q.rep_name}</td>
                <td className="text-slate-400">{q.line_count}</td>
                <td className="font-mono text-sm">₹{parseFloat(q.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td><StatusBadge status={q.status} /></td>
                <td>{q.risk_level && <span className={`badge badge-${q.risk_level}`}>{q.risk_level}</span>}</td>
                <td className="text-slate-500 text-xs">{new Date(q.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
