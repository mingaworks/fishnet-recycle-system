# Pomen Laut — Fishnet Recycling Management

This project is used by [Pomen Laut](http://pomenlautprojects.org/) staff to run day-to-day fishnet recycling operations from a single Google Spreadsheet. It provides a simple web UI (Apps Script Web App) for consistent data entry, automated payment allocation, and auditability of payouts.

Administrative Web Application for:
- Registering fishermen
- Logging fishnet drop-offs
- Automatically allocating drop-offs into payments
- Confirming payouts and auditing which drop-offs contributed
- Viewing monthly volunteer (inspector) contributions

In-app links:
- In-app docs link is configured via the Script Property `GOOGLE_DOCS_ID` (Google Doc ID only).
- Source repo: https://github.com/mingaworks/fishnet-recycle-system

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

## Apps Script setup (first time)
1. Create (or open) the operational Google Spreadsheet.
2. Create the required sheet tabs and headers exactly as described above.
3. Go to Extensions → Apps Script.
4. In the Apps Script editor:
   - Replace the default `Code.gs` contents with this repo’s `Code.gs`.
   - Add a new HTML file named `Index` and paste in this repo’s `Index.html` contents.
5. Configure Script Properties (Project Settings → Script Properties):
  - `GOOGLE_DOCS_ID`: the Google Doc ID (the part after `/d/`) for the in-app “Read the docs” link.
5. Save.

## Deploy (publish as a Web App)
1. Open the Google Spreadsheet.
2. Go to Extensions → Apps Script.
3. Deploy → New deployment → Web app.
4. Configure:
   - Execute as: you
   - Who has access: choose based on your org’s needs
5. Deploy and open the Web App URL.

Notes:
- If you update `Code.gs` / `Index.html`, you need to create a new deployment version (or update the existing deployment) for changes to appear to users.

## Staff SOP
Day-to-day usage instructions are in [docs/SOP.md](docs/SOP.md)

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
- Payments: `getDuePayments()` (also `getOpenPayments()` alias), `confirmPayment(paymentId)`, `getPaidPayments()`, `getDropoffsByPaymentId(paymentId)`, `markPaymentUnpaid(paymentId)`
- Volunteer contribution: `getVolunteerContributionMonth({ year, month })`

## Quick troubleshooting
- “No active deal configured”: add a row to Deals (threshold + rates).
- Search/typeahead returns nothing: confirm Fishermen Registry headers match exactly.
- Payments not appearing:
  - confirm Payment History headers match exactly
  - ensure rows have a non-empty Payment ID
  - ensure Status is `Payment Due` or `Paid` (case/spacing variants are usually handled)
## UI notes
- The footer includes a link to the SOP docs and a GitHub icon linking to the source repo.
- Confirming a payment is intentionally gated behind a modal (financially sensitive).
