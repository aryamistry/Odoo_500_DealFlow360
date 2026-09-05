// src/pages/InvoiceDetail.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState('');

  const fetchData = () => api.get(`/billing/invoices/${id}`).then(r => setInv(r.data)).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  useEffect(() => { fetchData(); }, [id]);

  const recordPayment = async () => {
    const val = parseFloat(payAmount);
    if (isNaN(val) || val <= 0) {
      return toast.error('Please enter a valid positive payment amount');
    }
    if (val > outstanding + 0.001) {
      return toast.error(`Payment amount cannot exceed outstanding balance of ₹${outstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
    }
    try {
      const r = await api.post(`/billing/invoices/${id}/pay`, { amount: val });
      toast.success(`Payment recorded! Status: ${r.data.status}`);
      setPayAmount('');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to record payment'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;
  if (!inv) return <div className="text-red-400">Invoice not found</div>;

  const outstanding = parseFloat(inv.amount) - parseFloat(inv.paid_amount || 0);

  return (
    <div className="max-w-2xl">
      <div className="card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold font-mono">{inv.invoice_number}</h1>
            <p className="text-slate-400 text-sm mt-1">{inv.customer_name} · Quote: {inv.quote_number}</p>
          </div>
          <span className={`badge ${inv.status==='paid'?'badge-approved':inv.status==='partially_paid'?'badge-pending':'badge-rejected'}`}>
            {inv.status?.replace(/_/g,' ')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800">
          <div><p className="text-xs text-slate-500">Invoice Amount</p><p className="text-lg font-semibold">₹{parseFloat(inv.amount).toLocaleString('en-IN')}</p></div>
          <div><p className="text-xs text-slate-500">Paid</p><p className="text-lg font-semibold text-emerald-400">₹{parseFloat(inv.paid_amount||0).toLocaleString('en-IN')}</p></div>
          <div><p className="text-xs text-slate-500">Outstanding</p><p className={`text-lg font-semibold ${outstanding>0?'text-amber-400':'text-emerald-400'}`}>₹{outstanding.toLocaleString('en-IN')}</p></div>
        </div>

        {inv.due_date && <p className="text-xs text-slate-500 mt-3">Due: {inv.due_date}</p>}
      </div>

      {/* Payment History */}
      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Payment Transactions</h2>
        {inv.transactions?.length === 0 ? (
          <p className="text-slate-500 text-sm">No payments recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Reason</th></tr></thead>
              <tbody>
                {inv.transactions?.map(t => (
                  <tr key={t.id}>
                    <td className="text-xs text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td><span className={`badge ${t.type==='payment'?'badge-approved':'badge-pending'}`}>{t.type}</span></td>
                    <td className="font-mono text-sm">₹{parseFloat(t.amount).toLocaleString('en-IN')}</td>
                    <td className="text-slate-400 text-sm">{t.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment */}
      {(user?.role === 'finance' || user?.role === 'admin') && inv.status !== 'paid' && (
        <div className="card">
          <h2 className="font-semibold mb-4">Record Payment</h2>
          <div className="flex gap-3 items-end">
            <div className="form-group flex-1">
              <label className="label">Amount</label>
              <input type="number" min={0.01} step={0.01} className="input" placeholder={`Up to ₹${outstanding.toLocaleString('en-IN')}`}
                value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
            <button onClick={recordPayment} className="btn-success">Record Payment</button>
          </div>
        </div>
      )}
    </div>
  );
}
