// src/pages/SubscriptionDetail.jsx
// Phase 7+8 — Subscription detail, mid-cycle modification, and cancellation
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function SubscriptionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModify, setShowModify] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [modifyForm, setModifyForm] = useState({ next_bill_date: '', reason: '' });
  const [cancelForm, setCancelForm] = useState({ reason: '' });

  const fetchSub = () => {
    api.get(`/subscriptions/${id}`)
      .then(r => setSub(r.data))
      .catch(() => toast.error('Failed to load subscription'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSub(); }, [id]);

  const canManage = ['admin', 'finance', 'sales_manager'].includes(user?.role);

  const handleModify = async () => {
    if (!modifyForm.next_bill_date) return toast.error('Next bill date is required');
    const today = new Date().toISOString().slice(0, 10);
    if (modifyForm.next_bill_date < today) {
      return toast.error('Next bill date cannot be set in the past');
    }
    try {
      await api.patch(`/subscriptions/${id}`, modifyForm);
      toast.success('Subscription billing date updated');
      setShowModify(false);
      setModifyForm({ next_bill_date: '', reason: '' });
      fetchSub();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to update subscription'); }
  };

  const handleCancel = async () => {
    const reason = cancelForm.reason.trim();
    if (!reason) return toast.error('Please provide a reason for cancellation');
    if (!confirm(`Cancel this subscription? This action cannot be undone.`)) return;
    try {
      await api.post(`/subscriptions/${id}/cancel`, { reason });
      toast.success('Subscription cancelled');
      setShowCancel(false);
      fetchSub();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to cancel subscription'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;
  if (!sub) return <div className="text-red-400">Subscription not found</div>;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscription #{sub.id}</h1>
          <p className="text-slate-500 text-sm mt-1">{sub.product_name} · {sub.plan_name}</p>
        </div>
        {canManage && sub.status === 'active' && (
          <div className="flex gap-3">
            <button onClick={() => setShowModify(!showModify)} className="btn-secondary">Modify Billing</button>
            <button onClick={() => setShowCancel(!showCancel)} className="btn-danger">Cancel Subscription</button>
          </div>
        )}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="stat-label">Status</span>
          <span className={`badge ${sub.status === 'active' ? 'badge-approved' : sub.status === 'cancelled' ? 'badge-rejected' : 'badge-pending'}`}>{sub.status}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Customer</span>
          <span className="stat-value text-base">{sub.customer_name}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Billing Cycle</span>
          <span className="stat-value text-base capitalize">{sub.billing_cycle || '—'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Next Bill Date</span>
          <span className="stat-value text-base font-mono">{sub.next_bill_date || '—'}</span>
        </div>
      </div>

      {/* Plan info */}
      <div className="card">
        <h2 className="font-semibold text-slate-200 mb-4">Plan Details</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500 mb-1">Plan Name</p>
            <p className="text-slate-200">{sub.plan_name || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Proration Rule</p>
            <p className="text-slate-200 capitalize">{sub.proration_rule || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Cancellation Rule</p>
            <p className="text-slate-200 capitalize">{sub.cancellation_rule || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Refund Rule</p>
            <p className="text-slate-200 capitalize">{sub.refund_rule || '—'}</p>
          </div>
          {sub.cancelled_at && (
            <div>
              <p className="text-slate-500 mb-1">Cancelled At</p>
              <p className="text-red-400">{new Date(sub.cancelled_at).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mid-cycle modification form */}
      {showModify && (
        <div className="card border border-amber-700/40">
          <h2 className="font-semibold text-amber-400 mb-4">Mid-Cycle Billing Modification</h2>
          <div className="space-y-4">
            <div className="form-group">
              <label className="label">New Next Bill Date *</label>
              <input type="date" className="input" value={modifyForm.next_bill_date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setModifyForm(f => ({ ...f, next_bill_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Reason / Notes</label>
              <input type="text" className="input" placeholder="e.g. Customer requested billing adjustment"
                value={modifyForm.reason}
                onChange={e => setModifyForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button onClick={handleModify} className="btn-primary">Apply Change</button>
              <button onClick={() => setShowModify(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation form */}
      {showCancel && (
        <div className="card border border-red-700/40">
          <h2 className="font-semibold text-red-400 mb-4">Cancel Subscription</h2>
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">
              Cancelling will mark the subscription as cancelled and optionally issue a credit note.
              Per the plan's <strong className="text-slate-300">{sub.cancellation_rule}</strong> rule.
            </p>
            <div className="form-group">
              <label className="label">Reason for Cancellation *</label>
              <textarea className="input h-20" placeholder="Enter reason..."
                value={cancelForm.reason}
                onChange={e => setCancelForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button onClick={handleCancel} className="btn-danger">Confirm Cancellation</button>
              <button onClick={() => setShowCancel(false)} className="btn-secondary">Keep Active</button>
            </div>
          </div>
        </div>
      )}

      {/* Linked invoices */}
      <div className="card">
        <h2 className="font-semibold text-slate-200 mb-4">Linked Invoices</h2>
        {sub.invoices?.length === 0 ? (
          <p className="text-slate-500 text-sm">No invoices generated yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {sub.invoices?.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-mono text-xs text-indigo-400">{inv.invoice_number}</td>
                    <td className="font-mono text-sm">₹{parseFloat(inv.amount).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`badge ${inv.status === 'paid' ? 'badge-approved' : inv.status === 'partially_paid' ? 'badge-pending' : 'badge-rejected'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="text-slate-400 text-xs">{inv.due_date}</td>
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
