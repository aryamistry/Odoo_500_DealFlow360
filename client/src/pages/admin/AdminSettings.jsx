// src/pages/admin/AdminSettings.jsx
import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

const TABS = ['Categories', 'Customer Tiers', 'Approval Rules', 'Warehouses', 'Subscription Plans', 'Products', 'Price Lists', 'Upsell Rules'];

// ── Categories ────────────────────────────────────────────────────────────────
function CategoriesTab() {
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ name: '', max_discount_pct: '' });

  const load = () => api.get('/admin/categories').then(r => setCats(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.post('/admin/categories', form); toast.success('Created'); setForm({ name: '', max_discount_pct: '' }); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const del = async (id) => {
    if (!confirm('Delete?')) return;
    try { await api.delete(`/admin/categories/${id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error('Failed'); }
  };

  return (
    <div>
      <div className="flex gap-3 mb-6 items-end">
        <div className="form-group flex-1"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Hardware" /></div>
        <div className="form-group w-36"><label className="label">Max Discount %</label><input type="number" className="input" value={form.max_discount_pct} onChange={e => setForm(f => ({...f, max_discount_pct: e.target.value}))} /></div>
        <button onClick={create} className="btn-primary">Add</button>
      </div>
      <div className="table-wrap">
        <table className="table"><thead><tr><th>Name</th><th>Max Discount %</th><th></th></tr></thead>
        <tbody>{cats.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.max_discount_pct}%</td><td><button onClick={() => del(c.id)} className="btn-danger btn-sm">Delete</button></td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

// ── Customer Tiers ────────────────────────────────────────────────────────────
function TiersTab() {
  const [tiers, setTiers] = useState([]);
  const [editing, setEditing] = useState({});
  const load = () => api.get('/admin/customer-tiers').then(r => setTiers(r.data));
  useEffect(() => { load(); }, []);

  const save = async (tier) => {
    try { await api.patch(`/admin/customer-tiers/${tier}`, { max_discount_pct: parseFloat(editing[tier]) }); toast.success('Updated'); load(); }
    catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="table-wrap"><table className="table"><thead><tr><th>Tier</th><th>Max Discount %</th><th></th></tr></thead>
    <tbody>{tiers.map(t => (
      <tr key={t.tier}><td className="font-medium">{t.tier}</td>
      <td><input type="number" className="input w-24" defaultValue={t.max_discount_pct} onChange={e => setEditing(ed => ({...ed, [t.tier]: e.target.value}))} /></td>
      <td><button onClick={() => save(t.tier)} className="btn-secondary btn-sm">Save</button></td></tr>
    ))}</tbody></table></div>
  );
}

// ── Approval Rules ────────────────────────────────────────────────────────────
function ApprovalRulesTab() {
  const [rules, setRules] = useState([]);
  const load = () => api.get('/admin/approval-rules').then(r => setRules(r.data));
  useEffect(() => { load(); }, []);

  const update = async (id, field, val) => {
    try { await api.patch(`/admin/approval-rules/${id}`, { [field]: val }); toast.success('Updated'); load(); }
    catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="table-wrap"><table className="table"><thead><tr><th>Risk Level</th><th>Requires Manager</th><th>Requires Finance</th></tr></thead>
    <tbody>{rules.map(r => (
      <tr key={r.id}><td><span className={`badge badge-${r.risk_level}`}>{r.risk_level}</span></td>
      <td><input type="checkbox" checked={r.requires_manager_approval} onChange={e => update(r.id, 'requires_manager_approval', e.target.checked)} className="w-4 h-4" /></td>
      <td><input type="checkbox" checked={r.requires_finance_approval} onChange={e => update(r.id, 'requires_finance_approval', e.target.checked)} className="w-4 h-4" /></td></tr>
    ))}</tbody></table></div>
  );
}

// ── Warehouses ────────────────────────────────────────────────────────────────
function WarehousesTab() {
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({ name: '', ship_cost_weight: 1 });
  const load = () => api.get('/admin/warehouses').then(r => setWarehouses(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.post('/admin/warehouses', form); toast.success('Created'); setForm({ name: '', ship_cost_weight: 1 }); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <div className="flex gap-3 mb-6 items-end">
        <div className="form-group flex-1"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
        <div className="form-group w-36"><label className="label">Ship Cost Weight</label><input type="number" step="0.1" className="input" value={form.ship_cost_weight} onChange={e => setForm(f => ({...f, ship_cost_weight: e.target.value}))} /></div>
        <button onClick={create} className="btn-primary">Add</button>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Ship Cost Weight</th><th>Stock Lines</th></tr></thead>
      <tbody>{warehouses.map(w => <tr key={w.id}><td>{w.name}</td><td>{w.ship_cost_weight}</td><td className="text-slate-400">{w.stock?.length || 0}</td></tr>)}</tbody></table></div>
    </div>
  );
}

// ── Subscription Plans ────────────────────────────────────────────────────────
function SubPlansTab() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ name: '', billing_cycle: 'monthly', proration_rule: '', cancellation_rule: '', refund_rule: '' });
  const load = () => api.get('/admin/subscription-plans').then(r => setPlans(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.post('/admin/subscription-plans', form); toast.success('Created'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <div className="card mb-6 space-y-3">
        <h3 className="font-semibold">New Plan</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
          <div className="form-group"><label className="label">Billing Cycle</label>
            <select className="select" value={form.billing_cycle} onChange={e => setForm(f => ({...f, billing_cycle: e.target.value}))}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="form-group col-span-2"><label className="label">Proration Rule</label><input className="input" value={form.proration_rule} onChange={e => setForm(f => ({...f, proration_rule: e.target.value}))} /></div>
          <div className="form-group col-span-2"><label className="label">Cancellation Rule</label><input className="input" value={form.cancellation_rule} onChange={e => setForm(f => ({...f, cancellation_rule: e.target.value}))} /></div>
        </div>
        <button onClick={create} className="btn-primary">Create Plan</button>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Cycle</th><th>Proration</th></tr></thead>
      <tbody>{plans.map(p => <tr key={p.id}><td className="font-medium">{p.name}</td><td className="capitalize">{p.billing_cycle}</td><td className="text-slate-400 text-xs">{p.proration_rule}</td></tr>)}</tbody></table></div>
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────────
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ name: '', category_id: '', price: '', cost_price: '', tax_pct: 18, subscription_plan_id: '' });
  const load = () => {
    api.get('/admin/products').then(r => setProducts(r.data));
    api.get('/admin/categories').then(r => setCats(r.data));
    api.get('/admin/subscription-plans').then(r => setPlans(r.data));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post('/admin/products', {
        ...form,
        category_id: parseInt(form.category_id),
        price: parseFloat(form.price),
        cost_price: parseFloat(form.cost_price),
        tax_pct: parseFloat(form.tax_pct),
        subscription_plan_id: form.subscription_plan_id ? parseInt(form.subscription_plan_id) : null,
      });
      toast.success('Created');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const archive = async (id) => {
    try { await api.delete(`/admin/products/${id}`); toast.success('Archived'); load(); }
    catch (e) { toast.error('Failed'); }
  };

  return (
    <div>
      <div className="card mb-6 space-y-3">
        <h3 className="font-semibold">New Product</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
          <div className="form-group"><label className="label">Category</label>
            <select className="select" value={form.category_id} onChange={e => setForm(f => ({...f, category_id: e.target.value}))}>
              <option value="">-- Select --</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Subscription Plan (optional)</label>
            <select className="select" value={form.subscription_plan_id} onChange={e => setForm(f => ({...f, subscription_plan_id: e.target.value}))}>
              <option value="">None (one-time)</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Price (₹)</label><input type="number" className="input" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} /></div>
          <div className="form-group"><label className="label">Cost Price (₹)</label><input type="number" className="input" value={form.cost_price} onChange={e => setForm(f => ({...f, cost_price: e.target.value}))} /></div>
          <div className="form-group"><label className="label">Tax %</label><input type="number" className="input" value={form.tax_pct} onChange={e => setForm(f => ({...f, tax_pct: e.target.value}))} /></div>
        </div>
        <button onClick={create} className="btn-primary">Create Product</button>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Cost</th><th>Type</th><th>Status</th><th></th></tr></thead>
      <tbody>{products.map(p => (
        <tr key={p.id}>
          <td className="font-medium text-sm">{p.name}</td>
          <td className="text-slate-400 text-sm">{p.category_name}</td>
          <td className="font-mono text-sm">₹{parseFloat(p.price).toLocaleString('en-IN')}</td>
          <td className="font-mono text-sm">₹{parseFloat(p.cost_price).toLocaleString('en-IN')}</td>
          <td><span className={`badge ${p.subscription_plan_id ? 'badge-pending' : 'badge-draft'}`}>{p.subscription_plan_id ? 'Recurring' : 'One-time'}</span></td>
          <td><span className={`badge ${p.status==='active'?'badge-approved':'badge-rejected'}`}>{p.status}</span></td>
          <td>{p.status === 'active' && <button onClick={() => archive(p.id)} className="btn-danger btn-sm">Archive</button>}</td>
        </tr>
      ))}</tbody></table></div>
    </div>
  );
}

// ── Price Lists ───────────────────────────────────────────────────────────────
function PriceListsTab() {
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState({});
  const load = () => api.get('/admin/price-lists').then(r => setLists(r.data));
  useEffect(() => { load(); }, []);

  const save = async (id) => {
    const ed = editing[id] || {};
    try { await api.patch(`/admin/price-lists/${id}`, ed); toast.success('Updated'); load(); }
    catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="table-wrap"><table className="table"><thead><tr><th>Tier</th><th>Adjustment Type</th><th>Adjustment Value</th><th></th></tr></thead>
    <tbody>{lists.map(pl => (
      <tr key={pl.id}>
        <td className="font-medium">{pl.tier}</td>
        <td>
          <select className="select w-32" defaultValue={pl.adjustment_type} onChange={e => setEditing(ed => ({...ed, [pl.id]: {...(ed[pl.id]||{}), adjustment_type: e.target.value}}))}>
            <option value="none">None</option><option value="percentage">Percentage</option>
          </select>
        </td>
        <td>
          <input type="number" className="input w-24" defaultValue={pl.adjustment_value}
            onChange={e => setEditing(ed => ({...ed, [pl.id]: {...(ed[pl.id]||{}), adjustment_value: e.target.value}}))} />
        </td>
        <td><button onClick={() => save(pl.id)} className="btn-secondary btn-sm">Save</button></td>
      </tr>
    ))}</tbody></table></div>
  );
}

// ── Upsell Rules ──────────────────────────────────────────────────────────────
function UpsellRulesTab() {
  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ primary_product_id: '', suggested_product_id: '', is_promoted: false, min_margin_pct: '' });
  const load = () => { api.get('/admin/upsell-rules').then(r => setRules(r.data)); api.get('/admin/products').then(r => setProducts(r.data)); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.post('/admin/upsell-rules', { ...form, primary_product_id: parseInt(form.primary_product_id), suggested_product_id: parseInt(form.suggested_product_id), min_margin_pct: form.min_margin_pct ? parseFloat(form.min_margin_pct) : null }); toast.success('Created'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const del = async (id) => { try { await api.delete(`/admin/upsell-rules/${id}`); toast.success('Deleted'); load(); } catch (e) { toast.error('Failed'); } };

  return (
    <div>
      <div className="flex gap-3 mb-6 items-end flex-wrap">
        <div className="form-group flex-1"><label className="label">Primary Product</label>
          <select className="select" value={form.primary_product_id} onChange={e => setForm(f => ({...f, primary_product_id: e.target.value}))}>
            <option value="">-- Select --</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group flex-1"><label className="label">Suggested Product</label>
          <select className="select" value={form.suggested_product_id} onChange={e => setForm(f => ({...f, suggested_product_id: e.target.value}))}>
            <option value="">-- Select --</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group w-32"><label className="label">Min Margin %</label><input type="number" className="input" value={form.min_margin_pct} onChange={e => setForm(f => ({...f, min_margin_pct: e.target.value}))} /></div>
        <label className="flex items-center gap-2 text-sm text-slate-300 mb-1"><input type="checkbox" checked={form.is_promoted} onChange={e => setForm(f => ({...f, is_promoted: e.target.checked}))} className="w-4 h-4" /> Promoted</label>
        <button onClick={create} className="btn-primary">Add Rule</button>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Primary Product</th><th>Suggested Product</th><th>Promoted</th><th>Min Margin %</th><th></th></tr></thead>
      <tbody>{rules.map(r => (
        <tr key={r.id}>
          <td className="text-sm">{r.primary_product_name}</td>
          <td className="text-sm">{r.suggested_product_name}</td>
          <td>{r.is_promoted ? <span className="badge badge-approved">★ Yes</span> : 'No'}</td>
          <td className="text-slate-400">{r.min_margin_pct ? `${r.min_margin_pct}%` : '—'}</td>
          <td><button onClick={() => del(r.id)} className="btn-danger btn-sm">Delete</button></td>
        </tr>
      ))}</tbody></table></div>
    </div>
  );
}

// ── Main Admin Settings Page ──────────────────────────────────────────────────
export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('Categories');

  const TabComponents = {
    'Categories': CategoriesTab,
    'Customer Tiers': TiersTab,
    'Approval Rules': ApprovalRulesTab,
    'Warehouses': WarehousesTab,
    'Subscription Plans': SubPlansTab,
    'Products': ProductsTab,
    'Price Lists': PriceListsTab,
    'Upsell Rules': UpsellRulesTab,
  };

  const ActiveComponent = TabComponents[activeTab];

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Admin Configuration</h1></div>

      <div className="flex gap-1 mb-6 flex-wrap">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-6 text-slate-200">{activeTab}</h2>
        <ActiveComponent />
      </div>
    </div>
  );
}
