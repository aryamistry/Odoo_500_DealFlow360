// src/pages/FulfillmentDetail.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function FulfillmentDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    api.get(`/fulfillment/${id}`).then(r => setData(r.data)).catch(e => toast.error('Failed')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);

  const triggerSplit = async () => {
    try {
      await api.post(`/fulfillment/${id}/split`);
      toast.success('Fulfillment split triggered');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fulfillment — Quote #{id}</h1>
        <button onClick={triggerSplit} className="btn-secondary">Re-run Split</button>
      </div>

      <div className="space-y-4">
        {data?.lines?.map(line => (
          <div key={line.line_id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">{line.product_name}</p>
                <p className="text-xs text-slate-500">Ordered: {line.ordered_qty} · Fulfilled: {line.total_fulfilled} · Remaining: {line.remaining}</p>
              </div>
              <span className={`badge ${parseFloat(line.remaining) <= 0 ? 'badge-approved' : 'badge-pending'}`}>
                {parseFloat(line.remaining) <= 0 ? 'Fulfilled' : line.remaining > 0 ? 'Partial/Backorder' : 'Pending'}
              </span>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Warehouse</th><th>Qty Fulfilled</th><th>Backorder?</th><th>Shipped At</th></tr></thead>
                <tbody>
                  {line.fulfillment_lines?.length > 0 ? line.fulfillment_lines.map((fl, i) => (
                    <tr key={i}>
                      <td>{fl.warehouse_name}</td>
                      <td>{fl.quantity_fulfilled}</td>
                      <td>{fl.is_backorder ? <span className="badge badge-rejected">Yes</span> : <span className="badge badge-approved">No</span>}</td>
                      <td className="text-slate-500 text-xs">{fl.shipped_at ? new Date(fl.shipped_at).toLocaleString() : '—'}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="text-center py-4 text-slate-500">No fulfillment data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
