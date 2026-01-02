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

function _ensureHeaderExists(sheetName, headerName) {
    const sheet = getSheet(sheetName);
    if (!sheet) throw new Error('Missing sheet: ' + sheetName);
    const lastCol = Math.max(1, sheet.getLastColumn());
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const normalized = headers.map(h => (h || '').toString().trim());
    if (normalized.indexOf(headerName) !== -1) return;
    sheet.getRange(1, lastCol + 1).setValue(headerName);
}

function getFishermen() {
    const sheet = getSheet(SHEET_NAMES.FISHERMEN);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    const tz = Session.getScriptTimeZone();
    return rows
        .map(r => {
            const id = (r[headers['Person ID'] - 1] || '').toString();
            if (!id) return null;
            const regDateCol = headers['Registry Date'];
            const regDateVal = regDateCol ? r[regDateCol - 1] : null;
            const regDate = _coerceToDate(regDateVal);
            return {
                personId: id,
                fullName: (r[headers['Full Name'] - 1] || '').toString(),
                phone: (headers['Phone'] ? (r[headers['Phone'] - 1] || '').toString() : ''),
                village: (headers['Village'] ? (r[headers['Village'] - 1] || '').toString() : ''),
                registryDate: regDate ? Utilities.formatDate(regDate, tz, 'yyyy-MM-dd') : ''
            };
        })
        .filter(Boolean);
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
    const tz = Session.getScriptTimeZone();
    rows.forEach(r => {
        const id = (r[headers['Person ID'] - 1] || '').toString();
        const name = (r[headers['Full Name'] - 1] || '').toString();
        if ((id + '').toLowerCase().indexOf(q) !== -1 || name.toLowerCase().indexOf(q) !== -1) {
            const regDateCol = headers['Registry Date'];
            const regDateVal = regDateCol ? r[regDateCol - 1] : null;
            const regDate = _coerceToDate(regDateVal);
            results.push({
                personId: id,
                fullName: name,
                phone: (headers['Phone'] ? (r[headers['Phone'] - 1] || '').toString() : ''),
                village: (headers['Village'] ? (r[headers['Village'] - 1] || '').toString() : ''),
                registryDate: regDate ? Utilities.formatDate(regDate, tz, 'yyyy-MM-dd') : ''
            });
        }
    });
    return results;
}

function getOpenPayments() {
    // Backwards compatible alias.
    return getDuePayments();
}

function getDuePayments() {
    // Returns payments with Status = "Payment Due" (case-insensitive)
    const paymentsSheet = getSheet(SHEET_NAMES.PAYMENTS);
    const pHeaders = headerMap(paymentsSheet);
    const paymentRows = getDataRows(paymentsSheet);

    const fishermenSheet = getSheet(SHEET_NAMES.FISHERMEN);
    const fHeaders = headerMap(fishermenSheet);
    const fishermenRows = getDataRows(fishermenSheet);

    const fishermanById = {};
    fishermenRows.forEach(r => {
        const id = (r[fHeaders['Person ID'] - 1] || '').toString();
        if (!id) return;
        fishermanById[id] = {
            personId: id,
            fullName: (r[fHeaders['Full Name'] - 1] || '').toString(),
            phone: (fHeaders['Phone'] ? (r[fHeaders['Phone'] - 1] || '').toString() : ''),
            village: (fHeaders['Village'] ? (r[fHeaders['Village'] - 1] || '').toString() : '')
        };
    });

    const results = [];
    paymentRows.forEach((r, idx) => {
        const paymentId = (r[pHeaders['Payment ID'] - 1] || '').toString().trim();
        if (!paymentId) return; // ignore table/empty rows

        const statusRaw = (r[pHeaders['Status'] - 1] || '').toString();
        const statusNorm = _normalizeStatus(statusRaw);
        const isDue = statusNorm === 'payment due' || statusNorm === 'payment_due' || statusNorm.indexOf('due') !== -1;
        if (!isDue) return;

        const fishermanId = (r[pHeaders['Fisherman ID'] - 1] || '').toString();
        const fisherman = fishermanById[fishermanId] || { personId: fishermanId, fullName: '', phone: '', village: '' };
        results.push({
            paymentId,
            fishermanId,
            fishermanName: fisherman.fullName,
            fishermanPhone: fisherman.phone,
            fishermanVillage: fisherman.village,
            status: statusRaw,
            accumulatedKg: parseFloat(r[pHeaders['Accumulated Weight (kg)'] - 1]) || 0,
            payloadRM: r[pHeaders['Payload (RM)'] - 1] || '',
            dealId: r[pHeaders['Deal ID'] - 1] || '',
            date: _formatDateTime(r[pHeaders['Date'] - 1])
        });
    });

    results.sort((a, b) => {
        const da = _coerceToDate(a.date);
        const db = _coerceToDate(b.date);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        if (tb !== ta) return tb - ta;
        return (a.paymentId + '').localeCompare(b.paymentId + '');
    });

    return JSON.parse(JSON.stringify(results));
}

