// src/pages/InvoicesList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

const STATUSES = ['', 'unpaid', 'partially_paid', 'paid'];

export default function InvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.get('/billing/invoices', { params: status ? { status } : {} })
      .then(r => setInvoices(r.data))
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Invoices</h1></div>
      <div className="flex gap-2 mb-4">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`btn btn-sm ${status===s?'btn-primary':'btn-secondary'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Invoice #</th><th>Customer</th><th>Quote #</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="text-center py-8 text-slate-500">Loading...</td></tr>
              : invoices.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-slate-500">No invoices found</td></tr>
              : invoices.map(inv => (
              <tr key={inv.id}>
                <td className="font-mono text-xs">{inv.invoice_number}</td>
                <td>{inv.customer_name}</td>
                <td className="text-indigo-400 font-mono text-xs">{inv.quote_number}</td>
                <td className="font-mono text-sm">₹{parseFloat(inv.amount).toLocaleString('en-IN', {maximumFractionDigits:0})}</td>
                <td className="font-mono text-sm text-emerald-400">₹{parseFloat(inv.paid_amount||0).toLocaleString('en-IN', {maximumFractionDigits:0})}</td>
                <td><span className={`badge ${inv.status==='paid'?'badge-approved':inv.status==='partially_paid'?'badge-pending':'badge-rejected'}`}>{inv.status?.replace(/_/g,' ')}</span></td>
                <td className="text-slate-500 text-xs">{inv.due_date}</td>
                <td><Link to={`/invoices/${inv.id}`} className="btn-secondary btn-sm">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
