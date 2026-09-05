// src/pages/Portal.jsx — Customer Portal
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

function StatusBadge({ status }) {
  const cls = { draft:'badge-draft',pending_approval:'badge-pending',approved:'badge-approved',confirmed:'badge-confirmed',rejected:'badge-rejected',under_negotiation:'badge-negotiation' };
  return <span className={`badge ${cls[status]||'badge-draft'}`}>{status?.replace(/_/g,' ')}</span>;
}

export default function Portal() {
  const { user, logout } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [negForm, setNegForm] = useState({ customer_comment: '', counter_discount_pct: '', requested_delivery_date: '' });
  const [showNegForm, setShowNegForm] = useState(false);

  useEffect(() => {
    api.get('/portal/quotations').then(r => setQuotes(r.data)).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  }, []);

  const viewQuote = (q) => {
    api.get(`/portal/quotations/${q.id}`).then(r => setSelected(r.data)).catch(() => toast.error('Failed'));
  };

  const submitNegotiation = async () => {
    if (!negForm.customer_comment.trim()) return toast.error('Please enter a message explaining what you would like to change');
    if (negForm.counter_discount_pct !== '' && negForm.counter_discount_pct !== null && negForm.counter_discount_pct !== undefined) {
      const disc = parseFloat(negForm.counter_discount_pct);
      if (isNaN(disc) || disc < 0 || disc > 100) {
        return toast.error('Counter discount percentage must be between 0% and 100%');
      }
    }
    if (negForm.requested_delivery_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (negForm.requested_delivery_date < today) {
        return toast.error('Requested delivery date cannot be in the past');
      }
    }

    try {
      await api.post(`/portal/quotations/${selected.id}/negotiate`, {
        customer_comment: negForm.customer_comment.trim(),
        counter_discount_pct: negForm.counter_discount_pct !== '' ? parseFloat(negForm.counter_discount_pct) : null,
        requested_delivery_date: negForm.requested_delivery_date || null,
      });
      toast.success('Negotiation request submitted!');
      setNegForm({ customer_comment: '', counter_discount_pct: '', requested_delivery_date: '' });
      setShowNegForm(false);
      viewQuote(selected);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit negotiation request'); }
  };

  const [confirmDate, setConfirmDate] = useState('');
  const [showConfirmPanel, setShowConfirmPanel] = useState(false);

  const confirmQuote = async () => {
    if (confirmDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (confirmDate < today) {
        return toast.error('Promised delivery date cannot be in the past');
      }
    }
    try {
      await api.post(`/portal/quotations/${selected.id}/confirm`, { promised_delivery_date: confirmDate || null });
      toast.success('Quotation confirmed!');
      setShowConfirmPanel(false);
      setConfirmDate('');
      viewQuote(selected);
    } catch (e) { toast.error(e.response?.data?.error || 'Confirm failed — quotation may not be in approved state'); }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-indigo-400">DealFlow<span className="text-slate-100">360</span></h1>
          <p className="text-xs text-slate-500">Customer Portal</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{user?.companyName}</span>
          <button onClick={logout} className="btn-ghost btn-sm">Sign out</button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-61px)]">
        {/* Quotes list */}
        <aside className="w-80 border-r border-slate-800 overflow-y-auto p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Your Quotations</h2>
          {loading ? <p className="text-slate-500 text-sm">Loading...</p>
            : quotes.length === 0 ? <p className="text-slate-500 text-sm">No quotations yet</p>
            : quotes.map(q => (
            <button key={q.id} onClick={() => viewQuote(q)}
              className={`w-full text-left card-sm hover:border-indigo-600 transition-all ${selected?.id === q.id ? 'border-indigo-600' : ''}`}>
              <p className="font-mono text-xs text-indigo-400">{q.quote_number}</p>
              <p className="text-sm font-medium text-slate-200 mt-1">₹{parseFloat(q.total_amount||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
              <div className="mt-1"><StatusBadge status={q.status} /></div>
            </button>
          ))}
        </aside>

        {/* Detail */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-slate-500">Select a quotation to view details</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold font-mono">{selected.quote_number}</h2>
                    <StatusBadge status={selected.status} />
                  </div>
                  <p className="text-slate-400 text-sm mt-1">Sales Rep: {selected.rep_name}</p>
                </div>
                <div className="flex gap-3">
                  {selected.status === 'approved' && (
                    <button onClick={() => setShowConfirmPanel(!showConfirmPanel)} className="btn-success">Confirm Order</button>
                  )}
                  {['approved','under_negotiation'].includes(selected.status) && (
                    <button onClick={() => setShowNegForm(!showNegForm)} className="btn-secondary">Request Changes</button>
                  )}
                </div>
              </div>

              {/* Confirm Order panel — replaces window.prompt */}
              {showConfirmPanel && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Confirm Order</h3>
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="label">Promised Delivery Date (optional)</label>
                      <input type="date" className="input"
                        min={new Date().toISOString().slice(0, 10)}
                        value={confirmDate} onChange={e => setConfirmDate(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={confirmQuote} className="btn-success">Confirm</button>
                      <button onClick={() => { setShowConfirmPanel(false); setConfirmDate(''); }} className="btn-secondary">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Lines */}
              <div className="card">
                <h3 className="font-semibold mb-4">Line Items</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead>
                    <tbody>
                      {selected.lines?.map(l => (
                        <tr key={l.id}>
                          <td>{l.product_name}</td>
                          <td>{l.quantity}</td>
                          <td className="font-mono text-sm">₹{parseFloat(l.unit_price).toLocaleString('en-IN')}</td>
                          <td>{l.discount_pct}%</td>
                          <td className="font-mono text-sm">₹{(parseFloat(l.unit_price)*(1-parseFloat(l.discount_pct)/100)*l.quantity).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Negotiation form */}
              {showNegForm && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Request Changes</h3>
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="label">Your Message *</label>
                      <textarea className="input h-20" placeholder="Describe what you'd like to change..." value={negForm.customer_comment}
                        onChange={e => setNegForm(f => ({...f, customer_comment: e.target.value}))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="form-group">
                        <label className="label">Counter Discount % (optional)</label>
                        <input type="number" min={0} max={100} className="input" placeholder="e.g. 20"
                          value={negForm.counter_discount_pct} onChange={e => setNegForm(f => ({...f, counter_discount_pct: e.target.value}))} />
                      </div>
                      <div className="form-group">
                        <label className="label">Requested Delivery Date (optional)</label>
                        <input type="date" className="input"
                          value={negForm.requested_delivery_date} onChange={e => setNegForm(f => ({...f, requested_delivery_date: e.target.value}))} />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={submitNegotiation} className="btn-primary">Submit Request</button>
                      <button onClick={() => setShowNegForm(false)} className="btn-secondary">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Negotiation history */}
              {selected.negotiations?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Negotiation History</h3>
                  <div className="space-y-3">
                    {selected.negotiations.map(n => (
                      <div key={n.id} className="card-sm">
                        <div className="flex items-start justify-between">
                          <p className="text-sm">{n.customer_comment}</p>
                          <span className={`badge ${n.status==='resolved'?'badge-approved':'badge-pending'}`}>{n.status}</span>
                        </div>
                        {n.counter_discount_pct && <p className="text-xs text-slate-500 mt-1">Counter discount: {n.counter_discount_pct}%</p>}
                        <p className="text-xs text-slate-500 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