function getPaidPayments() {
    // Returns payments with Status = "Paid" (case-insensitive)
    const paymentsSheet = getSheet(SHEET_NAMES.PAYMENTS);
    const pHeaders = headerMap(paymentsSheet);
    const paymentRows = getDataRows(paymentsSheet);

    const fishermenSheet = getSheet(SHEET_NAMES.FISHERMEN);
    const fHeaders = headerMap(fishermenSheet);
    const fishermenRows = getDataRows(fishermenSheet);

    const fishermanById = {};
    fishermenRows.forEach(r => {
        const id = (r[fHeaders['Person ID'] - 1] || '').toString();
        if (!id) return;
        fishermanById[id] = {
            personId: id,
            fullName: (r[fHeaders['Full Name'] - 1] || '').toString(),
            phone: (fHeaders['Phone'] ? (r[fHeaders['Phone'] - 1] || '').toString() : ''),
            village: (fHeaders['Village'] ? (r[fHeaders['Village'] - 1] || '').toString() : '')
        };
    });

    const results = [];
    paymentRows.forEach(r => {
        const paymentId = (r[pHeaders['Payment ID'] - 1] || '').toString().trim();
        if (!paymentId) return; // ignore table/empty rows

        const statusRaw = (r[pHeaders['Status'] - 1] || '').toString();
        const statusNorm = _normalizeStatus(statusRaw);
        if (statusNorm !== 'paid') return;

        const fishermanId = (r[pHeaders['Fisherman ID'] - 1] || '').toString();
        const fisherman = fishermanById[fishermanId] || { personId: fishermanId, fullName: '', phone: '', village: '' };
        results.push({
            paymentId,
            fishermanId,
            fishermanName: fisherman.fullName,
            fishermanPhone: fisherman.phone,
            fishermanVillage: fisherman.village,
            accumulatedKg: parseFloat(r[pHeaders['Accumulated Weight (kg)'] - 1]) || 0,
            payloadRM: r[pHeaders['Payload (RM)'] - 1] || '',
            dealId: r[pHeaders['Deal ID'] - 1] || '',
            date: _formatDateTime(r[pHeaders['Date'] - 1])
        });
    });

    results.sort((a, b) => {
        const da = _coerceToDate(a.date);
        const db = _coerceToDate(b.date);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        if (tb !== ta) return tb - ta;
        return (a.paymentId + '').localeCompare(b.paymentId + '');
    });

    return JSON.parse(JSON.stringify(results));
}

function getDropoffsByPaymentId(paymentId) {
    if (!paymentId) throw new Error('paymentId required');
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);

    const results = [];
    rows.forEach(r => {
        const pid = (r[headers['Payment ID'] - 1] || '').toString();
        if ((pid + '') !== (paymentId + '')) return;
        results.push({
            dropId: (r[headers['Drop ID'] - 1] || '').toString(),
            fishermanId: (r[headers['Fisherman ID'] - 1] || '').toString(),
            date: _formatDateTime(r[headers['Date'] - 1]),
            netWeightKg: parseFloat(r[headers['Net Weight (kg)'] - 1]) || 0,
            purity: (r[headers['Purity'] - 1] || '').toString(),
            inspector: (r[headers['Inspector'] - 1] || '').toString(),
            notes: (r[headers['Notes'] - 1] || '').toString()
        });
    });

    results.sort((a, b) => {
        const da = _coerceToDate(a.date);
        const db = _coerceToDate(b.date);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        return ta - tb;
    });

    return JSON.parse(JSON.stringify(results));
}

