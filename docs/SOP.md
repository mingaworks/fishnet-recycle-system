# Staff SOP — Fishnet Recycling App

This document describes the day-to-day workflow for staff using the Apps Script Web App.

## 1) Find / Register fisherman
- Use the Find Fisherman box (typeahead search by name or Person ID).
- If no match, click **+ Register Fisherman** (link under the search box) to open a modal and create a new fisherman.
- After registering, the UI selects the new fisherman and refreshes the typeahead cache.
- Use the back arrow in the fisherman workflow header to reset the selection and return to search.

## 2) Admit fishnet (log a drop-off)
- Select a fisherman first.
- The Admit Fishnet panel shows:
  - Fisherman summary (name/phone + ID/village)
  - Fisherman ID (read-only)
- Enter:
  - Weight (kg)
  - Purity (radio buttons: Clean / Partial / Unclean)
- Inspector name (**required**)
  - Notes (optional)
- Click Submit to create a Drop-off Log row and trigger allocation.

Manage existing (unpaid) drop-offs:
- Use **Manage Drop-offs** tab to edit or delete drop-offs that are not part of **Paid** payments.
- Editing/deleting triggers server-side reallocation and refreshes due/paid/payment summaries.

## 3) Automatic allocation & payment lifecycle
When a drop-off is logged:
- The script allocates untagged drop-offs into the current Accumulating payment until the deal threshold is met.
- If the threshold is met/exceeded:
  - the payment is finalized as `Payment Due`
  - contributing drop-offs are tagged in Drop-off Log with the payment’s `Payment ID`
  - any leftover (excess) weight is split into a new untagged drop row and a new Accumulating payment is created

Payload:
- The `Payload (RM)` is computed from tagged drop-offs using the active deal’s rates and rounded to 2 decimals.

## 4) Due payments → confirm payout
- The UI lists all `Payment Due` items with fisherman name/phone.
- Clicking **Confirm payment** opens a confirmation modal that restates:
  - Fisherman name
  - Total weight
  - Payment amount
  - Payment ID
- Confirming marks the payment as `Paid` and the backend stamps the payment date/time.

Correction (if a payment was confirmed by mistake):
- Use the fisherman’s **Payment History** tab and click **Mark as unpaid** on the relevant payment.
- This removes the paid payment record and clears the tagged drop-offs so the backend can re-evaluate allocations.

## 5) Payment explorer (paid payments + audit)
- Shows `Paid` payments.
- Month navigation (Prev/Next) filters the list to one month at a time.
- Each paid payment has an orange disclosure control (e.g. `> View drop-offs`) to show the exact tagged drop-offs.

Date display:
- Backend stores Dates as real sheet date values.
- UI shows payment timestamps as `17 Nov 2025 17:35`.

## 6) Volunteer contribution (monthly)
- Month navigation (Prev/Next) with a month label.
- Totals net weight by inspector for the selected month, including a breakdown by purity.

## 7) Fisherman payment history (per fisherman)
- In the fisherman workflow card, the **Payment History** tab lists paid payments for the selected fisherman.
- Each row includes Payment ID, weight, payout, and date, plus a **Mark as unpaid** action for admin correction.
