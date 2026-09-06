// src/pages/SubscriptionsList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';

export default function SubscriptionsList() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSubs = () => {
    setLoading(true);
    const params = { page, limit };
    if (search) params.search = search;
    api.get('/subscriptions', { params })
      .then(r => {
        if (r.data && r.data.data) {
          setSubs(r.data.data);
          setTotal(r.data.total);
          setTotalPages(r.data.totalPages);
        } else {
          setSubs(Array.isArray(r.data) ? r.data : []);
          setTotal(r.data?.length || 0);
          setTotalPages(1);
        }
      })
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSubs(); }, [page, limit, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const handleLimitChange = (l) => { setLimit(l); setPage(1); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          <p className="page-subtitle">{total} subscriptions</p>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-4 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search by customer, product, plan, status..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="input max-w-sm flex-1"
        />
        <button type="submit" className="btn-secondary btn-sm">Search</button>
        {search && (
          <button type="button" onClick={handleClear} className="btn-ghost btn-sm text-slate-400">Clear</button>
        )}
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Product</th>
              <th>Plan</th>
              <th>Cycle</th>
              <th>Next Bill</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">Loading...</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">No subscriptions yet</td></tr>
            ) : subs.map(s => (
              <tr key={s.id}>
                <td>{s.customer_name}</td>
                <td className="text-sm">{s.product_name}</td>
                <td className="text-slate-400 text-sm">{s.plan_name}</td>
                <td className="text-slate-400 text-sm capitalize">{s.billing_cycle}</td>
                <td className="font-mono text-sm">{s.next_bill_date}</td>
                <td>
                  <span className={`badge ${s.status === 'active' ? 'badge-approved' : s.status === 'cancelled' ? 'badge-rejected' : 'badge-pending'}`}>
                    {s.status}
                  </span>
                </td>
                <td><Link to={`/subscriptions/${s.id}`} className="btn-ghost btn-sm text-indigo-400">View →</Link></td>
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
