// src/pages/Customers.jsx
// Customer Management — full CRUD for the DealFlow360 customer entity.
import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { useRefData } from '../context/RefDataContext';

function TierBadge({ tier }) {
  const cls = { Gold: 'badge-approved', Silver: 'badge-pending', Bronze: 'badge-draft' };
  return <span className={`badge ${cls[tier] || 'badge-draft'}`}>{tier}</span>;
}

function CustomerForm({ tiers, onSave, onCancel, initial = null }) {
  const [form, setForm] = useState({
    company_name: initial?.company_name || '',
    email: initial?.email || '',
    tier: initial?.tier || (tiers[0]?.tier || ''),
    password: '',
  });
  const isEdit = !!initial;

  const handle = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    if (!form.company_name.trim()) return toast.error('Company name required');
    if (!isEdit && !form.email.trim()) return toast.error('Email required');
    if (!form.tier) return toast.error('Tier required');
    try {
      if (isEdit) {
        const patch = { company_name: form.company_name, tier: form.tier };
        const r = await api.patch(`/admin/customers/${initial.id}`, patch);
        onSave(r.data);
        toast.success('Customer updated');
      } else {
        const body = { company_name: form.company_name, email: form.email, tier: form.tier };
        if (form.password) body.password = form.password;
        const r = await api.post('/admin/customers', body);
        onSave(r.data);
        toast.success('Customer created');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="card mb-6">
      <h2 className="font-semibold text-slate-200 mb-4">{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="form-group">
          <label className="label">Company Name *</label>
          <input className="input" value={form.company_name} onChange={handle('company_name')} placeholder="Acme Corp" />
        </div>
        {!isEdit && (
          <div className="form-group">
            <label className="label">Email *</label>
            <input type="email" className="input" value={form.email} onChange={handle('email')} placeholder="contact@acme.com" />
          </div>
        )}
        <div className="form-group">
          <label className="label">Tier *</label>
          <select className="select" value={form.tier} onChange={handle('tier')}>
            {tiers.map(t => (
              <option key={t.tier} value={t.tier}>
                {t.tier} — max {t.max_discount_pct}% discount
              </option>
            ))}
          </select>
        </div>
        {!isEdit && (
          <div className="form-group">
            <label className="label">Portal Password <span className="text-slate-500">(optional)</span></label>
            <input type="password" className="input" value={form.password} onChange={handle('password')} placeholder="Leave blank if no portal access" />
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={submit} className="btn-primary">{isEdit ? 'Save Changes' : 'Create Customer'}</button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );
}

export default function Customers() {
  const { user } = useAuth();
  const { tiers: tiersRaw, invalidate: invalidateRefData } = useRefData();
  const tiers = tiersRaw || [];
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Search/filter state (server-side)
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterTier, setFilterTier] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);


  // Tiers come from RefDataContext (cached 5 min) — no per-mount fetch needed.

  const load = () => {
    setLoading(true);
    const params = { page, limit };
    if (search) params.search = search;
    if (filterTier) params.tier = filterTier;
    api.get('/admin/customers', { params })
      .then(r => {
        if (r.data?.data) {
          setCustomers(r.data.data);
          setTotal(r.data.total);
          setTotalPages(r.data.totalPages);
        } else {
          const arr = Array.isArray(r.data) ? r.data : [];
          setCustomers(arr);
          setTotal(arr.length);
          setTotalPages(1);
        }
      })
      .catch(e => toast.error(e.response?.data?.error || 'Failed to load customers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, limit, search, filterTier]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleTierChange = (v) => { setFilterTier(v); setPage(1); };
  const handleLimitChange = (l) => { setLimit(l); setPage(1); };

  const handleCreated = (newCustomer) => {
    setCreating(false);
    setPage(1);
    load();
  };

  const handleUpdated = (updated) => {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    setEditingId(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">{total} customers</p>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); }}
            className="btn-primary"
          >
            + New Customer
          </button>
        )}
      </div>

      {creating && (
        <CustomerForm
          tiers={tiers}
          onSave={handleCreated}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          className="input flex-1 max-w-xs"
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <button type="submit" className="btn-secondary btn-sm">Search</button>
        <select className="select w-36" value={filterTier} onChange={e => handleTierChange(e.target.value)}>
          <option value="">All Tiers</option>
          {tiers.map(t => <option key={t.tier} value={t.tier}>{t.tier}</option>)}
        </select>
        {(search || filterTier) && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => { setSearch(''); setSearchInput(''); setFilterTier(''); setPage(1); }}>
            Clear
          </button>
        )}
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Email</th>
              <th>Tier</th>
              <th>Max Discount</th>
              <th>Created</th>
              {(user?.role === 'admin' || user?.role === 'sales_manager') && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">No customers found</td></tr>
            ) : customers.map(c => (
              c.id === editingId ? (
                <tr key={c.id}>
                  <td colSpan={6} className="p-0">
                    <div className="p-4">
                      <CustomerForm
                        tiers={tiers}
                        initial={c}
                        onSave={handleUpdated}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td className="font-medium text-slate-200">{c.company_name}</td>
                  <td className="text-slate-400 text-sm">{c.email}</td>
                  <td><TierBadge tier={c.tier} /></td>
                  <td className="text-slate-400 text-sm">{c.tier_max_discount_pct}%</td>
                  <td className="text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  {(user?.role === 'admin' || user?.role === 'sales_manager') && (
                    <td>
                      <button
                        onClick={() => { setEditingId(c.id); setCreating(false); }}
                        className="btn-secondary btn-sm"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              )
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
