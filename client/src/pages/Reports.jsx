// src/pages/Reports.jsx
import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import Pagination from '../components/Pagination';

export default function Reports() {
  const [data, setData] = useState([]);
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ reps: [], categories: [] });
  const [filters, setFilters] = useState({ from: '', to: '', status: '', rep_id: '', category_id: '' });

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const loadFilterOptions = () => {
    api.get('/reports/filter-options')
      .then(r => setFilterOptions(r.data))
      .catch(() => {});
  };

  const fetchReport = (pageOverride = page, limitOverride = limit) => {
    if (filters.from && filters.to && filters.from > filters.to) {
      toast.error('From date must be before or equal to To date');
      return;
    }
    setLoading(true);
    const params = { page: pageOverride, limit: limitOverride };
    Object.keys(filters).forEach(k => {
      if (filters[k]) params[k] = filters[k];
    });

    const unpaginatedParams = {};
    Object.keys(filters).forEach(k => {
      if (filters[k]) unpaginatedParams[k] = filters[k];
    });

    Promise.all([
      api.get('/reports', { params }),
      api.get('/reports', { params: unpaginatedParams })
    ])
      .then(([paginatedRes, fullRes]) => {
        if (paginatedRes.data && paginatedRes.data.data) {
          setData(paginatedRes.data.data);
          setTotal(paginatedRes.data.total);
          setTotalPages(paginatedRes.data.totalPages);
        } else {
          setData(Array.isArray(paginatedRes.data) ? paginatedRes.data : []);
          setTotal(paginatedRes.data?.length || 0);
          setTotalPages(1);
        }

        const fullRows = Array.isArray(fullRes.data) ? fullRes.data : (fullRes.data?.data || []);
        setAllData(fullRows);
      })
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    fetchReport(page, limit);
  }, [page, limit]);

  const handleFilterSubmit = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    fetchReport(1, limit);
  };

  const sourceData = allData.length > 0 ? allData : data;
  const totalRevenue = sourceData.reduce((s, r) => s + parseFloat(r.total_revenue || 0), 0);
  const totalMargin = sourceData.reduce((s, r) => s + parseFloat(r.total_margin || 0), 0);
  const totalQuotes = sourceData.reduce((s, r) => s + parseInt(r.quote_count || 0), 0);

  const exportCSV = () => {
    const exportRows = allData.length > 0 ? allData : data;
    if (exportRows.length === 0) return toast.error('No data to export');
    const headers = ['Status', 'Risk Level', 'Quote Count', 'Total Revenue', 'Total Margin', 'Avg Discount %'];
    const rows = exportRows.map(r => [
      r.status,
      r.risk_level || '',
      r.quote_count,
      parseFloat(r.total_revenue || 0).toFixed(2),
      parseFloat(r.total_margin || 0).toFixed(2),
      parseFloat(r.avg_discount_pct || 0).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dealflow360_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const exportXLSX = () => {
    const exportRows = allData.length > 0 ? allData : data;
    if (exportRows.length === 0) return toast.error('No data to export');
    const rows = exportRows.map(r => ({
      'Status': r.status || '',
      'Risk Level': r.risk_level || '',
      'Quote Count': parseInt(r.quote_count || 0),
      'Total Revenue (₹)': parseFloat(r.total_revenue || 0),
      'Total Margin (₹)': parseFloat(r.total_margin || 0),
      'Avg Discount (%)': parseFloat(r.avg_discount_pct || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-fit column widths
    const colWidths = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 14) }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DealFlow360 Report');
    XLSX.writeFile(wb, `dealflow360_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('XLSX exported');
  };

  const exportPDF = () => {
    window.print();
  };

  return (
    <div>
      <div className="page-header flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="page-title">Executive Reports & Analytics</h1>
          <p className="text-xs text-slate-400 mt-1">Cross-pipeline revenue, blended margin, and discount governance metrics</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary btn-sm">⬇ Export CSV</button>
          <button onClick={exportXLSX} className="btn-secondary btn-sm">📊 Export XLSX</button>
          <button onClick={exportPDF} className="btn-secondary btn-sm">🖨 Print / PDF</button>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilterSubmit} className="card mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div className="form-group">
          <label className="label">From Date</label>
          <input type="date" className="input" value={filters.from} onChange={e => setFilters(f => ({...f, from: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="label">To Date</label>
          <input type="date" className="input" value={filters.to} onChange={e => setFilters(f => ({...f, to: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="label">Status</label>
          <select className="select" value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))}>
            <option value="">All statuses</option>
            {['draft','pending_approval','approved','under_negotiation','confirmed','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Sales Rep / Team</label>
          <select className="select" value={filters.rep_id} onChange={e => setFilters(f => ({...f, rep_id: e.target.value}))}>
            <option value="">All Sales Reps</option>
            {filterOptions.reps.map(r => (
              <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Category</label>
          <div className="flex gap-2">
            <select className="select flex-1" value={filters.category_id} onChange={e => setFilters(f => ({...f, category_id: e.target.value}))}>
              <option value="">All Categories</option>
              {filterOptions.categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary whitespace-nowrap">Filter</button>
          </div>
        </div>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><span className="stat-label">Total Quotations</span><span className="stat-value">{totalQuotes}</span></div>
        <div className="stat-card"><span className="stat-label">Total Revenue</span><span className="stat-value">₹{totalRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
        <div className="stat-card"><span className="stat-label">Total Margin</span><span className="stat-value text-emerald-400">₹{totalMargin.toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
      </div>

      {/* Chart */}
      {sourceData.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold mb-4">Revenue & Margin by Status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sourceData}>
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

      {/* Pagination Bar */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={newPage => setPage(newPage)}
        onLimitChange={newLimit => {
          setLimit(newLimit);
          setPage(1);
        }}
        pageSizeOptions={[5, 10, 25, 50]}
      />
    </div>
  );
}
