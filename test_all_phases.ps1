# Full Phase-by-Phase API Test for DealFlow360
# Run from project root: powershell -File test_all_phases.ps1

$BASE = "http://localhost:5000/api"
$Headers = @{ "Content-Type" = "application/json" }
$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Errors = @()

function Pass($phase, $msg) { Write-Host "  [PASS] [$phase] $msg" -ForegroundColor Green }
function Fail($phase, $msg) { Write-Host "  [FAIL] [$phase] $msg" -ForegroundColor Red; $script:Errors += "[$phase] $msg" }
function Section($title) { Write-Host "`n=== $title ===" -ForegroundColor Cyan }

# ── Phase 0/1: Auth ──────────────────────────────────────────────────────────
Section "Phase 0+1 — Auth & Roles"
try {
  $r = Invoke-RestMethod "$BASE/auth/login" -Method POST -Body '{"email":"admin@dealflow.com","password":"Admin@123"}' -ContentType "application/json" -SessionVariable global:S
  if ($r.user.role -eq "admin") { Pass "P1" "Admin login OK (role=$($r.user.role))" } else { Fail "P1" "Wrong role: $($r.user.role)" }
} catch { Fail "P1" "Admin login failed: $_" }

try {
  $r = Invoke-RestMethod "$BASE/auth/login" -Method POST -Body '{"email":"rep@dealflow.com","password":"Rep@123"}' -ContentType "application/json" -SessionVariable global:RepS
  if ($r.user.role -eq "sales_rep") { Pass "P1" "Rep login OK" } else { Fail "P1" "Wrong rep role" }
} catch { Fail "P1" "Rep login failed: $_" }

try {
  $r = Invoke-RestMethod "$BASE/auth/customer/login" -Method POST -Body '{"email":"acme@customer.com","password":"Customer@123"}' -ContentType "application/json" -SessionVariable global:CustS
  if ($r.customer.tier -eq "Bronze") { Pass "P1" "Customer login OK (tier=Bronze)" } else { Fail "P1" "Wrong customer tier" }
} catch { Fail "P1" "Customer login failed: $_" }

# ── Phase 2: Admin Config ────────────────────────────────────────────────────
Section "Phase 2 — Admin Config"
try {
  $r = Invoke-RestMethod "$BASE/admin/categories" -Method GET -WebSession $global:S
  if ($r.Count -ge 3) { Pass "P2" "Categories ($($r.Count) found)" } else { Fail "P2" "Categories too few: $($r.Count)" }
} catch { Fail "P2" "Categories: $_" }

try {
  $r = Invoke-RestMethod "$BASE/admin/warehouses" -Method GET -WebSession $global:S
  if ($r.Count -ge 2) { Pass "P2" "Warehouses ($($r.Count) found)" } else { Fail "P2" "Warehouses too few" }
} catch { Fail "P2" "Warehouses: $_" }

try {
  $r = Invoke-RestMethod "$BASE/admin/products" -Method GET -WebSession $global:S
  if ($r.Count -ge 5) { Pass "P2" "Products ($($r.Count) found)" } else { Fail "P2" "Products too few" }
} catch { Fail "P2" "Products: $_" }

try {
  $r = Invoke-RestMethod "$BASE/admin/price-lists" -Method GET -WebSession $global:S
  if ($r.Count -ge 3) { Pass "P2" "Price lists ($($r.Count) found)" } else { Fail "P2" "Price lists too few" }
} catch { Fail "P2" "Price lists: $_" }

try {
  $r = Invoke-RestMethod "$BASE/admin/upsell-rules" -Method GET -WebSession $global:S
  if ($r.Count -ge 3) { Pass "P2" "Upsell rules ($($r.Count) found)" } else { Fail "P2" "Upsell rules too few" }
} catch { Fail "P2" "Upsell rules: $_" }