function confirmPayment(paymentId) {
    if (!paymentId) throw new Error('paymentId required');
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);

    const pidCol = headers['Payment ID'];
    const statusCol = headers['Status'];
    if (!pidCol || !statusCol) throw new Error('Payment History headers missing Payment ID/Status');

    for (let i = 0; i < rows.length; i++) {
        const rowPid = (rows[i][pidCol - 1] || '').toString();
        if (rowPid !== paymentId.toString()) continue;

        const rowIndex = 2 + i;
        const existing = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
        const statusRaw = (existing[statusCol - 1] || '').toString();
        const statusNorm = _normalizeStatus(statusRaw);
        const isDue = statusNorm === 'payment due' || statusNorm === 'payment_due' || statusNorm.indexOf('due') !== -1;
        if (!isDue) throw new Error('Payment is not due: ' + statusRaw);

        existing[statusCol - 1] = 'Paid';
        sheet.getRange(rowIndex, 1, 1, existing.length).setValues([existing]);
        return { ok: true, paymentId };
    }

    throw new Error('Payment not found: ' + paymentId);
}

function getAccumulatingPayment(fishermanId) {
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r[headers['Fisherman ID'] - 1] == fishermanId) {
            const statusCol = headers['Status'];
            const statusRaw = (r[statusCol - 1] || '').toString();
            const statusNorm = _normalizeStatus(statusRaw);
            if (statusNorm !== 'accumulating') continue;

            return {
                rowIndex: 2 + i,
                data: {
                    paymentId: r[headers['Payment ID'] - 1],
                    fishermanId: r[headers['Fisherman ID'] - 1],
                    status: 'Accumulating',
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

function getAccumulatingPaymentSummary(fishermanId) {
    if (!fishermanId) return { fishermanId: '', accumulatingKg: 0 };
    const accumulating = getAccumulatingPayment(fishermanId);
    return {
        fishermanId: (fishermanId || '').toString(),
        accumulatingKg: accumulating ? (accumulating.data.accumulatedKg || 0) : 0
    };
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

function createAccumulatingPayment(fishermanId, accumulatedKg, dealId) {
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const pid = _generateUniqueIdForSheet('P', SHEET_NAMES.PAYMENTS, 'Payment ID');
    const now = new Date();
    const row = [];
    row[headers['Payment ID'] - 1] = pid;
    row[headers['Fisherman ID'] - 1] = fishermanId;
    row[headers['Status'] - 1] = 'Accumulating';
    row[headers['Accumulated Weight (kg)'] - 1] = accumulatedKg;
    row[headers['Payload (RM)'] - 1] = '';
    row[headers['Deal ID'] - 1] = dealId || (getActiveDeal() ? getActiveDeal().data.dealId : '');
    row[headers['Date'] - 1] = now;
    sheet.appendRow(row);
    return { rowIndex: sheet.getLastRow(), data: { paymentId: pid, fishermanId, status: 'Accumulating', accumulatedKg, dealId: row[headers['Deal ID'] - 1], date: now } };
}

function appendDrop(drop) {
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
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
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
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
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
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
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
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
    // update payment row: Status -> Payment Due, Accumulated Weight = threshold (cap), Payload, Deal ID, Date
    const threshold = deal.data.thresholdKg;
    const now = new Date();
    const rowIndex = paymentRowObj.rowIndex;
    const rowVals = paymentsSheet.getRange(rowIndex, 1, 1, paymentsSheet.getLastColumn()).getValues()[0];
    rowVals[pHeaders['Status'] - 1] = 'Payment Due';
    rowVals[pHeaders['Accumulated Weight (kg)'] - 1] = threshold;
    rowVals[pHeaders['Payload (RM)'] - 1] = payload;
    rowVals[pHeaders['Deal ID'] - 1] = deal.data.dealId;
    rowVals[pHeaders['Date'] - 1] = now;
    paymentsSheet.getRange(rowIndex, 1, 1, rowVals.length).setValues([rowVals]);
}

function allocateToAccumulating(fishermanId) {
    const deal = getActiveDeal();
    if (!deal) throw new Error('No active deal to use for allocation.');
    const threshold = deal.data.thresholdKg;
    const dropsSheet = getSheet(SHEET_NAMES.DROPS);
    const dHeaders = headerMap(dropsSheet);

    let lastResult = { status: 'no-op', message: 'Nothing to allocate' };

    // Keep allocating until the current accumulating payment is below threshold OR no unallocated drops remain.
    // This is what allows a single big drop (e.g. 230kg) to produce 100 + 100 + 30, with 2 Due + 1 Accumulating.
    while (true) {
        const unallocated = getUnallocatedDrops(fishermanId);
        if (!unallocated || unallocated.length === 0) {
            return lastResult;
        }

        // ensure there's an accumulating payment (create only when we actually have something to allocate)
        let accumulating = getAccumulatingPayment(fishermanId);
        if (!accumulating) {
            accumulating = createAccumulatingPayment(fishermanId, 0, deal.data.dealId);
        }

        // compute currently allocated weight for this accumulating payment (from tagged drops)
        const allDrops = getDataRows(dropsSheet);
        let alreadyAllocated = 0;
        for (let i = 0; i < allDrops.length; i++) {
            const r = allDrops[i];
            if ((r[dHeaders['Payment ID'] - 1] + '') === (accumulating.data.paymentId + '')) {
                alreadyAllocated += parseFloat(r[dHeaders['Net Weight (kg)'] - 1]) || 0;
            }
        }

        let needed = Math.max(0, threshold - alreadyAllocated);

        // If accumulating somehow already meets/exceeds threshold, finalize it and try allocate remaining unallocated drops
        if (needed <= 0) {
            finalizePayment({ rowIndex: accumulating.rowIndex, data: { paymentId: accumulating.data.paymentId, accumulatedKg: alreadyAllocated } });
            lastResult = { status: 'payment_due', paymentId: accumulating.data.paymentId, payoutRM: computePayloadForPayment(accumulating.data.paymentId) };
            continue;
        }

        // allocate unallocated drops into accumulating until we fill it (splitting rows as needed)
        for (let i = 0; i < unallocated.length && needed > 0; i++) {
            const d = unallocated[i];
            if (d.netWeight <= needed + 1e-9) {
                updateDropRow(d.rowIndex, { 'Payment ID': accumulating.data.paymentId });
                needed -= d.netWeight;
            } else {
                const allocatedPortion = needed;
                const leftover = d.netWeight - allocatedPortion;

                updateDropRow(d.rowIndex, { 'Net Weight (kg)': allocatedPortion, 'Payment ID': accumulating.data.paymentId });

                const leftoverDrop = {
                    dropId: _generateUniqueIdForSheet('D', SHEET_NAMES.DROPS, 'Drop ID'),
                    fishermanId: fishermanId,
                    date: d.date,
                    netWeight: leftover,
                    purity: d.purity,
                    inspector: d.inspector,
                    notes: (d.notes || ''),
                    paymentId: ''
                };
                insertDropRowAtEnd(leftoverDrop);
                needed = 0;
                break;
            }
        }

        // recompute allocated sum for this accumulating
        const updatedAllDrops = getDataRows(dropsSheet);
        let allocatedAfter = 0;
        for (let i = 0; i < updatedAllDrops.length; i++) {
            const r = updatedAllDrops[i];
            if ((r[dHeaders['Payment ID'] - 1] + '') === (accumulating.data.paymentId + '')) {
                allocatedAfter += parseFloat(r[dHeaders['Net Weight (kg)'] - 1]) || 0;
            }
        }

        if (allocatedAfter + 1e-9 >= threshold) {
            finalizePayment({ rowIndex: accumulating.rowIndex, data: { paymentId: accumulating.data.paymentId, accumulatedKg: allocatedAfter } });
            lastResult = { status: 'payment_due', paymentId: accumulating.data.paymentId, payoutRM: computePayloadForPayment(accumulating.data.paymentId) };
            // Loop again: if there is still unallocated weight >= threshold, we'll create another accumulating and finalize again.
            continue;
        }

        // update accumulating accumulated weight to allocatedAfter and stop
        const paymentsSheet = getSheet(SHEET_NAMES.PAYMENTS);
        const pHeaders = headerMap(paymentsSheet);
        const row = paymentsSheet.getRange(accumulating.rowIndex, 1, 1, paymentsSheet.getLastColumn()).getValues()[0];
        row[pHeaders['Accumulated Weight (kg)'] - 1] = allocatedAfter;
        paymentsSheet.getRange(accumulating.rowIndex, 1, 1, row.length).setValues([row]);
        lastResult = { status: 'accumulating', accumulatedKg: allocatedAfter, paymentId: accumulating.data.paymentId };
        return lastResult;
    }
}

function logDropAndProcess({ fishermanId, netWeight, purity, inspector, notes }) {
    if (!fishermanId) throw new Error('fishermanId required');
    const drop = { fishermanId, netWeight: parseFloat(netWeight), purity, inspector, notes, paymentId: '' };
    const added = appendDrop(drop);
    // try to allocate to accumulating and possibly trigger payout
    const res = allocateToAccumulating(fishermanId);
    return { dropId: added.dropId, allocationResult: res };
}

function _coerceToDate(v) {
    if (!v) return null;
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v;
    const d = new Date(v);
    if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime())) return d;
    return null;
}

function _normalizeStatus(s) {
    return (s || '')
        .toString()
        .replace(/[\s\u00A0]+/g, ' ')
        .trim()
        .toLowerCase();
}

function _formatDateTime(v) {
    const d = _coerceToDate(v);
    if (!d) return '';
    const tz = Session.getScriptTimeZone();
    return Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm:ss');
}

function _monthLabel(year, month1Based) {
    const d = new Date(year, month1Based - 1, 1);
    const tz = Session.getScriptTimeZone();
    return Utilities.formatDate(d, tz, 'MMMM yyyy');
}

function getVolunteerContributionMonth({ year, month } = {}) {
    // month is 1-based (1=Jan). Defaults to current script-timezone month.
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const defaultYear = parseInt(Utilities.formatDate(now, tz, 'yyyy'), 10);
    const defaultMonth = parseInt(Utilities.formatDate(now, tz, 'M'), 10);

    const y = year ? parseInt(year, 10) : defaultYear;
    const m = month ? parseInt(month, 10) : defaultMonth;
    if (!y || !m || m < 1 || m > 12) throw new Error('Invalid year/month');

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);

    const dateIdx = headers['Date'] - 1;
    const weightIdx = headers['Net Weight (kg)'] - 1;
    const inspectorIdx = headers['Inspector'] - 1;
    const purityIdx = headers['Purity'] - 1;

    const totalsByKey = {};
    const displayNameByKey = {};
    let totalKg = 0;
    let totalCleanKg = 0;
    let totalPartialKg = 0;
    let totalUncleanKg = 0;

    rows.forEach(r => {
        const d = _coerceToDate(r[dateIdx]);
        if (!d) return;
        if (d < start || d >= end) return;

        const kg = parseFloat(r[weightIdx]) || 0;
        if (kg <= 0) return;

        const rawName = (r[inspectorIdx] || '').toString().trim();
        const displayName = rawName || '(Unassigned)';
        const key = displayName.toLowerCase();

        const purity = (r[purityIdx] || '').toString().trim();
        if (!totalsByKey[key]) {
            totalsByKey[key] = { totalKg: 0, cleanKg: 0, partialKg: 0, uncleanKg: 0 };
        }
        totalsByKey[key].totalKg += kg;
        if (purity === 'Clean') {
            totalsByKey[key].cleanKg += kg;
            totalCleanKg += kg;
        } else if (purity === 'Partial') {
            totalsByKey[key].partialKg += kg;
            totalPartialKg += kg;
        } else if (purity === 'Unclean') {
            totalsByKey[key].uncleanKg += kg;
            totalUncleanKg += kg;
        }

        if (!displayNameByKey[key]) displayNameByKey[key] = displayName;
        totalKg += kg;
    });

    const items = Object.keys(totalsByKey)
        .map(k => ({
            inspector: displayNameByKey[k],
            totalKg: Math.round(totalsByKey[k].totalKg * 100) / 100,
            cleanKg: Math.round(totalsByKey[k].cleanKg * 100) / 100,
            partialKg: Math.round(totalsByKey[k].partialKg * 100) / 100,
            uncleanKg: Math.round(totalsByKey[k].uncleanKg * 100) / 100
        }))
        .sort((a, b) => b.totalKg - a.totalKg || a.inspector.localeCompare(b.inspector));

    const curY = defaultYear;
    const curM = defaultMonth;
    const isCurrentMonth = (y === curY && m === curM);
    const monthLabel = _monthLabel(y, m);

    return {
        year: y,
        month: m,
        monthLabel,
        totalKg: Math.round(totalKg * 100) / 100,
        totalCleanKg: Math.round(totalCleanKg * 100) / 100,
        totalPartialKg: Math.round(totalPartialKg * 100) / 100,
        totalUncleanKg: Math.round(totalUncleanKg * 100) / 100,
        isCurrentMonth,
        items
    };
}

function _getPaymentRowIndexById(paymentId) {
    if (!paymentId) return null;
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    const pidCol = headers['Payment ID'];
    if (!pidCol) return null;
    for (let i = 0; i < rows.length; i++) {
        const rowPid = (rows[i][pidCol - 1] || '').toString();
        if (rowPid && rowPid === (paymentId + '')) return 2 + i;
    }
    return null;
}

function _getPaymentStatusById(paymentId) {
    if (!paymentId) return '';
    const sheet = getSheet(SHEET_NAMES.PAYMENTS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    const pidCol = headers['Payment ID'];
    const statusCol = headers['Status'];
    if (!pidCol || !statusCol) return '';
    for (let i = 0; i < rows.length; i++) {
        const rowPid = (rows[i][pidCol - 1] || '').toString();
        if (rowPid !== (paymentId + '')) continue;
        return (rows[i][statusCol - 1] || '').toString();
    }
    return '';
}

function _isPaidPaymentId(paymentId) {
    const status = _normalizeStatus(_getPaymentStatusById(paymentId));
    return status === 'paid';
}

function _findDropRowById(dropId) {
    if (!dropId) return null;
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);
    const idCol = headers['Drop ID'];
    if (!idCol) throw new Error('Drop-off Log headers missing Drop ID');
    for (let i = 0; i < rows.length; i++) {
        const rowDid = (rows[i][idCol - 1] || '').toString();
        if (rowDid && rowDid === (dropId + '')) {
            return {
                rowIndex: 2 + i,
                values: rows[i],
                headers
            };
        }
    }
    return null;
}

function getEditableDropoffsByFishermanId(fishermanId) {
    if (!fishermanId) throw new Error('fishermanId required');
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');
    const sheet = getSheet(SHEET_NAMES.DROPS);
    const headers = headerMap(sheet);
    const rows = getDataRows(sheet);

    const results = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const fid = (r[headers['Fisherman ID'] - 1] || '').toString();
        if (fid !== (fishermanId + '')) continue;

        const paymentId = (headers['Payment ID'] ? (r[headers['Payment ID'] - 1] || '').toString() : '');
        if (paymentId && _isPaidPaymentId(paymentId)) {
            // Do not show drop-offs that contributed to paid payments.
            continue;
        }

        results.push({
            dropId: (r[headers['Drop ID'] - 1] || '').toString(),
            fishermanId: fid,
            date: _formatDateTime(r[headers['Date'] - 1]),
            netWeightKg: parseFloat(r[headers['Net Weight (kg)'] - 1]) || 0,
            purity: (r[headers['Purity'] - 1] || '').toString(),
            inspector: (r[headers['Inspector'] - 1] || '').toString(),
            notes: (r[headers['Notes'] - 1] || '').toString(),
            paymentId: paymentId,
            paymentStatus: paymentId ? _getPaymentStatusById(paymentId) : ''
        });
    }

    results.sort((a, b) => {
        const da = _coerceToDate(a.date);
        const db = _coerceToDate(b.date);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        return tb - ta;
    });

    return JSON.parse(JSON.stringify(results));
}

