// src/pages/FulfillmentList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function FulfillmentList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/fulfillment').then(r => setItems(r.data)).catch(e => toast.error('Failed')).finally(() => setLoading(false));
  }, []);

  const statusColor = { fulfilled: 'badge-approved', backordered: 'badge-rejected', partial: 'badge-pending', pending: 'badge-draft' };

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Fulfillment</h1></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Quote #</th><th>Customer</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="text-center py-8 text-slate-500">Loading...</td></tr>
              : items.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-slate-500">No approved quotations yet</td></tr>
              : items.map(i => (
              <tr key={i.quotation_id}>
                <td><Link to={`/fulfillment/${i.quotation_id}`} className="text-indigo-400 hover:underline font-mono text-xs">{i.quote_number}</Link></td>
                <td>{i.customer_name}</td>
                <td><span className={`badge ${statusColor[i.fulfillment_status] || 'badge-draft'}`}>{i.fulfillment_status}</span></td>
                <td><Link to={`/fulfillment/${i.quotation_id}`} className="btn-secondary btn-sm">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
