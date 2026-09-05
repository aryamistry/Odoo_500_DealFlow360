// src/pages/ApprovalsList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function ApprovalsList() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/approvals')
      .then(r => setApprovals(r.data))
      .catch(e => toast.error(e.response?.data?.error || 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pending Approvals</h1>
          <p className="page-subtitle">{approvals.length} items requiring action</p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Customer</th>
              <th>Rep</th>
              <th>Amount</th>
              <th>Risk</th>
              <th>Role Required</th>
              <th>Step</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">Loading...</td></tr>
            ) : approvals.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">No pending approvals 🎉</td></tr>
            ) : approvals.map(a => (
              <tr key={a.id}>
                <td><Link to={`/approvals/${a.quotation_id}`} className="text-indigo-400 hover:underline font-mono text-xs">{a.quote_number}</Link></td>
                <td>{a.customer_name}</td>
                <td className="text-slate-400">{a.rep_name}</td>
                <td className="font-mono text-sm">₹{parseFloat(a.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td>{a.risk_level && <span className={`badge badge-${a.risk_level}`}>{a.risk_level}</span>}</td>
                <td className="text-slate-300 text-sm">{a.approver_role?.replace(/_/g, ' ')}</td>
                <td className="text-slate-500 text-sm">{a.step_order}</td>
                <td>
                  <Link to={`/approvals/${a.quotation_id}`} className="btn-primary btn-sm">Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