function reevaluatePaymentsForFisherman(fishermanId) {
    if (!fishermanId) throw new Error('fishermanId required');
    _ensureHeaderExists(SHEET_NAMES.DROPS, 'Payment ID');

    const paymentsSheet = getSheet(SHEET_NAMES.PAYMENTS);
    const pHeaders = headerMap(paymentsSheet);
    const paymentRows = getDataRows(paymentsSheet);

    const openPaymentIds = new Set();
    const paidPaymentIds = new Set();

    for (let i = 0; i < paymentRows.length; i++) {
        const r = paymentRows[i];
        const pid = (r[pHeaders['Payment ID'] - 1] || '').toString().trim();
        if (!pid) continue;
        const fid = (r[pHeaders['Fisherman ID'] - 1] || '').toString();
        if (fid !== (fishermanId + '')) continue;
        const statusNorm = _normalizeStatus(r[pHeaders['Status'] - 1]);
        if (statusNorm === 'paid') paidPaymentIds.add(pid);
        else openPaymentIds.add(pid);
    }

    // 1) Untag all drops that were part of NON-paid payments (due/accumulating), so we can reallocate.
    const dropsSheet = getSheet(SHEET_NAMES.DROPS);
    const dHeaders = headerMap(dropsSheet);
    const dropRows = getDataRows(dropsSheet);
    const clearedDropIds = [];

    for (let i = 0; i < dropRows.length; i++) {
        const r = dropRows[i];
        const fid = (r[dHeaders['Fisherman ID'] - 1] || '').toString();
        if (fid !== (fishermanId + '')) continue;
        const pid = (r[dHeaders['Payment ID'] - 1] || '').toString().trim();
        if (!pid) continue;
        if (paidPaymentIds.has(pid)) continue;
        if (!openPaymentIds.has(pid)) continue;

        const rowIndex = 2 + i;
        updateDropRow(rowIndex, { 'Payment ID': '' });
        clearedDropIds.push((r[dHeaders['Drop ID'] - 1] || '').toString());
    }

    // 2) Delete all NON-paid payments for this fisherman (bottom-up).
    const deletedPaymentIds = [];
    for (let i = paymentRows.length - 1; i >= 0; i--) {
        const r = paymentRows[i];
        const pid = (r[pHeaders['Payment ID'] - 1] || '').toString().trim();
        if (!pid) continue;
        const fid = (r[pHeaders['Fisherman ID'] - 1] || '').toString();
        if (fid !== (fishermanId + '')) continue;
        const statusNorm = _normalizeStatus(r[pHeaders['Status'] - 1]);
        if (statusNorm === 'paid') continue;
        const rowIndex = 2 + i;
        paymentsSheet.deleteRow(rowIndex);
        deletedPaymentIds.push(pid);
    }

    // 3) Allocate again from scratch for remaining untagged drops.
    const allocationResult = allocateToAccumulating(fishermanId);

    return {
        ok: true,
        fishermanId: (fishermanId + ''),
        clearedDropIds,
        deletedPaymentIds,
        allocationResult
    };
}

