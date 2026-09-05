// src/pages/ApprovalDetail.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function ApprovalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  const fetchData = () => {
    api.get(`/approvals/${id}`)
      .then(r => setData(r.data))
      .catch(e => toast.error(e.response?.data?.error || 'Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);

  const act = async (stepId, action) => {
    const confirmMsg = { approve: 'Approve this quotation?', reject: 'Reject this quotation?', return: 'Return for revision?' };
    if (!confirm(confirmMsg[action])) return;
    try {
      await api.post(`/approvals/steps/${stepId}/${action}`, { note });
      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)}d!`);
      setNote('');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;
  if (!data) return <div className="text-red-400">Not found</div>;

  const pendingStep = data.steps?.find(s => {
    if (s.status !== 'pending') return false;
    if (user?.role === 'admin') return true;
    return s.approver_role === user?.role;
  });

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        {/* Header */}
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-lg font-semibold font-mono">{data.quote_number}</h1>
            <span className={`badge badge-${data.status}`}>{data.status?.replace(/_/g,' ')}</span>
            {data.risk_level && <span className={`badge badge-${data.risk_level}`}>{data.risk_level} risk</span>}
          </div>
          <p className="text-slate-400 text-sm">{data.customer_name} · Rep: {data.rep_name}</p>
        </div>

        {/* Lines */}
        <div className="card">
          <h2 className="font-semibold mb-4">Line Items</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Product</th><th>Category</th><th>Unit Price</th><th>Qty</th><th>Discount %</th><th>Ceiling</th><th>Line Total</th></tr>
              </thead>
              <tbody>
                {data.lines?.map(l => {
                  const ceiling = Math.min(parseFloat(l.category_ceiling || 100), parseFloat(l.tier_ceiling || 100));
                  const breached = parseFloat(l.discount_pct) > ceiling;
                  const total = parseFloat(l.unit_price) * (1 - parseFloat(l.discount_pct)/100) * l.quantity;
                  return (
                    <tr key={l.id}>
                      <td className="font-medium text-sm">{l.product_name}</td>
                      <td className="text-slate-400 text-xs">{l.category_name}</td>
                      <td className="font-mono text-sm">₹{parseFloat(l.unit_price).toLocaleString('en-IN')}</td>
                      <td>{l.quantity}</td>
                      <td className={breached ? 'text-red-400 font-medium' : ''}>{l.discount_pct}%{breached && ' ⚠'}</td>
                      <td className="text-slate-500 text-xs">{ceiling}%</td>
                      <td className="font-mono text-sm">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action */}
        {pendingStep && (
          <div className="card">
            <h2 className="font-semibold mb-4">Your Decision</h2>
            <div className="form-group mb-4">
              <label className="label">Note / Reason</label>
              <textarea className="input h-20" placeholder="Optional note..." value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => act(pendingStep.id, 'approve')} className="btn-success">✓ Approve</button>
              <button onClick={() => act(pendingStep.id, 'return')} className="btn-secondary">↩ Return for Revision</button>
              <button onClick={() => act(pendingStep.id, 'reject')} className="btn-danger">✕ Reject</button>
            </div>
          </div>
        )}

        {/* Activity */}
        <div className="card">
          <h2 className="font-semibold mb-4">Activity Feed</h2>
          <div className="space-y-3">
            {data.activity?.map(a => (
              <div key={a.id} className="flex gap-3 text-sm">
                <span className="text-slate-500 text-xs w-36 flex-shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                <div>
                  <span className="text-indigo-400 font-medium capitalize">{a.action?.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500"> · {a.actor_name || a.actor_company || 'System'}</span>
                  {a.note && <p className="text-slate-400 text-xs mt-0.5">{a.note}</p>}
                </div>
              </div>
            ))}
            {!data.activity?.length && <p className="text-slate-500 text-sm">No activity yet.</p>}
          </div>
        </div>
      </div>

      {/* Steps panel */}
      <div>
        <div className="card">
          <h2 className="font-semibold mb-4">Approval Steps</h2>
          <div className="space-y-3">
            {data.steps?.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium capitalize">{s.approver_role?.replace(/_/g,' ')}</p>
                  <p className="text-xs text-slate-500">Step {s.step_order}</p>
                </div>
                <span className={`badge ${s.status==='pending'?'badge-pending':s.status==='approved'?'badge-approved':s.status==='rejected'?'badge-rejected':'badge-draft'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
