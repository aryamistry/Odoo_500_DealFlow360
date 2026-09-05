// src/components/Pagination.jsx
// Reusable pagination bar used across all DealFlow360 list pages.
// Props:
//   page        — current page (1-indexed)
//   totalPages  — total number of pages
//   total       — total record count
//   limit       — records per page
//   onPageChange(newPage) — callback
//   onLimitChange(newLimit) — callback (optional)
//   pageSizeOptions — array of numbers (default [10, 25, 50, 100])

export default function Pagination({
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 25,
  onPageChange,
  onLimitChange,
  pageSizeOptions = [10, 25, 50, 100],
}) {
  if (totalPages <= 1 && total <= pageSizeOptions[0]) return null;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  // Build visible page numbers (max 5 around current page)
  const buildPages = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [];
    const delta = 2;
    const left  = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);

    pages.push(1);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800">
      {/* Record count info */}
      <p className="text-sm text-slate-400 shrink-0">
        {total === 0 ? 'No records' : `Showing ${from}–${to} of ${total}`}
      </p>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {/* Prev */}
        <button
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ← Prev
        </button>

        {/* Page numbers */}
        {buildPages().map((p, idx) =>
          p === '…' ? (
            <span key={`ellipsis-${idx}`} className="text-slate-500 px-1">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`btn btn-sm min-w-[2rem] ${p === page ? 'btn-primary' : 'btn-secondary'}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next →
        </button>

        {/* Page size selector */}
        {onLimitChange && (
          <select
            className="select text-sm py-1 pl-2 pr-6 w-auto"
            value={limit}
            onChange={e => {
              onLimitChange(Number(e.target.value));
              onPageChange(1);
            }}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