function updateDropoffById({ dropId, netWeightKg, purity, inspector, notes } = {}) {
    if (!dropId) throw new Error('dropId required');
    const found = _findDropRowById(dropId);
    if (!found) throw new Error('Drop not found: ' + dropId);

    const headers = found.headers;
    const paymentId = headers['Payment ID'] ? (found.values[headers['Payment ID'] - 1] || '').toString().trim() : '';
    if (paymentId && _isPaidPaymentId(paymentId)) {
        throw new Error('Cannot edit a drop-off that contributed to a paid payment.');
    }

    const fishermanId = (found.values[headers['Fisherman ID'] - 1] || '').toString();
    const updates = {};

    if (netWeightKg != null) {
        const n = parseFloat(netWeightKg);
        if (!isFinite(n) || n <= 0) throw new Error('Net Weight (kg) must be > 0');
        updates['Net Weight (kg)'] = n;
    }
    if (purity != null) {
        const p = (purity || '').toString().trim();
        if (['Clean', 'Partial', 'Unclean'].indexOf(p) === -1) throw new Error('Invalid purity');
        updates['Purity'] = p;
    }
    if (inspector != null) updates['Inspector'] = (inspector || '').toString();
    if (notes != null) updates['Notes'] = (notes || '').toString();

    updateDropRow(found.rowIndex, updates);
    const reeval = reevaluatePaymentsForFisherman(fishermanId);
    return { ok: true, dropId: (dropId + ''), fishermanId, reeval };
}

function deleteDropoffById({ dropId } = {}) {
    if (!dropId) throw new Error('dropId required');
    const found = _findDropRowById(dropId);
    if (!found) throw new Error('Drop not found: ' + dropId);

    const headers = found.headers;
    const paymentId = headers['Payment ID'] ? (found.values[headers['Payment ID'] - 1] || '').toString().trim() : '';
    if (paymentId && _isPaidPaymentId(paymentId)) {
        throw new Error('Cannot delete a drop-off that contributed to a paid payment.');
    }

    const fishermanId = (found.values[headers['Fisherman ID'] - 1] || '').toString();
    const sheet = getSheet(SHEET_NAMES.DROPS);
    sheet.deleteRow(found.rowIndex);
    const reeval = reevaluatePaymentsForFisherman(fishermanId);
    return { ok: true, dropId: (dropId + ''), fishermanId, reeval };
}