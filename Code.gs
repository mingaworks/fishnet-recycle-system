const SHEET_NAMES = {
    FISHERMEN: 'Fishermen Registry',
    DEALS: 'Deals',
    PAYMENTS: 'Payment History',
    DROPS: 'Drop-off Log'
};

function getSs() {
    return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
    return getSs().getSheetByName(name);
}

function getDataRows(sheet) {
    // return values for rows below header; return empty array when no data
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function headerMap(sheet) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = {};
    headers.forEach((h, i) => { map[h.trim()] = i + 1; });
    return map;
}

function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index').setTitle('Fishnet Recycling Admin');
}

function getActiveDeal() {
    const sheet = getSheet(SHEET_NAMES.DEALS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const headers = headerMap(sheet);
    const vals = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    // assume latest deal is last non-empty row
    const last = vals[vals.length - 1];
    return {
        rowIndex: lastRow,
        data: {
            dealId: last[headers['Deal ID'] - 1],
            thresholdKg: parseFloat(last[headers['Threshold (kg)'] - 1]),
            rateClean: parseFloat(last[headers['Rate Clean (RM/kg)'] - 1]),
            ratePartial: parseFloat(last[headers['Rate Partial (RM/kg)'] - 1]),
            rateUnclean: parseFloat(last[headers['Rate Unclean (RM/kg)'] - 1]),
            createdDate: last[headers['Created Date'] - 1]
        }
    };
}

function _random7Digits() {
    return Math.floor(Math.random() * 1e7).toString().padStart(7, '0');
}

function _generateUniqueIdForSheet(prefixLetter, sheetName, idColumnName) {
    const sheet = getSheet(sheetName);
    const headers = headerMap(sheet);
    const idCol = headers[idColumnName];
    const existing = new Set();
    if (sheet.getLastRow() >= 2) {
        const vals = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).getValues();
        vals.forEach(r => { if (r[0]) existing.add(r[0].toString()); });
    }
    let tries = 0;
    while (tries < 10) {
        const id = prefixLetter + '-' + _random7Digits();
        if (!existing.has(id)) return id;
        tries++;
    }
    // fallback to timestamp-based id if collisions occur (very unlikely)
    return prefixLetter + '-' + Date.now().toString().slice(-7);
}

function registerFisherman({ fullName, phone, village }) {
    const sheet = getSheet(SHEET_NAMES.FISHERMEN);
    const headers = headerMap(sheet);
    const id = _generateUniqueIdForSheet('F', SHEET_NAMES.FISHERMEN, 'Person ID');
    const now = new Date();
    const row = [];
    row[headers['Person ID'] - 1] = id;
    row[headers['Full Name'] - 1] = fullName;
    row[headers['Phone'] - 1] = phone;
    row[headers['Village'] - 1] = village;
    row[headers['Registry Date'] - 1] = now;
    sheet.appendRow(row);
    return { personId: id, fullName, phone, village, registryDate: now };
}

function findFishermen(query) {
    const sheet = getSheet(SHEET_NAMES.FISHERMEN);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    const q = (query + '').toLowerCase().trim();
    const results = [];
    rows.forEach(r => {
        const id = r[headers['Person ID'] - 1];
        const name = (r[headers['Full Name'] - 1] || '') + '';
        if ((id + '').toLowerCase().indexOf(q) !== -1 || name.toLowerCase().indexOf(q) !== -1) {
            results.push({
                personId: id,
                fullName: name,
                phone: r[headers['Phone'] - 1],
                village: r[headers['Village'] - 1],
                registryDate: r[headers['Registry Date'] - 1]
            });
        }
    });
    return results;
}

function getPendingPayment(fishermanId) {
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r[headers['Fisherman ID'] - 1] == fishermanId && (r[headers['Status'] - 1] + '').toLowerCase() === 'pending') {
            return {
                rowIndex: 2 + i,
                data: {
                    paymentId: r[headers['Payment ID'] - 1],
                    fishermanId: r[headers['Fisherman ID'] - 1],
                    status: r[headers['Status'] - 1],
                    accumulatedKg: parseFloat(r[headers['Accumulated Weight (kg)'] - 1]) || 0,
                    payload: r[headers['Payload (RM)'] - 1],
                    dealId: r[headers['Deal ID'] - 1],
                    date: r[headers['Date'] - 1]
                }
            };
        }
    }
    return null;
}