# ── Phase 3: Quotation Builder ───────────────────────────────────────────────
Section "Phase 3 — Quotation Builder"
$QuoteId = $null
try {
  # Get customer ID
  $custs = Invoke-RestMethod "$BASE/admin/customer-tiers" -Method GET -WebSession $global:S
  $custR = Invoke-RestMethod "$BASE/auth/customer/login" -Method POST -Body '{"email":"acme@customer.com","password":"Customer@123"}' -ContentType "application/json" -SessionVariable global:CustS2
  $custId = $custR.customer.id

  $q = Invoke-RestMethod "$BASE/quotations" -Method POST -Body "{`"customer_id`":$custId}" -ContentType "application/json" -WebSession $global:RepS
  $QuoteId = $q.id
  if ($QuoteId) { Pass "P3" "Quote created (id=$QuoteId, num=$($q.quote_number))" } else { Fail "P3" "Quote creation failed" }
} catch { Fail "P3" "Create quote: $_" }

$global:QuoteId = $QuoteId

# Get first product id
$Products = $null
try {
  $Products = Invoke-RestMethod "$BASE/admin/products" -Method GET -WebSession $global:S
} catch {}

if ($QuoteId -and $Products) {
  $pid = $Products[0].id
  try {
    $line = Invoke-RestMethod "$BASE/quotations/$QuoteId/lines" -Method POST -Body "{`"product_id`":$pid,`"quantity`":2,`"discount_pct`":5}" -ContentType "application/json" -WebSession $global:RepS
    if ($line.id) { Pass "P3" "Line added (unit_price=$($line.unit_price))" } else { Fail "P3" "Add line failed" }
  } catch { Fail "P3" "Add line: $_" }

  try {
    $qd = Invoke-RestMethod "$BASE/quotations/$QuoteId" -Method GET -WebSession $global:RepS
    if ($qd.totals.revenue -gt 0) { Pass "P3" "Totals computed (revenue=$($qd.totals.revenue))" } else { Fail "P3" "Totals zero" }
  } catch { Fail "P3" "Get detail: $_" }

  # Phase 4: Upsell
  Section "Phase 4 — Upsell & Cross-Sell"
  try {
    $sugg = Invoke-RestMethod "$BASE/quotations/$QuoteId/upsell-suggestions" -Method GET -WebSession $global:RepS
    if ($sugg.Count -ge 0) { Pass "P4" "Upsell suggestions returned ($($sugg.Count))" } else { Fail "P4" "Suggestions error" }
  } catch { Fail "P4" "Upsell suggestions: $_" }
}

# ── Phase 5: Submit & Approval ───────────────────────────────────────────────
Section "Phase 5 — Discount Governance & Approval"
if ($global:QuoteId) {
  try {
    $sub = Invoke-RestMethod "$BASE/quotations/$($global:QuoteId)/submit" -Method POST -WebSession $global:RepS
    if ($sub.risk_level) { Pass "P5" "Submitted (risk=$($sub.risk_level), steps=$($sub.stepsCreated), status=$($sub.newStatus))" } else { Fail "P5" "Submit returned no risk_level" }
  } catch { Fail "P5" "Submit: $_" }

  try {
    $approvals = Invoke-RestMethod "$BASE/approvals" -Method GET -WebSession $global:S
    Pass "P5" "Approvals queue ($($approvals.Count) items)"
  } catch { Fail "P5" "Approvals list: $_" }
}

# ── Phase 6: Fulfillment ─────────────────────────────────────────────────────
Section "Phase 6 — Fulfillment & Warehouse Split"
try {
  $ff = Invoke-RestMethod "$BASE/fulfillment" -Method GET -WebSession $global:S
  Pass "P6" "Fulfillment list OK ($($ff.Count) items)"
} catch { Fail "P6" "Fulfillment list: $_" }

# ── Phase 7/8: Billing & Payments ────────────────────────────────────────────
Section "Phase 7+8 — Billing & Payments"
try {
  $subs = Invoke-RestMethod "$BASE/subscriptions" -Method GET -WebSession $global:S
  Pass "P7" "Subscriptions list OK ($($subs.Count))"
} catch { Fail "P7" "Subscriptions: $_" }

try {
  $invs = Invoke-RestMethod "$BASE/invoices" -Method GET -WebSession $global:S
  Pass "P8" "Invoices list OK ($($invs.Count))"
} catch { Fail "P8" "Invoices: $_" }

# ── Phase 9: Portal ──────────────────────────────────────────────────────────
Section "Phase 9 — Customer Portal Negotiation"
try {
  $pq = Invoke-RestMethod "$BASE/portal/quotations" -Method GET -WebSession $global:CustS2
  Pass "P9" "Portal quotations OK ($($pq.Count))"
} catch { Fail "P9" "Portal quotations: $_" }

# ── Phase 10: Deal Health ────────────────────────────────────────────────────
Section "Phase 10 — Deal Health & Reporting"
try {
  $stalled = Invoke-RestMethod "$BASE/deal-health/stalled" -Method GET -WebSession $global:S
  Pass "P10" "Stalled deals OK ($($stalled.Count))"
} catch { Fail "P10" "Stalled: $_" }

try {
  $anomalies = Invoke-RestMethod "$BASE/deal-health/discount-anomalies" -Method GET -WebSession $global:S
  Pass "P10" "Discount anomalies OK ($($anomalies.Count))"
} catch { Fail "P10" "Anomalies: $_" }

try {
  $reports = Invoke-RestMethod "$BASE/reports" -Method GET -WebSession $global:S
  Pass "P10" "Reports OK"
} catch { Fail "P10" "Reports: $_" }

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Yellow
if ($Errors.Count -eq 0) {
  Write-Host "  ALL PHASES PASSED ✅" -ForegroundColor Green
} else {
  Write-Host "  $($Errors.Count) FAILURE(S) ❌" -ForegroundColor Red
  $Errors | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
}
Write-Host "========================================`n" -ForegroundColor Yellow
