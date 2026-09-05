// src/pages/InvoicesList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';

const STATUSES = ['', 'unpaid', 'partially_paid', 'paid'];

export default function InvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchInvoices = () => {
    setLoading(true);
    const params = { page, limit };
    if (status) params.status = status;
    api.get('/billing/invoices', { params })
      .then(r => {
        if (r.data && r.data.data) {
          setInvoices(r.data.data);
          setTotal(r.data.total);
          setTotalPages(r.data.totalPages);
        } else {
          setInvoices(Array.isArray(r.data) ? r.data : []);
          setTotal(r.data?.length || 0);
          setTotalPages(1);
        }
      })
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInvoices(); }, [status, page, limit]);

  // Reset to page 1 when status filter changes
  const handleStatusChange = (s) => { setStatus(s); setPage(1); };
  const handleLimitChange  = (l) => { setLimit(l); setPage(1); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{total} invoices</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Quote #</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">No invoices found</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id}>
                <td className="font-mono text-xs">{inv.invoice_number}</td>
                <td>{inv.customer_name}</td>
                <td className="text-indigo-400 font-mono text-xs">{inv.quote_number}</td>
                <td className="font-mono text-sm">₹{parseFloat(inv.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="font-mono text-sm text-emerald-400">₹{parseFloat(inv.paid_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td>
                  <span className={`badge ${inv.status === 'paid' ? 'badge-approved' : inv.status === 'partially_paid' ? 'badge-pending' : 'badge-rejected'}`}>
                    {inv.status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="text-slate-500 text-xs">{inv.due_date}</td>
                <td><Link to={`/invoices/${inv.id}`} className="btn-secondary btn-sm">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={handleLimitChange}
      />
    </div>
  );
}