function getLatestPayment(fishermanId) {
    // returns the latest payment row for a fisherman regardless of status (or null)
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if ((r[headers['Fisherman ID'] - 1] + '') == (fishermanId + '')) {
            return {
                rowIndex: 2 + i,
                data: {
                    paymentId: r[headers['Payment ID'] - 1],
                    fishermanId: r[headers['Fisherman ID'] - 1],
                    status: r[headers['Status'] - 1],
                    accumulatedKg: parseFloat(r[headers['Accumulated Weight (kg)'] - 1]) || 0,
                    payload: r[headers['Payload (RM)'] - 1],
                    dealId: r[headers['Deal ID'] - 1],
                    date: r[headers['Date'] - 1]
                }
            };
        }
    }
    return null;
}

function createPendingPayment(fishermanId, accumulatedKg, dealId) {
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const pid = _generateUniqueIdForSheet('P', SHEET_NAMES.PAYMENTS, 'Payment ID');
    const now = new Date();
    const row = [];
    row[headers['Payment ID'] - 1] = pid;
    row[headers['Fisherman ID'] - 1] = fishermanId;
    row[headers['Status'] - 1] = 'Pending';
    row[headers['Accumulated Weight (kg)'] - 1] = accumulatedKg;
    row[headers['Payload (RM)'] - 1] = '';
    row[headers['Deal ID'] - 1] = dealId || (getActiveDeal() ? getActiveDeal().data.dealId : '');
    row[headers['Date'] - 1] = now;
    sheet.appendRow(row);
    return { rowIndex: sheet.getLastRow(), data: { paymentId: pid, fishermanId, status: 'Pending', accumulatedKg, dealId: row[headers['Deal ID'] - 1], date: now } };
}

function appendDrop(drop) {
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const did = _generateUniqueIdForSheet('D', SHEET_NAMES.DROPS, 'Drop ID');
    const now = new Date();
    const row = [];
    row[headers['Drop ID'] - 1] = did;
    row[headers['Fisherman ID'] - 1] = drop.fishermanId;
    row[headers['Date'] - 1] = now;
    row[headers['Net Weight (kg)'] - 1] = drop.netWeight;
    row[headers['Purity'] - 1] = drop.purity;
    row[headers['Inspector'] - 1] = drop.inspector || '';
    row[headers['Notes'] - 1] = drop.notes || '';
    row[headers['Payment ID'] - 1] = drop.paymentId || '';
    sheet.appendRow(row);
    return { dropId: did, rowIndex: sheet.getLastRow() };
}

function getUnallocatedDrops(fishermanId) {
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    const results = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if ((r[headers['Fisherman ID'] - 1] == fishermanId) && !(r[headers['Payment ID'] - 1] && r[headers['Payment ID'] - 1].toString().trim() !== '')) {
            results.push({
                rowIndex: 2 + i,
                dropId: r[headers['Drop ID'] - 1],
                date: r[headers['Date'] - 1],
                netWeight: parseFloat(r[headers['Net Weight (kg)'] - 1]) || 0,
                purity: r[headers['Purity'] - 1],
                inspector: r[headers['Inspector'] - 1],
                notes: r[headers['Notes'] - 1]
            });
        }
    }
    // sort by rowIndex (chronological)
    results.sort((a, b) => a.rowIndex - b.rowIndex);
    return results;
}

function updateDropRow(rowIndex, updates) {
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const writeRow = [];
    // read existing row values first
    const existing = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    Object.keys(updates).forEach(k => {
        const col = headers[k];
        if (col) existing[col - 1] = updates[k];
    });
    sheet.getRange(rowIndex, 1, 1, existing.length).setValues([existing]);
}

