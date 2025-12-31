# Pomen Laut — Fishnet Recycling Management

This project is used by [Pomen Laut](http://pomenlautprojects.org/) staff to run day-to-day fishnet recycling operations from a single Google Spreadsheet. It provides a simple web UI (Apps Script Web App) for consistent data entry, automated payment allocation, and auditability of payouts.

Administrative Web Application for:
- Registering fishermen
- Logging fishnet drop-offs
- Automatically allocating drop-offs into payments
- Confirming payouts and auditing which drop-offs contributed
- Viewing monthly volunteer (inspector) contributions
## What’s in this repo
- `Index.html`: Admin UI (search/typeahead, register modal, admit fishnet, payments, volunteer contribution)
- `Code.gs`: Backend (Sheets I/O, allocation logic, payment querying/confirmation, volunteer contribution summary)

## Spreadsheet setup

Create one Google Spreadsheet and add these sheet tabs (names must match exactly):

### Fishermen Registry
Headers:
- Person ID | Full Name | Phone | Village | Registry Date

### Deals
Headers:
- Deal ID | Threshold (kg) | Rate Clean (RM/kg) | Rate Partial (RM/kg) | Rate Unclean (RM/kg) | Created Date

Notes:
- The active deal is the last row in this sheet.

### Payment History
Headers:
- Payment ID | Fisherman ID | Status | Accumulated Weight (kg) | Payload (RM) | Deal ID | Date

Status values written/used by the script:
- `Accumulating`
- `Payment Due`
- `Paid`

### Drop-off Log
Headers:
- Drop ID | Fisherman ID | Date | Net Weight (kg) | Purity | Inspector | Notes | Payment ID

Notes:
- The script ensures the `Payment ID` column exists in Drop-off Log (it adds it if missing).
- For auditability, drop-off rows that “count toward” a payment are tagged with that payment’s `Payment ID`.

## Deploy (publish as a Web App)
1. Open the Google Spreadsheet.
2. Go to Extensions → Apps Script.
3. Deploy → New deployment → Web app.
4. Configure:
   - Execute as: you
   - Who has access: choose based on your org’s needs
5. Deploy and open the Web App URL.

## How the app works (staff SOP)

### 1) Find / Register fisherman
- Use the Find Fisherman box (typeahead search by name or Person ID).
- If no match, click Register to open a modal and create a new fisherman.
- After registering, the UI selects the new fisherman and refreshes the typeahead cache.

### 2) Admit fishnet (log a drop-off)
- Select a fisherman first.
- The Admit Fishnet panel shows:
  - Fisherman summary (name/phone + ID/village)
  - Fisherman ID (read-only)
- Enter:
  - Weight (kg)
  - Purity (radio buttons: Clean / Partial / Unclean)
  - Inspector name (optional)
  - Notes (optional)
- Click Submit to create a Drop-off Log row and trigger allocation.

### 3) Automatic allocation & payment lifecycle
When a drop-off is logged:
- The script allocates untagged drop-offs into the current Accumulating payment until the deal threshold is met.
- If the threshold is met/exceeded:
  - the payment is finalized as `Payment Due`
  - contributing drop-offs are tagged in Drop-off Log with the payment’s `Payment ID`
  - any leftover (excess) weight is split into a new untagged drop row and a new Accumulating payment is created

Payload:
- The `Payload (RM)` is computed from tagged drop-offs using the active deal’s rates and rounded to 2 decimals.

### 4) Due payments → confirm payout
- The UI lists all `Payment Due` items with fisherman name/phone.
- Clicking Confirm payment updates the Payment History row status to `Paid`.

### 5) Payment explorer (paid payments + audit)
- Shows `Paid` payments.
- Month navigation (Prev/Next) filters the list to one month at a time.
- Each paid payment has a View drop-offs button to show the exact tagged drop-offs.

Date display:
- Backend stores Dates as real sheet date values.
- UI shows payment timestamps as `17 Nov 2025 17:35`.

### 6) Volunteer contribution (monthly)
- Month navigation (Prev/Next) with a month label.
- Totals net weight by inspector for the selected month, including a breakdown by purity.

## Implementation notes
- Sheet headers are used by name; changing header text requires code updates.
- The code is defensive against “table-style” sheets that create blank rows:
  - Payment History rows without `Payment ID` are ignored.
  - Payment status matching is normalized (whitespace / case).
- Server date formatting uses the script timezone.

## Backend functions (called from the UI)
- `doGet()`
- Fishermen: `getFishermen()`, `findFishermen(query)`, `registerFisherman({ fullName, phone, village })`
- Deals: `getActiveDeal()`
- Drop-offs: `logDropAndProcess({ fishermanId, netWeight, purity, inspector, notes })`
- Payments: `getDuePayments()` (also `getOpenPayments()` alias), `confirmPayment(paymentId)`, `getPaidPayments()`, `getDropoffsByPaymentId(paymentId)`
- Volunteer contribution: `getVolunteerContributionMonth({ year, month })`

## Quick troubleshooting
- “No active deal configured”: add a row to Deals (threshold + rates).
- Search/typeahead returns nothing: confirm Fishermen Registry headers match exactly.
- Payments not appearing:
  - confirm Payment History headers match exactly
  - ensure rows have a non-empty Payment ID
  - ensure Status is `Payment Due` or `Paid` (case/spacing variants are usually handled)
