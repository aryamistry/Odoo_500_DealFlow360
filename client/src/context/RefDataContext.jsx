// src/context/RefDataContext.jsx
// Phase 13 Section C — client-side cache for read-mostly reference/config data.
//
// WHY: AdminSettings.jsx re-fetches categories, customer-tiers, approval-rules,
// warehouses, subscription-plans and price-lists on EVERY tab switch because each
// tab component has its own useEffect + api.get().  At seeded scale (and even
// before) this means dozens of round-trips for data that never changes between
// visits.  A shared 5-minute TTL cache eliminates the redundancy without changing
// any query logic or endpoint shape — same data, same endpoints, one fetch.
//
// USAGE:
//   const { categories, tiers, approvalRules, priceLists,
//           subscriptionPlans, warehouses, invalidate } = useRefData();
//
//   After a successful mutation (add/delete/edit) call:
//     invalidate('categories')   — forces next access to re-fetch from the server

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import api from '../api/client';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Map of cache key -> API path
const ENDPOINTS = {
  categories:        '/admin/categories',
  tiers:             '/admin/customer-tiers',
  approvalRules:     '/admin/approval-rules',
  priceLists:        '/admin/price-lists',
  subscriptionPlans: '/admin/subscription-plans',
  warehouses:        '/admin/warehouses',
};

const RefDataContext = createContext(null);

export function RefDataProvider({ children }) {
  // cache: { [key]: { data, fetchedAt } }
  const cache = useRef({});
  // trigger re-renders when a key's data changes
  const [version, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  // Returns cached data (or null if stale/missing).  Kicks off a background
  // fetch if the entry is absent or expired, then bumps the version so
  // consumers re-render with fresh data.
  const getData = useCallback((key) => {
    const entry = cache.current[key];
    const now = Date.now();

    if (entry && now - entry.fetchedAt < TTL_MS) {
      return entry.data;
    }

    // Fetch (or re-fetch) asynchronously — don't block the caller
    const path = ENDPOINTS[key];
    if (!path) return null;

    api.get(path)
      .then(r => {
        cache.current[key] = { data: r.data, fetchedAt: Date.now() };
        bump();
      })
      .catch(() => {
        // leave stale data in place on error so the UI doesn't lose its list
      });

    // Return whatever we have now (may be null on first load, stale on TTL miss)
    return entry ? entry.data : null;
  }, []);

  // Call after a mutation (create/update/delete) to drop the cache entry and
  // force a fresh fetch on next access.
  const invalidate = useCallback((key) => {
    delete cache.current[key];
    bump();
  }, []);

  const value = {
    get categories()        { return getData('categories'); },
    get tiers()             { return getData('tiers'); },
    get approvalRules()     { return getData('approvalRules'); },
    get priceLists()        { return getData('priceLists'); },
    get subscriptionPlans() { return getData('subscriptionPlans'); },
    get warehouses()        { return getData('warehouses'); },
    invalidate,
    // version is exposed so consumers can force a re-render when they detect
    // a stale value (advanced use — most code won't need it directly)
    _version: version,
  };

  return (
    <RefDataContext.Provider value={value}>
      {children}
    </RefDataContext.Provider>
  );
}

export function useRefData() {
  const ctx = useContext(RefDataContext);
  if (!ctx) throw new Error('useRefData must be used inside <RefDataProvider>');
  return ctx;
}
