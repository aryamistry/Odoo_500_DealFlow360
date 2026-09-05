# Subscription Plan Rules — What To Actually Do

This is the exact checklist to apply the Proration/Cancellation/Refund rule fix discussed — turning free-text fields into real, enforced business logic.

---

## 1. Run the database migration

Connect to your `dealflow360` database and run:

```sql
ALTER TABLE subscription_plans
  ADD CONSTRAINT proration_rule_valid
    CHECK (proration_rule IN ('prorated', 'full_charge', 'no_proration')),
  ADD CONSTRAINT cancellation_rule_valid
    CHECK (cancellation_rule IN ('immediate', 'end_of_cycle')),
  ADD CONSTRAINT refund_rule_valid
    CHECK (refund_rule IN ('full', 'prorated', 'none'));
```

**Via PowerShell (from your project root, adjust path if needed):**
```powershell
psql -U postgres -d dealflow360 -c "ALTER TABLE subscription_plans ADD CONSTRAINT proration_rule_valid CHECK (proration_rule IN ('prorated','full_charge','no_proration')), ADD CONSTRAINT cancellation_rule_valid CHECK (cancellation_rule IN ('immediate','end_of_cycle')), ADD CONSTRAINT refund_rule_valid CHECK (refund_rule IN ('full','prorated','none'));"
```

**⚠️ If you already have existing rows with invalid free-text values** (e.g. "prorate monthly" instead of `prorated`), this migration will fail. Fix existing rows first:
```sql
UPDATE subscription_plans SET proration_rule = 'prorated' WHERE proration_rule NOT IN ('prorated','full_charge','no_proration') OR proration_rule IS NULL;
UPDATE subscription_plans SET cancellation_rule = 'end_of_cycle' WHERE cancellation_rule NOT IN ('immediate','end_of_cycle') OR cancellation_rule IS NULL;
UPDATE subscription_plans SET refund_rule = 'none' WHERE refund_rule NOT IN ('full','prorated','none') OR refund_rule IS NULL;
```
Then re-run the `ALTER TABLE` above.

---

## 2. Update the two application files

Replace these two files in your project with the versions already edited in this conversation:

| File | What changed |
|---|---|
| `client/src/pages/admin/AdminSettings.jsx` | `SubPlansTab` — text inputs replaced with fixed dropdowns; added missing Refund Rule field; table now shows all three rules |
| `server/src/routes/billing.js` | Added `cycleDaysRemaining()` helper; `PATCH /subscriptions/:id` now auto-computes proration on quantity change; `POST /subscriptions/:id/cancel` now auto-computes refund from `refund_rule` |

If you want these packaged as ready-to-copy files instead of pasting manually, ask and they'll be zipped up.

---

## 3. Restart the app

```powershell
# Terminal 1 — backend
cd server
npm run dev

# Terminal 2 — frontend
cd client
npm run dev
```

---

## 4. Verify it actually works

1. **Log in as Admin** → go to **Subscription Plans**.
2. Create a plan with:
   - Proration Rule: `Prorated`
   - Cancellation Rule: `End of Cycle`
   - Refund Rule: `Prorated Refund`
3. Confirm the table row shows all three values (not blank).
4. **Attach that plan to a subscription product**, create a quotation with it, confirm the quote so a subscription record is created.
5. **Test proration:** call `PATCH /api/billing/subscriptions/:id` with a `quantity_override` different from the current quantity. Check the response — it should include `proration_applied` and `rule_used`, and a new row should appear in `payment_transactions`.
6. **Test refund on cancel:** call `POST /api/billing/subscriptions/:id/cancel`. Check the response includes `refund_issued` and `rule_used` — a `credit_note` transaction should be created automatically, with no `credit_amount` needing to be passed in manually.

---

## 5. Known follow-up (not yet built)

- `cancellation_rule = 'end_of_cycle'` currently still cancels the subscription **immediately** in the database — it doesn't yet delay the actual status change until `next_bill_date`. A scheduled job (e.g. a daily cron checking for subscriptions past their `next_bill_date` with a pending end-of-cycle cancellation) would be needed to make this fully correct.
- The `cycleDaysRemaining()` calculation uses fixed day counts (30/90/365) per billing cycle rather than exact calendar dates — accurate enough for most cases, but not calendar-precise (e.g. February).

---

*This closes gap #1 (mid-cycle proration) and gap #2 (automatic refund/credit notes) from the earlier gaps review. Gaps #3 (XLS export) and #4 (configurable stalled-day threshold) are unrelated and still open.*