function insertDropRowAtEnd(dropRowObj) {
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const row = [];
    row[headers['Drop ID'] - 1] = dropRowObj.dropId;
    row[headers['Fisherman ID'] - 1] = dropRowObj.fishermanId;
    row[headers['Date'] - 1] = dropRowObj.date || new Date();
    row[headers['Net Weight (kg)'] - 1] = dropRowObj.netWeight;
    row[headers['Purity'] - 1] = dropRowObj.purity;
    row[headers['Inspector'] - 1] = dropRowObj.inspector || '';
    row[headers['Notes'] - 1] = dropRowObj.notes || '';
    row[headers['Payment ID'] - 1] = dropRowObj.paymentId || '';
    sheet.appendRow(row);
    return sheet.getLastRow();
}

function computePayloadForPayment(paymentId) {
    const dropsSheet = getSheet(SHEET_NAMES.DROPS);
    const dropsAll = getDataRows(dropsSheet);
    const headers = headerMap(dropsSheet);
    const deal = getActiveDeal();
    if (!deal) throw new Error('No active deal found.');
    const rates = {
        'Clean': deal.data.rateClean,
        'Partial': deal.data.ratePartial,
        'Unclean': deal.data.rateUnclean
    };
    let total = 0;
    for (let i = 0; i < dropsAll.length; i++) {
        const r = dropsAll[i];
        if ((r[headers['Payment ID'] - 1] + '') === (paymentId + '')) {
            const w = parseFloat(r[headers['Net Weight (kg)'] - 1]) || 0;
            const purity = (r[headers['Purity'] - 1] || '').toString();
            const rate = rates[purity] != null ? rates[purity] : 0;
            total += w * rate;
        }
    }
    // Round to 2 decimals
    return Math.round(total * 100) / 100;
}

function finalizePayment(paymentRowObj) {
    const paymentsSheet = getSheet(SHEET_NAMES.PAYMENTS);
    const pHeaders = headerMap(paymentsSheet);
    const deal = getActiveDeal();
    const paymentId = paymentRowObj.data.paymentId;
    const accumulated = paymentRowObj.data.accumulatedKg;
    const payload = computePayloadForPayment(paymentId);
    // update payment row: Status -> Paid, Accumulated Weight = threshold (cap), Payload, Deal ID, Date
    const threshold = deal.data.thresholdKg;
    const now = new Date();
    const rowIndex = paymentRowObj.rowIndex;
    const rowVals = paymentsSheet.getRange(rowIndex, 1, 1, paymentsSheet.getLastColumn()).getValues()[0];
    // mark as ready for payout; actual 'Paid' status should be set manually by staff
    rowVals[pHeaders['Status'] - 1] = 'Payment due';
    rowVals[pHeaders['Accumulated Weight (kg)'] - 1] = threshold;
    rowVals[pHeaders['Payload (RM)'] - 1] = payload;
    rowVals[pHeaders['Deal ID'] - 1] = deal.data.dealId;
    rowVals[pHeaders['Date'] - 1] = now;
    paymentsSheet.getRange(rowIndex, 1, 1, rowVals.length).setValues([rowVals]);
}

