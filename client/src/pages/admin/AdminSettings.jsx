// src/pages/admin/AdminSettings.jsx
import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import Customers from '../Customers';

const TABS = ['Customers', 'Categories', 'Customer Tiers', 'Approval Rules', 'Warehouses', 'Subscription Plans', 'Products', 'Price Lists', 'Upsell Rules', 'Platform Settings'];

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

// ── Warehouses & Stock Management ─────────────────────────────────────────────
function WarehousesTab() {
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [expandedWarehouseId, setExpandedWarehouseId] = useState(null);
  const [form, setForm] = useState({ name: '', ship_cost_weight: 1 });
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [stockEdits, setStockEdits] = useState({});
  const [newStock, setNewStock] = useState({ product_id: '', quantity_on_hand: 0, reorder_threshold: 10, reorder_quantity: 50 });

  const load = async () => {
    try {
      const [wRes, pRes] = await Promise.all([
        api.get('/admin/warehouses'),
        api.get('/admin/products'),
      ]);
      setWarehouses(wRes.data);
      setProducts(pRes.data);
      // Auto-expand first warehouse if none expanded and warehouses exist
      if (!expandedWarehouseId && wRes.data.length > 0) {
        setExpandedWarehouseId(wRes.data[0].id);
      }
    } catch (e) {
      toast.error('Failed to load warehouses or products');
    }
  };

  useEffect(() => { load(); }, []);

  const createWarehouse = async () => {
    if (!form.name.trim()) return toast.error('Warehouse name required');
    try {
      await api.post('/admin/warehouses', {
        name: form.name.trim(),
        ship_cost_weight: parseFloat(form.ship_cost_weight) || 1,
      });
      toast.success('Warehouse created');
      setForm({ name: '', ship_cost_weight: 1 });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create warehouse');
    }
  };

  const updateWarehouse = async (id) => {
    if (!editingWarehouse?.name?.trim()) return toast.error('Warehouse name required');
    try {
      await api.patch(`/admin/warehouses/${id}`, {
        name: editingWarehouse.name.trim(),
        ship_cost_weight: parseFloat(editingWarehouse.ship_cost_weight) || 1,
      });
      toast.success('Warehouse updated');
      setEditingWarehouse(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update warehouse');
    }
  };

  const deleteWarehouse = async (id, name) => {
    if (!confirm(`Are you sure you want to delete warehouse "${name}"?`)) return;
    try {
      await api.delete(`/admin/warehouses/${id}`);
      toast.success('Warehouse deleted');
      if (expandedWarehouseId === id) setExpandedWarehouseId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete warehouse');
    }
  };

  const handleStockEdit = (stockId, field, val) => {
    setStockEdits(prev => ({
      ...prev,
      [stockId]: {
        ...prev[stockId],
        [field]: val,
      },
    }));
  };

  const saveStockLine = async (warehouseId, stockItem) => {
    const edits = stockEdits[stockItem.id] || {};
    const qty = edits.quantity_on_hand !== undefined ? parseInt(edits.quantity_on_hand) : stockItem.quantity_on_hand;
    const threshold = edits.reorder_threshold !== undefined ? (edits.reorder_threshold === '' ? null : parseInt(edits.reorder_threshold)) : stockItem.reorder_threshold;
    const reorderQty = edits.reorder_quantity !== undefined ? (edits.reorder_quantity === '' ? null : parseInt(edits.reorder_quantity)) : stockItem.reorder_quantity;

    if (isNaN(qty) || qty < 0) return toast.error('Quantity on hand must be a non-negative number');
    if (threshold !== null && (isNaN(threshold) || threshold < 0)) return toast.error('Reorder threshold must be >= 0');
    if (reorderQty !== null && (isNaN(reorderQty) || reorderQty < 0)) return toast.error('Reorder quantity must be >= 0');

    try {
      await api.patch(`/admin/warehouses/${warehouseId}/stock/${stockItem.id}`, {
        quantity_on_hand: qty,
        reorder_threshold: threshold,
        reorder_quantity: reorderQty,
      });
      toast.success(`Updated stock for ${stockItem.product_name || 'Product'}`);
      setStockEdits(prev => {
        const copy = { ...prev };
        delete copy[stockItem.id];
        return copy;
      });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update stock');
    }
  };

  const deleteStockLine = async (warehouseId, stockItem) => {
    if (!confirm(`Remove stock tracking for "${stockItem.product_name || 'this product'}" from this warehouse?`)) return;
    try {
      await api.delete(`/admin/warehouses/${warehouseId}/stock/${stockItem.id}`);
      toast.success('Stock line removed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to remove stock line');
    }
  };

  const addStockLine = async (warehouseId) => {
    if (!newStock.product_id) return toast.error('Please select a product');
    const qty = parseInt(newStock.quantity_on_hand);
    const threshold = newStock.reorder_threshold === '' ? null : parseInt(newStock.reorder_threshold);
    const reorderQty = newStock.reorder_quantity === '' ? null : parseInt(newStock.reorder_quantity);

    if (isNaN(qty) || qty < 0) return toast.error('Initial quantity must be >= 0');

    try {
      await api.post(`/admin/warehouses/${warehouseId}/stock`, {
        product_id: parseInt(newStock.product_id),
        quantity_on_hand: qty,
        reorder_threshold: threshold,
        reorder_quantity: reorderQty,
      });
      toast.success('Stock added successfully');
      setNewStock({ product_id: '', quantity_on_hand: 0, reorder_threshold: 10, reorder_quantity: 50 });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add stock');
    }
  };

  const activeWarehouse = warehouses.find(w => w.id === expandedWarehouseId);
  const activeStock = activeWarehouse?.stock || [];
  const existingProductIds = new Set(activeStock.map(s => s.product_id));
  const unstockedProducts = products.filter(p => !existingProductIds.has(p.id));

  return (
    <div className="space-y-6">
      {/* Create Warehouse Form */}
      <div className="card-sm bg-slate-900/90 border border-slate-800">
        <h3 className="font-semibold text-slate-200 text-sm mb-3">Add New Warehouse</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="form-group flex-1 min-w-[200px]">
            <label className="label">Warehouse Name</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Central Depot (Mumbai)"
            />
          </div>
          <div className="form-group w-40">
            <label className="label">Ship Cost Weight</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              className="input"
              value={form.ship_cost_weight}
              onChange={e => setForm(f => ({ ...f, ship_cost_weight: e.target.value }))}
              placeholder="1.0"
            />
          </div>
          <button onClick={createWarehouse} className="btn-primary">
            <span>+</span> Add Warehouse
          </button>
        </div>
      </div>

      {/* Warehouses Overview List */}
      <div>
        <h3 className="font-semibold text-slate-200 text-sm mb-3">Configured Warehouses</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Warehouse Name</th>
                <th>Ship Cost Weight</th>
                <th>Stocked SKUs</th>
                <th>Total Units</th>
                <th>Inventory Alerts</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-6 text-slate-500">
                    No warehouses configured yet.
                  </td>
                </tr>
              ) : (
                warehouses.map(w => {
                  const stockList = w.stock || [];
                  const totalUnits = stockList.reduce((sum, s) => sum + (Number(s.quantity_on_hand) || 0), 0);
                  const lowStockCount = stockList.filter(s => s.reorder_threshold != null && s.quantity_on_hand <= s.reorder_threshold && s.quantity_on_hand > 0).length;
                  const outOfStockCount = stockList.filter(s => s.quantity_on_hand === 0).length;
                  const isExpanded = expandedWarehouseId === w.id;
                  const isEditing = editingWarehouse?.id === w.id;

                  return (
                    <tr key={w.id} className={isExpanded ? 'bg-indigo-950/20 border-l-2 border-indigo-500' : ''}>
                      <td>
                        {isEditing ? (
                          <input
                            className="input py-1 text-xs"
                            value={editingWarehouse.name}
                            onChange={e => setEditingWarehouse(ew => ({ ...ew, name: e.target.value }))}
                          />
                        ) : (
                          <span className="font-medium text-slate-100">{w.name}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.1"
                            className="input py-1 text-xs w-24"
                            value={editingWarehouse.ship_cost_weight}
                            onChange={e => setEditingWarehouse(ew => ({ ...ew, ship_cost_weight: e.target.value }))}
                          />
                        ) : (
                          <span className="font-mono text-slate-300">{Number(w.ship_cost_weight).toFixed(2)}x</span>
                        )}
                      </td>
                      <td>
                        <span className="text-slate-300">{stockList.length} SKUs</span>
                      </td>
                      <td>
                        <span className="font-semibold text-slate-200">{totalUnits.toLocaleString()}</span>
                      </td>
                      <td>
                        <div className="flex gap-1.5 flex-wrap">
                          {outOfStockCount > 0 && (
                            <span className="badge badge-danger">{outOfStockCount} Out of Stock</span>
                          )}
                          {lowStockCount > 0 && (
                            <span className="badge badge-pending">{lowStockCount} Low Stock</span>
                          )}
                          {outOfStockCount === 0 && lowStockCount === 0 && stockList.length > 0 && (
                            <span className="badge badge-approved">Healthy</span>
                          )}
                          {stockList.length === 0 && (
                            <span className="text-xs text-slate-500">No stock lines</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={() => updateWarehouse(w.id)} className="btn-success btn-sm">
                                Save
                              </button>
                              <button onClick={() => setEditingWarehouse(null)} className="btn-ghost btn-sm">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setExpandedWarehouseId(isExpanded ? null : w.id)}
                                className={`btn-sm ${isExpanded ? 'btn-primary' : 'btn-secondary'}`}
                              >
                                {isExpanded ? 'Hide Stock ▲' : 'Manage Stock ▼'}
                              </button>
                              <button
                                onClick={() => setEditingWarehouse({ id: w.id, name: w.name, ship_cost_weight: w.ship_cost_weight })}
                                className="btn-ghost btn-sm text-slate-400 hover:text-slate-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteWarehouse(w.id, w.name)}
                                className="btn-danger btn-sm"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded Manage Stock Panel */}
      {activeWarehouse && (
        <div className="card border-indigo-900/50 bg-slate-900/80 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-100">Stock & Replenishment Rules:</span>
                <span className="text-lg font-bold text-indigo-400">{activeWarehouse.name}</span>
                <span className="text-xs text-slate-500">({activeStock.length} products tracked)</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Configure on-hand inventory levels, reorder warning thresholds, and replenishment batch quantities for greedy fulfillment routing.
              </p>
            </div>
            <button
              onClick={() => setExpandedWarehouseId(null)}
              className="btn-ghost btn-sm text-slate-400 hover:text-slate-200"
            >
              ✕ Close
            </button>
          </div>

          {/* Current Stock Lines Table */}
          <div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="w-36">Quantity On Hand</th>
                    <th className="w-36">Reorder Threshold</th>
                    <th className="w-36">Reorder Quantity</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStock.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-500">
                        No products are currently tracked in {activeWarehouse.name}. Use the form below to add stock.
                      </td>
                    </tr>
                  ) : (
                    activeStock.map(s => {
                      const edits = stockEdits[s.id] || {};
                      const currentQty = edits.quantity_on_hand !== undefined ? edits.quantity_on_hand : s.quantity_on_hand;
                      const currentThreshold = edits.reorder_threshold !== undefined ? edits.reorder_threshold : (s.reorder_threshold ?? '');
                      const currentReorderQty = edits.reorder_quantity !== undefined ? edits.reorder_quantity : (s.reorder_quantity ?? '');
                      const isDirty = edits.quantity_on_hand !== undefined || edits.reorder_threshold !== undefined || edits.reorder_quantity !== undefined;

                      const numericQty = Number(currentQty);
                      const numericThreshold = Number(currentThreshold);

                      let statusBadge = <span className="badge badge-approved">Optimal</span>;
                      if (numericQty === 0) {
                        statusBadge = <span className="badge badge-danger">Out of Stock</span>;
                      } else if (currentThreshold !== '' && numericQty <= numericThreshold) {
                        statusBadge = <span className="badge badge-pending">Low Stock</span>;
                      }

                      return (
                        <tr key={s.id} className={isDirty ? 'bg-indigo-950/20' : ''}>
                          <td>
                            <div>
                              <span className="font-medium text-slate-100">{s.product_name || `Product #${s.product_id}`}</span>
                              {s.product_unit && (
                                <span className="text-xs text-slate-500 ml-2">({s.product_unit})</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">ID: {s.product_id}</div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              className="input py-1 text-sm font-mono w-28"
                              value={currentQty}
                              onChange={e => handleStockEdit(s.id, 'quantity_on_hand', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              placeholder="None"
                              className="input py-1 text-sm font-mono w-28"
                              value={currentThreshold}
                              onChange={e => handleStockEdit(s.id, 'reorder_threshold', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              placeholder="None"
                              className="input py-1 text-sm font-mono w-28"
                              value={currentReorderQty}
                              onChange={e => handleStockEdit(s.id, 'reorder_quantity', e.target.value)}
                            />
                          </td>
                          <td>{statusBadge}</td>
                          <td>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveStockLine(activeWarehouse.id, s)}
                                className={`btn-sm ${isDirty ? 'btn-primary' : 'btn-secondary text-slate-400'}`}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => deleteStockLine(activeWarehouse.id, s)}
                                className="btn-ghost btn-sm text-red-400 hover:text-red-300 hover:bg-red-950/30"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Stock Form */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
              <span className="text-indigo-400">+</span> Add Product Stock to {activeWarehouse.name}
            </h4>
            {unstockedProducts.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                All catalog products are currently tracked in this warehouse. Edit existing lines above to adjust stock levels.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="form-group md:col-span-1">
                  <label className="label">Select Product *</label>
                  <select
                    className="select"
                    value={newStock.product_id}
                    onChange={e => setNewStock(ns => ({ ...ns, product_id: e.target.value }))}
                  >
                    <option value="">-- Choose Product --</option>
                    {unstockedProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.price})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Quantity On Hand</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={newStock.quantity_on_hand}
                    onChange={e => setNewStock(ns => ({ ...ns, quantity_on_hand: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Reorder Threshold</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={newStock.reorder_threshold}
                    onChange={e => setNewStock(ns => ({ ...ns, reorder_threshold: e.target.value }))}
                    placeholder="10"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Reorder Quantity</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      className="input flex-1"
                      value={newStock.reorder_quantity}
                      onChange={e => setNewStock(ns => ({ ...ns, reorder_quantity: e.target.value }))}
                      placeholder="50"
                    />
                    <button
                      onClick={() => addStockLine(activeWarehouse.id)}
                      className="btn-primary whitespace-nowrap"
                    >
                      Add Stock
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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

// ── Platform Settings (Gap 4) ────────────────────────────────────────────
function PlatformSettingsTab() {
  const [settings, setSettings] = useState([]);
  const [editing, setEditing] = useState({});
  const load = () => api.get('/admin/platform-settings').then(r => setSettings(r.data));
  useEffect(() => { load(); }, []);

  const save = async (key) => {
    const val = editing[key];
    if (val === undefined || val === null || String(val).trim() === '') {
      return toast.error('Value cannot be empty');
    }
    try {
      await api.patch(`/admin/platform-settings/${key}`, { value: String(val).trim() });
      toast.success(`Setting "${key}" updated`);
      setEditing(ed => { const c = { ...ed }; delete c[key]; return c; });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to update'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Configure system-wide settings. Changes take effect immediately — no server restart required.</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Description</th>
              <th className="w-48">Current Value</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {settings.length === 0 ? (
              <tr><td colSpan="4" className="text-center py-6 text-slate-500">No settings found. Ensure the <code>platform_settings</code> table is seeded.</td></tr>
            ) : settings.map(s => {
              const val = editing[s.key] !== undefined ? editing[s.key] : s.value;
              const isDirty = editing[s.key] !== undefined && editing[s.key] !== s.value;
              return (
                <tr key={s.key} className={isDirty ? 'bg-indigo-950/20' : ''}>
                  <td><code className="text-indigo-300 text-xs bg-slate-900 px-2 py-0.5 rounded">{s.key}</code></td>
                  <td className="text-slate-400 text-sm">{s.label || '—'}</td>
                  <td>
                    <input
                      className="input py-1 text-sm font-mono w-full"
                      value={val}
                      onChange={e => setEditing(ed => ({ ...ed, [s.key]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        onClick={() => save(s.key)}
                        className={`btn-sm ${isDirty ? 'btn-primary' : 'btn-secondary text-slate-400'}`}
                        disabled={!isDirty}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">Setting Reference</h4>
        <ul className="text-xs text-slate-400 space-y-1">
          <li><code className="text-indigo-300">stalled_deal_days</code> — Number of days of inactivity before a deal appears in the Stalled Deals dashboard. Default: 7.</li>
        </ul>
      </div>
    </div>
  );
}

// ── Main Admin Settings Page ──────────────────────────────────────────────────
export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('Categories');

  const TabComponents = {
    'Customers': Customers,
    'Categories': CategoriesTab,
    'Customer Tiers': TiersTab,
    'Approval Rules': ApprovalRulesTab,
    'Warehouses': WarehousesTab,
    'Subscription Plans': SubPlansTab,
    'Products': ProductsTab,
    'Price Lists': PriceListsTab,
    'Upsell Rules': UpsellRulesTab,
    'Platform Settings': PlatformSettingsTab,
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
