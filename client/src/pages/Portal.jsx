// src/pages/Portal.jsx — Customer Portal with Invoice Payments
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

function StatusBadge({ status }) {
  const cls = { draft:'badge-draft',pending_approval:'badge-pending',approved:'badge-approved',confirmed:'badge-confirmed',rejected:'badge-rejected',under_negotiation:'badge-negotiation' };
  return <span className={`badge ${cls[status]||'badge-draft'}`}>{status?.replace(/_/g,' ')}</span>;
}

function invoiceBadgeClass(status) {
  if (status === 'paid') return 'badge-approved';
  if (status === 'partially_paid') return 'badge-pending';
  return 'badge-rejected'; // unpaid
}

export default function Portal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('quotations'); // 'quotations' | 'invoices'

  // Quotations state
  const [quotes, setQuotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [quoteSearch, setQuoteSearch] = useState('');
  const [negForm, setNegForm] = useState({ customer_comment: '', counter_discount_pct: '', requested_delivery_date: '' });
  const [showNegForm, setShowNegForm] = useState(false);
  const [confirmDate, setConfirmDate] = useState('');
  const [showConfirmPanel, setShowConfirmPanel] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');

  // Payment Modal state
  const [payModalInv, setPayModalInv] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Credit/Debit Card');
  const [payNote, setPayNote] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const fetchQuotes = async () => {
    try {
      const r = await api.get('/portal/quotations');
      setQuotes(r.data || []);
    } catch {
      toast.error('Failed to fetch quotations');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const r = await api.get('/portal/invoices');
      setInvoices(r.data || []);
    } catch {
      toast.error('Failed to fetch invoices');
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
    fetchInvoices();
  }, []);

  const filteredQuotes = quotes.filter(q => {
    if (!quoteSearch.trim()) return true;
    const s = quoteSearch.toLowerCase();
    return q.quote_number?.toLowerCase().includes(s) ||
           q.status?.toLowerCase().includes(s) ||
           q.rep_name?.toLowerCase().includes(s);
  });

  const filteredInvoices = invoices.filter(inv => {
    if (invoiceStatusFilter !== 'all' && inv.status !== invoiceStatusFilter) return false;
    if (!invoiceSearch.trim()) return true;
    const s = invoiceSearch.toLowerCase();
    return inv.invoice_number?.toLowerCase().includes(s) ||
           inv.quote_number?.toLowerCase().includes(s) ||
           inv.status?.toLowerCase().includes(s);
  });

  const viewQuote = (q) => {
    api.get(`/portal/quotations/${q.id}`).then(r => setSelected(r.data)).catch(() => toast.error('Failed to load quotation'));
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
      fetchQuotes();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit negotiation request'); }
  };

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
      fetchQuotes();
      fetchInvoices();
    } catch (e) { toast.error(e.response?.data?.error || 'Confirm failed — quotation may not be in approved state'); }
  };

  const openPaymentModal = (inv) => {
    setPayModalInv(inv);
    setPayAmount(inv.balance_remaining ? inv.balance_remaining.toString() : inv.amount.toString());
    setPayMethod('Credit/Debit Card');
    setPayNote('');
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    const num = parseFloat(payAmount);
    if (!num || isNaN(num) || num <= 0) {
      return toast.error('Please enter a valid payment amount');
    }
    if (num > payModalInv.balance_remaining + 0.01) {
      return toast.error(`Payment cannot exceed remaining balance of ₹${payModalInv.balance_remaining.toLocaleString('en-IN')}`);
    }

    setSubmittingPay(true);
    try {
      const res = await api.post(`/portal/invoices/${payModalInv.id}/pay`, {
        amount: num,
        payment_method: payMethod,
        note: payNote.trim() || undefined,
      });
      toast.success(res.data.message || `Payment of ₹${num.toLocaleString('en-IN')} recorded successfully!`);
      setPayModalInv(null);
      fetchInvoices();
      fetchQuotes();
      if (selected) {
        viewQuote(selected);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setSubmittingPay(false);
    }
  };

  // Compute billing summary metrics
  const totalInvoiced = invoices.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
  const totalPaid = invoices.reduce((acc, i) => acc + (parseFloat(i.paid_amount) || 0), 0);
  const totalBalance = invoices.reduce((acc, i) => acc + (parseFloat(i.balance_remaining) || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-bold text-indigo-400 leading-tight">DealFlow<span className="text-slate-100">360</span></h1>
            <p className="text-xs text-slate-500">Customer Portal</p>
          </div>
          <nav className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('quotations')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'quotations'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quotations ({quotes.length})
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'invoices'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Invoices & Payments ({invoices.length})
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-300 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            {user?.companyName || user?.email}
          </span>
          <button onClick={logout} className="btn-ghost btn-sm text-xs">Sign out</button>
        </div>
      </header>

      {/* Main Content Area */}
      {activeTab === 'quotations' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Quotes list sidebar */}
          <aside className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/40">
            <div className="p-4 border-b border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Your Quotations</h2>
                <span className="text-xs text-slate-500 font-mono">{filteredQuotes.length}</span>
              </div>
              <input
                type="text"
                placeholder="Search quotes..."
                value={quoteSearch}
                onChange={e => setQuoteSearch(e.target.value)}
                className="input w-full text-xs py-1.5"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingQuotes ? (
                <p className="text-slate-500 text-sm">Loading quotations...</p>
              ) : filteredQuotes.length === 0 ? (
                <p className="text-slate-500 text-sm">No quotations found</p>
              ) : (
                filteredQuotes.map(q => (
                  <button
                    key={q.id}
                    onClick={() => viewQuote(q)}
                    className={`w-full text-left card-sm hover:border-indigo-600 transition-all ${
                      selected?.id === q.id ? 'border-indigo-600 bg-indigo-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs text-indigo-400 font-semibold">{q.quote_number}</p>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mt-1.5">
                      ₹{parseFloat(q.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                    {q.rep_name && <p className="text-xs text-slate-500 mt-1">Rep: {q.rep_name}</p>}
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Quotation Detail */}
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
                <div className="text-3xl">📄</div>
                <p>Select a quotation from the sidebar to view details and billing</p>
              </div>
            ) : (
              <div className="space-y-6 max-w-5xl mx-auto">
                {/* Top header bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold font-mono text-slate-100">{selected.quote_number}</h2>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="text-slate-400 text-xs mt-1">Sales Representative: <span className="text-slate-200">{selected.rep_name || 'N/A'}</span></p>
                  </div>
                  <div className="flex gap-2">
                    {selected.status === 'approved' && (
                      <button onClick={() => setShowConfirmPanel(!showConfirmPanel)} className="btn-success text-xs">
                        ✓ Confirm Order
                      </button>
                    )}
                    {['approved', 'under_negotiation'].includes(selected.status) && (
                      <button onClick={() => setShowNegForm(!showNegForm)} className="btn-secondary text-xs">
                        💬 Request Changes
                      </button>
                    )}
                  </div>
                </div>

                {/* Confirm Order panel */}
                {showConfirmPanel && (
                  <div className="card border-emerald-500/40 bg-emerald-950/10">
                    <h3 className="font-semibold text-emerald-400 mb-2">Confirm Order</h3>
                    <p className="text-xs text-slate-400 mb-4">Confirming will create your order, split warehouse fulfillments, and generate your invoice.</p>
                    <div className="space-y-4">
                      <div className="form-group">
                        <label className="label">Promised / Requested Delivery Date (optional)</label>
                        <input
                          type="date"
                          className="input"
                          min={new Date().toISOString().slice(0, 10)}
                          value={confirmDate}
                          onChange={e => setConfirmDate(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-3">
                        <button onClick={confirmQuote} className="btn-success text-xs">Confirm Quotation</button>
                        <button onClick={() => { setShowConfirmPanel(false); setConfirmDate(''); }} className="btn-secondary text-xs">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Line Items */}
                <div className="card">
                  <h3 className="font-semibold text-slate-200 mb-4 flex items-center justify-between">
                    <span>Line Items</span>
                    <span className="text-xs font-mono text-slate-400 font-normal">{selected.lines?.length || 0} items</span>
                  </h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Unit Price</th>
                          <th className="text-right">Discount</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.lines?.map(l => (
                          <tr key={l.id}>
                            <td className="font-medium text-slate-200">{l.product_name}</td>
                            <td className="text-right font-mono">{l.quantity}</td>
                            <td className="text-right font-mono text-sm">₹{parseFloat(l.unit_price).toLocaleString('en-IN')}</td>
                            <td className="text-right font-mono">{l.discount_pct}%</td>
                            <td className="text-right font-mono font-medium text-indigo-300">
                              ₹{(parseFloat(l.unit_price) * (1 - parseFloat(l.discount_pct) / 100) * l.quantity).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Invoices & Payments Card with Online Payment */}
                {selected.invoices?.length > 0 && (
                  <div className="card border-indigo-900/40">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-slate-100">Invoices & Payment Status</h3>
                        <p className="text-xs text-slate-400">View your billing invoices and make payments securely.</p>
                      </div>
                      <span className="text-xs font-mono text-indigo-400">{selected.invoices.length} invoice(s)</span>
                    </div>

                    <div className="space-y-4">
                      {selected.invoices.map(inv => (
                        <div key={inv.id} className="card-sm bg-slate-900/80 border-slate-700/80 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-mono text-sm font-semibold text-indigo-400">{inv.invoice_number}</p>
                                <span className={`badge ${invoiceBadgeClass(inv.status)}`}>
                                  {inv.status?.replace(/_/g, ' ')}
                                </span>
                              </div>
                              {inv.due_date && <p className="text-xs text-slate-400 mt-0.5">Due Date: {new Date(inv.due_date).toLocaleDateString()}</p>}
                            </div>

                            {/* Pay button for customer */}
                            {inv.status !== 'paid' && inv.balance_remaining > 0 && (
                              <button
                                onClick={() => openPaymentModal(inv)}
                                className="btn-primary text-xs flex items-center gap-1.5 shadow-sm hover:scale-[1.02] transition-transform"
                              >
                                <span>💳 Pay Invoice</span>
                                <span className="font-mono font-semibold">₹{parseFloat(inv.balance_remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                            <div>
                              <p className="text-xs text-slate-500">Invoice Total</p>
                              <p className="font-semibold text-slate-200 mt-0.5">
                                ₹{parseFloat(inv.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Amount Paid</p>
                              <p className="font-semibold text-emerald-400 mt-0.5">
                                ₹{parseFloat(inv.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Balance Remaining</p>
                              <p className={`font-semibold mt-0.5 ${inv.balance_remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                ₹{parseFloat(inv.balance_remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                          </div>

                          {/* Payment transactions history */}
                          {inv.transactions?.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Payment Receipts</p>
                              {inv.transactions.map(t => (
                                <div key={t.id} className="flex justify-between items-center text-xs bg-slate-950/30 px-2 py-1 rounded">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-mono text-[11px]">{new Date(t.created_at).toLocaleDateString()}</span>
                                    {t.reason && <span className="text-slate-500 text-[11px]">({t.reason})</span>}
                                  </div>
                                  <span className="text-emerald-400 font-mono font-medium">+₹{parseFloat(t.amount).toLocaleString('en-IN')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Negotiation form */}
                {showNegForm && (
                  <div className="card border-indigo-500/40">
                    <h3 className="font-semibold mb-4 text-slate-100">Request Changes / Negotiation</h3>
                    <div className="space-y-4">
                      <div className="form-group">
                        <label className="label">Your Message *</label>
                        <textarea
                          className="input h-20"
                          placeholder="Describe what price, delivery date, or discount adjustments you are requesting..."
                          value={negForm.customer_comment}
                          onChange={e => setNegForm(f => ({ ...f, customer_comment: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                          <label className="label">Counter Discount % (optional)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="input"
                            placeholder="e.g. 15"
                            value={negForm.counter_discount_pct}
                            onChange={e => setNegForm(f => ({ ...f, counter_discount_pct: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="label">Requested Delivery Date (optional)</label>
                          <input
                            type="date"
                            className="input"
                            min={new Date().toISOString().slice(0, 10)}
                            value={negForm.requested_delivery_date}
                            onChange={e => setNegForm(f => ({ ...f, requested_delivery_date: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={submitNegotiation} className="btn-primary text-xs">Submit Request</button>
                        <button onClick={() => setShowNegForm(false)} className="btn-secondary text-xs">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Negotiation history */}
                {selected.negotiations?.length > 0 && (
                  <div className="card">
                    <h3 className="font-semibold mb-4 text-slate-200">Negotiation Log</h3>
                    <div className="space-y-3">
                      {selected.negotiations.map(n => (
                        <div key={n.id} className="card-sm">
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-slate-200">{n.customer_comment}</p>
                            <span className={`badge ${n.status === 'resolved' ? 'badge-approved' : 'badge-pending'}`}>{n.status}</span>
                          </div>
                          {n.counter_discount_pct && <p className="text-xs text-indigo-400 mt-1">Requested discount: {n.counter_discount_pct}%</p>}
                          {n.requested_delivery_date && <p className="text-xs text-slate-400 mt-0.5">Requested date: {n.requested_delivery_date}</p>}
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
      ) : (
        /* Invoices & Payments Full Dashboard */
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card bg-slate-900/60 border-slate-800">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invoiced</p>
              <p className="text-2xl font-bold font-mono text-slate-100 mt-1">
                ₹{totalInvoiced.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">{invoices.length} total invoice(s)</p>
            </div>
            <div className="card bg-emerald-950/20 border-emerald-900/40">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Total Paid</p>
              <p className="text-2xl font-bold font-mono text-emerald-300 mt-1">
                ₹{totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-emerald-500/70 mt-1">Settled payments</p>
            </div>
            <div className="card bg-amber-950/20 border-amber-900/40">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Outstanding Due</p>
              <p className="text-2xl font-bold font-mono text-amber-300 mt-1">
                ₹{totalBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-amber-500/70 mt-1">Pending payment</p>
            </div>
          </div>

          {/* Invoices List Card */}
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">All Customer Invoices</h2>
                <p className="text-xs text-slate-400">View details, track transactions, and pay outstanding balances.</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search invoice or quote #..."
                  value={invoiceSearch}
                  onChange={e => setInvoiceSearch(e.target.value)}
                  className="input text-xs py-1.5 w-60"
                />
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {['all', 'unpaid', 'partially_paid', 'paid'].map(st => (
                    <button
                      key={st}
                      onClick={() => setInvoiceStatusFilter(st)}
                      className={`px-2.5 py-1 rounded text-xs capitalize font-medium transition-all ${
                        invoiceStatusFilter === st
                          ? 'bg-slate-800 text-indigo-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {st.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadingInvoices ? (
              <p className="text-slate-500 text-sm py-8 text-center">Loading invoices...</p>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <p className="text-sm">No invoices found matching your criteria</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr className="whitespace-nowrap">
                      <th>Invoice #</th>
                      <th>Quotation #</th>
                      <th>Issued Date</th>
                      <th>Due Date</th>
                      <th className="text-right">Total Amount</th>
                      <th className="text-right">Paid Amount</th>
                      <th className="text-right">Balance Due</th>
                      <th>Status</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className="whitespace-nowrap">
                        <td className="font-mono text-xs font-semibold text-indigo-400">{inv.invoice_number}</td>
                        <td className="font-mono text-xs text-slate-400">{inv.quote_number || '—'}</td>
                        <td className="text-xs text-slate-400">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</td>
                        <td className="text-xs text-slate-400">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</td>
                        <td className="text-right font-mono text-xs font-medium text-slate-200">
                          ₹{parseFloat(inv.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="text-right font-mono text-xs text-emerald-400">
                          ₹{parseFloat(inv.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="text-right font-mono text-xs font-semibold text-amber-400">
                          ₹{parseFloat(inv.balance_remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td>
                          <span className={`badge ${invoiceBadgeClass(inv.status)}`}>
                            {inv.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="text-center">
                          {inv.status !== 'paid' && inv.balance_remaining > 0 ? (
                            <button
                              onClick={() => openPaymentModal(inv)}
                              className="btn-primary text-xs py-1 px-3 shadow-sm hover:scale-105 transition-all"
                            >
                              Pay Now
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-400 font-medium">✓ Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Interactive Payment Modal */}
      {payModalInv && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-950 to-slate-900 border-b border-slate-800 p-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>💳</span> Make Invoice Payment
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Invoice <span className="font-mono text-indigo-400 font-semibold">{payModalInv.invoice_number}</span>
                </p>
              </div>
              <button
                onClick={() => setPayModalInv(null)}
                className="text-slate-400 hover:text-slate-100 text-xl font-bold leading-none p-1"
              >
                &times;
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handlePaySubmit} className="p-5 space-y-4">
              {/* Summary Cards inside modal */}
              <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <div>
                  <p className="text-[11px] text-slate-500">Invoice Total</p>
                  <p className="text-xs font-bold text-slate-200 font-mono mt-0.5">
                    ₹{parseFloat(payModalInv.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Paid So Far</p>
                  <p className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                    ₹{parseFloat(payModalInv.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Outstanding</p>
                  <p className="text-xs font-bold text-amber-400 font-mono mt-0.5">
                    ₹{parseFloat(payModalInv.balance_remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              {/* Amount to pay */}
              <div className="form-group">
                <div className="flex items-center justify-between mb-1">
                  <label className="label">Payment Amount (₹) *</label>
                  <button
                    type="button"
                    onClick={() => setPayAmount(payModalInv.balance_remaining.toString())}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Pay Full (₹{parseFloat(payModalInv.balance_remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={payModalInv.balance_remaining}
                  className="input font-mono text-base font-bold text-slate-100"
                  placeholder="Enter amount..."
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  required
                />
              </div>

              {/* Payment Method */}
              <div className="form-group">
                <label className="label">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Credit/Debit Card', 'UPI / QR Code', 'Net Banking', 'Bank Wire / IMPS'].map(pm => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPayMethod(pm)}
                      className={`p-2 rounded-lg text-xs font-medium border text-left transition-all ${
                        payMethod === pm
                          ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Reference or Note */}
              <div className="form-group">
                <label className="label">Transaction Reference / Note (optional)</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="e.g. Card ending in 4242 or UPI Ref #..."
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayModalInv(null)}
                  className="btn-secondary text-xs"
                  disabled={submittingPay}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs font-semibold px-5"
                  disabled={submittingPay}
                >
                  {submittingPay ? 'Processing...' : `Confirm & Pay ₹${parseFloat(payAmount || 0).toLocaleString('en-IN')}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

