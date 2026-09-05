// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';

function StatusBadge({ status }) {
  const cls = {
    draft: 'badge-draft', pending_approval: 'badge-pending', approved: 'badge-approved',
    confirmed: 'badge-confirmed', rejected: 'badge-rejected', under_negotiation: 'badge-negotiation'
  };
  return <span className={`badge ${cls[status] || 'badge-draft'}`}>{status?.replace(/_/g, ' ')}</span>;
}

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Confirmed', value: 'confirmed' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [status, setStatus] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Summary stats (load once on mount)
  useEffect(() => {
    api.get('/reports/summary')
      .then(s => setSummary(s.data))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  // Quotes with server-driven pagination
  const fetchQuotes = () => {
    setLoadingQuotes(true);
    const params = { page, limit };
    if (status) params.status = status;
    api.get('/quotations', { params })
      .then(r => {
        if (r.data && r.data.data) {
          setQuotes(r.data.data);
          setTotal(r.data.total);
          setTotalPages(r.data.totalPages);
        } else {
          const list = Array.isArray(r.data) ? r.data : [];
          setQuotes(list);
          setTotal(r.data?.total ?? list.length);
          setTotalPages(1);
        }
      })
      .catch(() => setQuotes([]))
      .finally(() => setLoadingQuotes(false));
  };

  useEffect(() => {
    fetchQuotes();
  }, [page, limit, status]);

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
  };

  const totalQuotes = summary?.quotations?.reduce((s, r) => s + parseInt(r.count), 0) || 0;
  const totalRevenue = summary?.invoices?.reduce((s, r) => s + parseFloat(r.sum || 0), 0) || 0;
  const activeSubscriptions = summary?.subscriptions?.find(r => r.status === 'active')?.count || 0;
  const unpaidInvoices = summary?.invoices?.find(r => r.status === 'unpaid')?.count || 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name}</p>
        </div>
        {(user?.role === 'sales_rep' || user?.role === 'admin') && (
          <Link to="/quotations?new=true" className="btn-primary">+ New Quotation</Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <span className="stat-label">Total Quotations</span>
          <span className="stat-value">{totalQuotes}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Billed</span>
          <span className="stat-value">₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Subscriptions</span>
          <span className="stat-value">{activeSubscriptions}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Unpaid Invoices</span>
          <span className="stat-value text-amber-400">{unpaidInvoices}</span>
        </div>
      </div>

      {/* Recent Quotations */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-200">Recent Quotations</h2>
            <p className="text-xs text-slate-400">{total} quotations total</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/quotations" className="btn-ghost btn-sm">View all →</Link>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => handleStatusChange(f.value)}
              className={`btn btn-xs ${status === f.value ? 'btn-primary' : 'btn-secondary'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loadingQuotes ? (
          <p className="text-slate-500 text-sm py-8 text-center">Loading...</p>
        ) : quotes.length === 0 ? (
          <p className="text-slate-500 text-sm py-8 text-center">
            No quotations found{status ? ` with status "${status.replace(/_/g, ' ')}"` : ''}.{' '}
            <Link to="/quotations" className="text-indigo-400">Create one</Link>
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Customer</th>
                  <th>Rep</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id}>
                    <td>
                      <Link to={`/quotations/${q.id}`} className="text-indigo-400 hover:underline font-mono text-xs">
                        {q.quote_number}
                      </Link>
                    </td>
                    <td className="text-sm">{q.customer_name}</td>
                    <td className="text-slate-400 text-sm">{q.rep_name}</td>
                    <td className="font-mono text-sm">₹{parseFloat(q.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>{q.risk_level && <span className={`badge badge-${q.risk_level}`}>{q.risk_level}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={handleLimitChange}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>
    </div>
  );
}
