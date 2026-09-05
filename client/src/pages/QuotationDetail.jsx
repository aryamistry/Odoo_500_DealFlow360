// src/pages/QuotationDetail.jsx
// Phase 3 (builder) + Phase 4 (upsell panel) + Phase 5 (submit)
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

function StatusBadge({ status }) {
  const cls = { draft:'badge-draft',pending_approval:'badge-pending',approved:'badge-approved',confirmed:'badge-confirmed',rejected:'badge-rejected',under_negotiation:'badge-negotiation' };
  return <span className={`badge ${cls[status]||'badge-draft'}`}>{status?.replace(/_/g,' ')}</span>;
}

function RiskBadge({ level }) {
  if (!level) return null;
  return <span className={`badge badge-${level}`}>{level} risk</span>;
}

export default function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState(null);
  const [products, setProducts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ product_id: '', quantity: 1, discount_pct: 0 });

  const fetchAll = () => {
    Promise.all([
      api.get(`/quotations/${id}`),
      api.get('/admin/products'),
      api.get(`/quotations/${id}/upsell-suggestions`),
    ]).then(([qr, pr, ur]) => {
      setQ(qr.data);
      setProducts(pr.data);
      setSuggestions(ur.data);
    }).catch(e => toast.error(e.response?.data?.error || 'Failed to load'))
    .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (id === 'new' || isNaN(parseInt(id, 10))) {
      navigate('/quotations?new=true', { replace: true });
      return;
    }
    fetchAll();
  }, [id]);

  const addLine = async () => {
    if (!addForm.product_id) return toast.error('Select a product');
    try {
      await api.post(`/quotations/${id}/lines`, {
        product_id: parseInt(addForm.product_id),
        quantity: parseInt(addForm.quantity),
        discount_pct: parseFloat(addForm.discount_pct),
      });
      toast.success('Line added');
      setAddForm({ product_id: '', quantity: 1, discount_pct: 0 });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const removeLine = async (lineId) => {
    if (!confirm('Remove this line?')) return;
    try {
      await api.delete(`/quotations/${id}/lines/${lineId}`);
      toast.success('Line removed');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const updateLine = async (lineId, field, value) => {
    try {
      await api.patch(`/quotations/${id}/lines/${lineId}`, { [field]: parseFloat(value) });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const submitQuote = async () => {
    if (!confirm('Submit this quotation for approval?')) return;
    try {
      const r = await api.post(`/quotations/${id}/submit`);
      toast.success(`Submitted! Risk: ${r.data.risk_level}, Status: ${r.data.newStatus}`);
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const acceptUpsell = async (suggested_product_id) => {
    try {
      await api.post(`/quotations/${id}/upsell-accept`, { suggested_product_id, quantity: 1 });
      toast.success('Added to quote!');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;
  if (!q) return <div className="text-red-400">Quotation not found</div>;

  const isDraft = q.status === 'draft';
  const canEdit = isDraft && (user?.role !== 'finance');

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Left: Main Content */}
      <div className="col-span-2 space-y-6">
        {/* Header */}
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-lg font-semibold font-mono">{q.quote_number}</h1>
                <StatusBadge status={q.status} />
                <RiskBadge level={q.risk_level} />
              </div>
              <p className="text-slate-400 text-sm">{q.customer_name} · {q.customer_tier} tier</p>
              <p className="text-slate-500 text-xs mt-1">Rep: {q.rep_name}</p>
            </div>
            <div className="text-right">
              {isDraft && canEdit && (
                <button onClick={submitQuote} className="btn-primary">Submit for Approval</button>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500">Revenue</p>
              <p className="text-lg font-semibold">₹{parseFloat(q.totals?.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Margin</p>
              <p className="text-lg font-semibold text-emerald-400">₹{parseFloat(q.totals?.margin || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Margin %</p>
              <p className={`text-lg font-semibold ${q.totals?.marginPct > 20 ? 'text-emerald-400' : q.totals?.marginPct > 10 ? 'text-amber-400' : 'text-red-400'}`}>
                {parseFloat(q.totals?.marginPct || 0).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="card">
          <h2 className="font-semibold text-slate-200 mb-4">Line Items</h2>
          <div className="table-wrap mb-4">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th>Unit Price</th>
                  <th>Qty</th>
                  <th>Discount %</th>
                  <th>Line Total</th>
                  <th>Ceiling</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {q.lines?.map(l => {
                  const ceiling = Math.min(parseFloat(l.category_ceiling || 100), parseFloat(l.tier_ceiling || 100));
                  const breached = parseFloat(l.discount_pct) > ceiling;
                  const lineTotal = parseFloat(l.unit_price) * (1 - parseFloat(l.discount_pct) / 100) * l.quantity;
                  return (
                    <tr key={l.id}>
                      <td>
                        <p className="font-medium text-sm">{l.product_name}</p>
                        <p className="text-xs text-slate-500">{l.category_name}</p>
                      </td>
                      <td className="text-slate-400 text-xs">{l.attribute_name && `${l.attribute_name}: ${l.variant_value}`}</td>
                      <td className="font-mono text-sm">₹{parseFloat(l.unit_price).toLocaleString('en-IN')}</td>
                      <td>
                        {canEdit ? (
                          <input type="number" min={1} defaultValue={l.quantity}
                            className="input w-16 text-center text-sm px-2 py-1"
                            onBlur={e => updateLine(l.id, 'quantity', e.target.value)} />
                        ) : l.quantity}
                      </td>
                      <td>
                        {canEdit ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={100} step={0.5} defaultValue={l.discount_pct}
                              className={`input w-16 text-center text-sm px-2 py-1 ${breached ? 'border-red-500 text-red-400' : ''}`}
                              onBlur={e => updateLine(l.id, 'discount_pct', e.target.value)} />
                            {breached && <span className="text-red-400 text-xs">⚠ &gt;{ceiling}%</span>}
                          </div>
                        ) : (
                          <span className={breached ? 'text-red-400' : ''}>{l.discount_pct}%</span>
                        )}
                      </td>
                      <td className="font-mono text-sm">₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td className="text-slate-500 text-xs">{ceiling}%</td>
                      {canEdit && (
                        <td>
                          <button onClick={() => removeLine(l.id)} className="btn-ghost btn-sm text-red-400">✕</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {(!q.lines || q.lines.length === 0) && (
                  <tr><td colSpan={canEdit ? 8 : 7} className="text-center py-6 text-slate-500 text-sm">No lines yet. Add a product below.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add line form */}
          {canEdit && (
            <div className="flex gap-3 items-end pt-4 border-t border-slate-800">
              <div className="form-group flex-1">
                <label className="label">Product</label>
                <select className="select" value={addForm.product_id} onChange={e => setAddForm(f => ({...f, product_id: e.target.value}))}>
                  <option value="">-- Select product --</option>
                  {products.filter(p => p.status === 'active').map(p => (
                    <option key={p.id} value={p.id}>{p.name} (₹{parseFloat(p.price).toLocaleString('en-IN')})</option>
                  ))}
                </select>
              </div>
              <div className="form-group w-20">
                <label className="label">Qty</label>
                <input type="number" min={1} className="input" value={addForm.quantity} onChange={e => setAddForm(f => ({...f, quantity: e.target.value}))} />
              </div>
              <div className="form-group w-24">
                <label className="label">Discount %</label>
                <input type="number" min={0} max={100} step={0.5} className="input" value={addForm.discount_pct} onChange={e => setAddForm(f => ({...f, discount_pct: e.target.value}))} />
              </div>
              <button onClick={addLine} className="btn-primary">Add Line</button>
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="card">
          <h2 className="font-semibold text-slate-200 mb-4">Activity</h2>
          {q.activity?.length === 0 ? (
            <p className="text-slate-500 text-sm">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {q.activity?.map(a => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <span className="text-slate-500 text-xs w-32 flex-shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                  <div>
                    <span className="text-indigo-400 font-medium">{a.action?.replace(/_/g, ' ')}</span>
                    <span className="text-slate-500"> · {a.actor_name || a.actor_company}</span>
                    {a.note && <p className="text-slate-400 text-xs mt-0.5">{a.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Upsell Panel */}
      <div className="space-y-4">
        <div className="card">
          <h2 className="font-semibold text-slate-200 mb-3">💡 Upsell Suggestions</h2>
          {suggestions.length === 0 ? (
            <p className="text-slate-500 text-sm">No suggestions. Add products to see recommendations.</p>
          ) : suggestions.map(s => (
            <div key={s.id} className="card-sm mb-3 last:mb-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{s.suggested_name}</p>
                  {s.is_promoted && <span className="badge badge-approved text-xs">★ Promoted</span>}
                  <p className="text-xs text-slate-500 mt-1">₹{parseFloat(s.suggested_price).toLocaleString('en-IN')} · Margin: {s.margin_pct}%</p>
                  {s.description && <p className="text-xs text-slate-500 mt-1">{s.description}</p>}
                </div>
                {canEdit && (
                  <button onClick={() => acceptUpsell(s.suggested_product_id)} className="btn-success btn-sm flex-shrink-0 ml-2">Add</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Approval Steps */}
        {q.steps?.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-slate-200 mb-3">Approval Steps</h2>
            {q.steps.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium">{s.approver_role?.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500">Step {s.step_order}</p>
                </div>
                <span className={`badge ${s.status === 'pending' ? 'badge-pending' : s.status === 'approved' ? 'badge-approved' : s.status === 'rejected' ? 'badge-rejected' : 'badge-draft'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
