# Pomen Laut — Fishnet Recycling Admin (Google Sheets + Apps Script)

Small admin webapp that helps staff register fishermen, log fishnet drop-offs, and track payouts.

## Overview
- Frontend: `Index.html` (Apps Script HTMLService) — simple admin UI for searching, registering, and logging drops.
- Backend: `Code.gs` — Apps Script server code that manages sheet I/O, allocation logic, and payout preparation.
- Data store: single Google Spreadsheet with four sheets (see below).

## Required Sheets & Exact Headers
Create a Google Spreadsheet and add these sheets (names must match):

- Fishermen Registry
  - Person ID | Full Name | Phone | Village | Registry Date
- Deals
  - Deal ID | Threshold (kg) | Rate Clean (RM/kg) | Rate Partial (RM/kg) | Rate Unclean (RM/kg) | Created Date
- Payment History
  - Payment ID | Fisherman ID | Status | Accumulated Weight (kg) | Payload (RM) | Deal ID | Date
- Drop-off Log
  - Drop ID | Fisherman ID | Date | Net Weight (kg) | Purity | Inspector | Notes | Payment ID

Notes:
- Header names are used exactly by the script. If you change names, update `headerMap` usages or modify the code.
- `Status` values used by the app: `Pending`, `Payment due`, `Paid`. `Paid` must be set manually by staff in the sheet.

## Deployment (Publish Web App)
1. Open the script project (Extensions → Apps Script) for the spreadsheet or open the project in the Apps Script editor.
2. In Apps Script, click **Deploy → New deployment → Web app**.
3. Set **Who has access** (your organization or Anyone as needed) and **Execute as** your account.
4. Click **Deploy** and open the provided URL to use the admin UI.

Example minimal test (once deployed):
```bash
# open the web app URL in a browser and follow these steps from the UI
```

## Basic Usage / SOP (what the app automates)

Scenario A — First-time fisherman
- Register in the Quick Register panel (creates a `Person ID`).
- Log drop: staff selects or pastes `Person ID`, enters weight and purity.
- System creates a `Payment History` row with `Status = Pending` and accumulated weight equal to the drop.

Scenario B — Returning fisherman (below threshold)
- Search and select fisherman.
- Log drop: system appends the drop and adds its weight to the existing `Pending` payment's `Accumulated Weight (kg)`.

Scenario C — Threshold reached
- When accumulated weight meets/exceeds the active deal threshold, the system:
  - Allocates drops to reach the threshold and caps the paid weight to the threshold.
  - Marks that payment row `Status` as `Payment due` (NOT `Paid`). Staff should review and mark `Paid` manually in the sheet.
  - Creates a new `Pending` row for leftover weight (if any).
  - Tags the contributing rows in `Drop-off Log` by setting their `Payment ID` for auditability.

Important: `Paid` is intentionally not set programmatically — this prevents accidental payouts and gives staff a chance to verify.

## Testing checklist
- Ensure sheet headers exactly match names listed above.
- Create a `Deals` row with a threshold and rates (this is the “active deal”).
