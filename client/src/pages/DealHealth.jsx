// src/pages/DealHealth.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function DealHealth() {
  const [stalled, setStalled] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [slippage, setSlippage] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/deal-health/stalled').catch(() => ({ data: [] })),
      api.get('/deal-health/discount-anomalies').catch(() => ({ data: [] })),
      api.get('/deal-health/delivery-slippage').catch(() => ({ data: [] })),
    ]).then(([s, a, sl]) => {
      setStalled(s.data);
      setAnomalies(a.data);
      setSlippage(sl.data);
    }).finally(() => setLoading(false));
  }, []);

  const escalate = async (quotationId) => {
    try {
      await api.post(`/deal-health/escalate/${quotationId}`, { note: 'Escalated from Deal Health dashboard' });
      toast.success('Escalated!');
    } catch (e) { toast.error('Failed'); }
  };

  const nudge = async (quotationId) => {
    try {
      await api.post(`/deal-health/nudge/${quotationId}`, { note: 'Nudge sent from Deal Health dashboard' });
      toast.success('Nudge sent!');
    } catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Deal Health Dashboard</h1></div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card border-l-4 border-amber-500"><span className="stat-label">Stalled Deals</span><span className="stat-value text-amber-400">{stalled.length}</span></div>
        <div className="stat-card border-l-4 border-red-500"><span className="stat-label">Discount Anomalies</span><span className="stat-value text-red-400">{anomalies.length}</span></div>
        <div className="stat-card border-l-4 border-purple-500"><span className="stat-label">Delivery Slippage</span><span className="stat-value text-purple-400">{slippage.length}</span></div>
      </div>

      {/* Stalled Deals */}
      <div className="card">
        <h2 className="font-semibold mb-4 text-amber-400">⏸ Stalled Deals (&gt;7 days inactive)</h2>
        {loading ? <p className="text-slate-500 text-sm">Loading...</p> : stalled.length === 0 ? <p className="text-slate-500 text-sm">No stalled deals 🎉</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Quote #</th><th>Customer</th><th>Rep</th><th>Amount</th><th>Status</th><th>Days Stalled</th><th>Actions</th></tr></thead>
              <tbody>
                {stalled.map(d => (
                  <tr key={d.id}>
                    <td><Link to={`/quotations/${d.id}`} className="text-indigo-400 hover:underline font-mono text-xs">{d.quote_number}</Link></td>
                    <td>{d.customer_name}</td>
                    <td className="text-slate-400">{d.rep_name}</td>
                    <td className="font-mono text-sm">₹{parseFloat(d.total_amount||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                    <td><span className="badge badge-draft">{d.status?.replace(/_/g,' ')}</span></td>
                    <td className="text-amber-400 font-semibold">{Math.floor(d.days_stalled)}d</td>
                    <td className="flex gap-2">
                      <button onClick={() => escalate(d.id)} className="btn-danger btn-sm">Escalate</button>
                      <button onClick={() => nudge(d.id)} className="btn-secondary btn-sm">Nudge</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Discount Anomalies */}
      <div className="card">
        <h2 className="font-semibold mb-4 text-red-400">⚠ Discount Anomalies (&gt;5% above rep avg)</h2>
        {loading ? <p className="text-slate-500 text-sm">Loading...</p> : anomalies.length === 0 ? <p className="text-slate-500 text-sm">No anomalies detected</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Quote #</th><th>Rep</th><th>Product</th><th>Current Disc %</th><th>Rep Avg %</th><th>Delta</th></tr></thead>
              <tbody>
                {anomalies.map(a => (
                  <tr key={a.line_id}>
                    <td className="font-mono text-xs text-indigo-400">{a.quote_number}</td>
                    <td>{a.rep_name}</td>
                    <td>{a.product_name}</td>
                    <td className="text-red-400 font-semibold">{a.discount_pct}%</td>
                    <td className="text-slate-400">{parseFloat(a.avg_hist_discount||0).toFixed(1)}%</td>
                    <td className="text-red-400 font-semibold">+{parseFloat(a.anomaly_delta).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delivery Slippage */}
      <div className="card">
        <h2 className="font-semibold mb-4 text-purple-400">📅 Delivery Slippage</h2>
        {loading ? <p className="text-slate-500 text-sm">Loading...</p> : slippage.length === 0 ? <p className="text-slate-500 text-sm">No delivery slippage</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Quote #</th><th>Customer</th><th>Promised</th><th>Actual</th><th>Slippage</th></tr></thead>
              <tbody>
                {slippage.map(s => (
                  <tr key={s.id}>
                    <td><Link to={`/quotations/${s.id}`} className="text-indigo-400 hover:underline font-mono text-xs">{s.quote_number}</Link></td>
                    <td>{s.customer_name}</td>
                    <td className="font-mono text-sm">{s.promised_delivery_date}</td>
                    <td className="font-mono text-sm">{new Date(s.actual_completion).toLocaleDateString()}</td>
                    <td className="text-purple-400 font-semibold">{Math.floor(s.slippage_days)}d late</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