function allocateToPending(fishermanId) {
    const deal = getActiveDeal();
    if (!deal) throw new Error('No active deal to use for allocation.');
    // ensure there's a pending payment
    let pending = getPendingPayment(fishermanId);
    if (!pending) {
        // create pending with 0; we'll allocate from drops
        pending = createPendingPayment(fishermanId, 0, deal.data.dealId);
    }
    // compute currently allocated weight for this pending payment
    const dropsSheet = getSheet(SHEET_NAMES.DROPS);
    const dHeaders = headerMap(dropsSheet);
    const allDrops = getDataRows(dropsSheet);
    let alreadyAllocated = 0;
    for (let i = 0; i < allDrops.length; i++) {
        const r = allDrops[i];
        if ((r[dHeaders['Payment ID'] - 1] + '') === (pending.data.paymentId + '')) {
            alreadyAllocated += parseFloat(r[dHeaders['Net Weight (kg)'] - 1]) || 0;
        }
    }
    const threshold = deal.data.thresholdKg;
    let needed = Math.max(0, threshold - alreadyAllocated);
    if (needed <= 0) {
        // nothing to allocate
        return { status: 'no-op', message: 'Pending already meets threshold' };
    }
    // get unallocated drops
    const unallocated = getUnallocatedDrops(fishermanId);
    for (let i = 0; i < unallocated.length && needed > 0; i++) {
        const d = unallocated[i];
        if (d.netWeight <= needed + 1e-9) {
            // fully allocate this drop to pending
            updateDropRow(d.rowIndex, { 'Payment ID': pending.data.paymentId });
            needed -= d.netWeight;
        } else {
            // split: allocated portion becomes row with weight = needed and tagged; leftover becomes new unallocated row
            const allocatedPortion = needed;
            const leftover = d.netWeight - allocatedPortion;
            // update existing row to allocatedPortion and set Payment ID
            updateDropRow(d.rowIndex, { 'Net Weight (kg)': allocatedPortion, 'Payment ID': pending.data.paymentId });
            // insert new leftover drop row
            const leftoverDrop = {
                dropId: _generateUniqueIdForSheet('D', SHEET_NAMES.DROPS, 'Drop ID'),
                fishermanId: fishermanId,
                date: d.date,
                netWeight: leftover,
                purity: d.purity,
                inspector: d.inspector,
                notes: (d.notes ? d.notes + ' (leftover)' : 'leftover'),
                paymentId: ''
            };
            insertDropRowAtEnd(leftoverDrop);
            needed = 0;
            break;
        }
    }
    // recompute allocated sum for this pending
    // read updated drops and sum where Payment ID == pending
    const updatedAllDrops = getDataRows(getSheet(SHEET_NAMES.DROPS));
    let allocatedAfter = 0;
    for (let i = 0; i < updatedAllDrops.length; i++) {
        const r = updatedAllDrops[i];
        if ((r[dHeaders['Payment ID'] - 1] + '') === (pending.data.paymentId + '')) {
            allocatedAfter += parseFloat(r[dHeaders['Net Weight (kg)'] - 1]) || 0;
        }
    }
    // if allocatedAfter >= threshold -> finalize payment and create new pending for leftover unallocated total
    if (allocatedAfter + 1e-9 >= threshold) {
        finalizePayment({ rowIndex: pending.rowIndex, data: { paymentId: pending.data.paymentId, accumulatedKg: allocatedAfter } });
        // compute leftover unallocated weight for fisherman
        const remDrops = getUnallocatedDrops(fishermanId);
        let remTotal = remDrops.reduce((s, d) => s + (parseFloat(d.netWeight) || 0), 0);
        if (remTotal > 0.000001) {
            createPendingPayment(fishermanId, remTotal, deal.data.dealId);
        }
        return { status: 'payment_due', paymentId: pending.data.paymentId, payoutRM: computePayloadForPayment(pending.data.paymentId) };
    } else {
        // update pending accumulated weight to allocatedAfter
        const paymentsSheet = getSheet(SHEET_NAMES.PAYMENTS);
        const pHeaders = headerMap(paymentsSheet);
        const row = paymentsSheet.getRange(pending.rowIndex, 1, 1, paymentsSheet.getLastColumn()).getValues()[0];
        row[pHeaders['Accumulated Weight (kg)'] - 1] = allocatedAfter;
        paymentsSheet.getRange(pending.rowIndex, 1, 1, row.length).setValues([row]);
        return { status: 'pending', accumulatedKg: allocatedAfter };
    }
}

function logDropAndProcess({ fishermanId, netWeight, purity, inspector, notes }) {
    if (!fishermanId) throw new Error('fishermanId required');
    const drop = { fishermanId, netWeight: parseFloat(netWeight), purity, inspector, notes, paymentId: '' };
    const added = appendDrop(drop);
    // try to allocate to pending and possibly trigger payout
    const res = allocateToPending(fishermanId);
    return { dropId: added.dropId, allocationResult: res };
}