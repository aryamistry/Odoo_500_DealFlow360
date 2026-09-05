// src/pages/SubscriptionsList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function SubscriptionsList() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/subscriptions').then(r => setSubs(r.data)).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Subscriptions</h1></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Customer</th><th>Product</th><th>Plan</th><th>Cycle</th><th>Next Bill</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-8 text-slate-500">Loading...</td></tr>
              : subs.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-slate-500">No subscriptions yet</td></tr>
              : subs.map(s => (
              <tr key={s.id}>
                <td>{s.customer_name}</td>
                <td className="text-sm">{s.product_name}</td>
                <td className="text-slate-400 text-sm">{s.plan_name}</td>
                <td className="text-slate-400 text-sm capitalize">{s.billing_cycle}</td>
                <td className="font-mono text-sm">{s.next_bill_date}</td>
                <td><span className={`badge ${s.status==='active'?'badge-approved':s.status==='cancelled'?'badge-rejected':'badge-pending'}`}>{s.status}</span></td>
                <td><Link to={`/subscriptions/${s.id}`} className="btn-ghost btn-sm text-indigo-400">View →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
