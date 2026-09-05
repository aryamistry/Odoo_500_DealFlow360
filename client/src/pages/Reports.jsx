// src/pages/Reports.jsx
import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function Reports() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });

  const fetchReport = () => {
    setLoading(true);
    api.get('/reports', { params: filters })
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReport(); }, []);

  const totalRevenue = data.reduce((s, r) => s + parseFloat(r.total_revenue || 0), 0);
  const totalMargin = data.reduce((s, r) => s + parseFloat(r.total_margin || 0), 0);
  const totalQuotes = data.reduce((s, r) => s + parseInt(r.quote_count || 0), 0);

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Reports</h1></div>

      {/* Filters */}
      <div className="card mb-6 flex gap-4 items-end flex-wrap">
        <div className="form-group">
          <label className="label">From</label>
          <input type="date" className="input" value={filters.from} onChange={e => setFilters(f => ({...f, from: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="label">To</label>
          <input type="date" className="input" value={filters.to} onChange={e => setFilters(f => ({...f, to: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="label">Status</label>
          <select className="select" value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))}>
            <option value="">All statuses</option>
            {['draft','pending_approval','approved','confirmed','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={fetchReport} className="btn-primary">Apply Filters</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><span className="stat-label">Total Quotations</span><span className="stat-value">{totalQuotes}</span></div>
        <div className="stat-card"><span className="stat-label">Total Revenue</span><span className="stat-value">₹{totalRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
        <div className="stat-card"><span className="stat-label">Total Margin</span><span className="stat-value text-emerald-400">₹{totalMargin.toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
      </div>

      {/* Chart */}
      {data.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold mb-4">Revenue & Margin by Status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="status" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="total_revenue" name="Revenue" fill="#6366f1" radius={[4,4,0,0]} />
              <Bar dataKey="total_margin" name="Margin" fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Status</th><th>Risk Level</th><th>Quotes</th><th>Revenue</th><th>Margin</th><th>Avg Discount</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="text-center py-8 text-slate-500">Loading...</td></tr>
              : data.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-slate-500">No data</td></tr>
              : data.map((r, i) => (
              <tr key={i}>
                <td><span className="badge badge-draft capitalize">{r.status}</span></td>
                <td>{r.risk_level && <span className={`badge badge-${r.risk_level}`}>{r.risk_level}</span>}</td>
                <td>{r.quote_count}</td>
                <td className="font-mono text-sm">₹{parseFloat(r.total_revenue||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="font-mono text-sm text-emerald-400">₹{parseFloat(r.total_margin||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td>{parseFloat(r.avg_discount_pct||0).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
