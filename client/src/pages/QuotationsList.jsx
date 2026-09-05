// src/pages/QuotationsList.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { useRefData } from '../context/RefDataContext';

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
  const { tiers: tiersRaw } = useRefData();
  const tiers = tiersRaw || [];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [customers, setCustomers] = useState([]);
  const [creating, setCreating] = useState(searchParams.get('new') === 'true');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [showNewCustModal, setShowNewCustModal] = useState(false);
  const [newCustForm, setNewCustForm] = useState({ company_name: '', email: '', tier: '', password: '' });
  const [submittingCust, setSubmittingCust] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchQuotes = () => {
    setLoading(true);
    const params = { page, limit };
    if (status) params.status = status;
    if (search) params.search = search;
    api.get('/quotations', { params })
      .then(r => {
        // Backend returns { data, total, page, totalPages } when page param is sent
        if (r.data && r.data.data) {
          setQuotes(r.data.data);
          setTotal(r.data.total);
          setTotalPages(r.data.totalPages);
        } else {
          setQuotes(Array.isArray(r.data) ? r.data : []);
          setTotal(r.data?.length || 0);
          setTotalPages(1);
        }
      })
      .catch(e => toast.error(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchQuotes(); }, [status, page, limit, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  // Reset to page 1 when filters change
  const handleStatusChange = (s) => { setStatus(s); setPage(1); };
  const handleLimitChange  = (l) => { setLimit(l); setPage(1); };

  useEffect(() => {
    // Load real customers from database via /admin/customers
    api.get('/admin/customers')
      .then(r => {
        const data = r.data?.data ?? r.data;
        setCustomers(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    // Tiers come from RefDataContext (cached) — no separate fetch needed.
  }, []);

  const handleCreateCustomerInline = async (e) => {
    if (e) e.preventDefault();
    if (!newCustForm.company_name.trim()) return toast.error('Company name required');
    if (!newCustForm.email.trim()) return toast.error('Email required');
    if (!newCustForm.tier) return toast.error('Tier required');

    setSubmittingCust(true);
    try {
      const payload = {
        company_name: newCustForm.company_name.trim(),
        email: newCustForm.email.trim(),
        tier: newCustForm.tier,
      };
      if (newCustForm.password) payload.password = newCustForm.password;

      const r = await api.post('/admin/customers', payload);
      const created = r.data;

      // Add to customers state and automatically select the new customer
      setCustomers(prev => [created, ...prev]);
      setNewCustomerId(created.id);
      setShowNewCustModal(false);
      setNewCustForm({ company_name: '', email: '', tier: tiers[0]?.tier || '', password: '' });
      toast.success(`Customer '${created.company_name}' created & selected`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create customer');
    } finally {
      setSubmittingCust(false);
    }
  };

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
          <p className="page-subtitle">{total} quotations</p>
        </div>
        {(user?.role !== 'finance') && (
          <button onClick={() => setCreating(!creating)} className="btn-primary">+ New Quotation</button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="card mb-6 border border-indigo-500/30 bg-slate-900/90 shadow-xl">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="form-group flex-1 w-full">
              <div className="flex justify-between items-center mb-1">
                <label className="label mb-0">Customer</label>
                <button
                  type="button"
                  onClick={() => setShowNewCustModal(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                >
                  + New Customer
                </button>
              </div>
              <select className="select w-full" value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)}>
                <option value="">-- Choose customer --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.company_name} ({c.tier || c.tier_name})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={createQuote} className="btn-primary flex-1 md:flex-initial">Proceed to Builder</button>
              <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>

          {/* Inline New Customer Modal / Sub-Card */}
          {showNewCustModal && (
            <div className="mt-4 pt-4 border-t border-slate-800 bg-slate-950/60 p-4 rounded-lg border border-slate-700/60 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                  <span>👤</span> Quick Add Customer
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNewCustModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-sm"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="form-group">
                  <label className="label text-xs">Company Name *</label>
                  <input
                    className="input text-sm py-1.5"
                    placeholder="e.g. Zenith Co"
                    value={newCustForm.company_name}
                    onChange={e => setNewCustForm(f => ({ ...f, company_name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="label text-xs">Email *</label>
                  <input
                    type="email"
                    className="input text-sm py-1.5"
                    placeholder="e.g. contact@zenith.com"
                    value={newCustForm.email}
                    onChange={e => setNewCustForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="label text-xs">Tier *</label>
                  <select
                    className="select text-sm py-1.5"
                    value={newCustForm.tier}
                    onChange={e => setNewCustForm(f => ({ ...f, tier: e.target.value }))}
                  >
                    {tiers.map(t => (
                      <option key={t.tier} value={t.tier}>
                        {t.tier} (max discount: {t.max_discount_pct}%)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label text-xs">Portal Password <span className="text-slate-500">(optional)</span></label>
                  <input
                    type="password"
                    className="input text-sm py-1.5"
                    placeholder="Optional login password"
                    value={newCustForm.password}
                    onChange={e => setNewCustForm(f => ({ ...f, password: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewCustModal(false)}
                  className="btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingCust}
                  onClick={handleCreateCustomerInline}
                  className="btn-primary btn-sm"
                >
                  {submittingCust ? 'Creating...' : 'Create & Select Customer'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          className="input flex-1 max-w-xs"
          placeholder="Search by quote number or customer…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <button type="submit" className="btn-secondary btn-sm">Search</button>
        {(search || status) && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => { setSearch(''); setSearchInput(''); setStatus(''); setPage(1); }}>
            Clear
          </button>
        )}
      </form>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={handleLimitChange}
      />
    </div>
  );
}

