/**
 * ====================================================================
 * 📊 Stock Reports & Analytics Page JavaScript (Phase 4 Enterprise)
 * ====================================================================
 * Features:
 * 1. Excel (.xlsx) Export with SheetJS (Ledger, Inward, Outward, All).
 * 2. High-Quality Printable PDF export.
 * 3. Server-Side Pagination (/api/reports?page=1&limit=50).
 * 4. Animated Shimmer Skeleton Loaders.
 * 5. Toast Notifications & Error Alerting.
 * 6. WebSocket Heartbeat (25s Ping/Pong).
 */

// Pagination & Filter State
let currentInwardPage = 1;
let currentOutwardPage = 1;
const PAGE_SIZE = 50;
let totalInwardPages = 1;
let totalOutwardPages = 1;

let globalInwardData = [];
let globalOutwardData = [];
let currentLedgerData = [];
let selectedItemFilter = null;
let currentSearchText = '';
let nondpChartObj = null;

// Safe Escape & Fetch Helpers
const safeEscape = (str) => (window.escapeHtml ? window.escapeHtml(str) : String(str || '').replace(/[&<>"'`]/g, ''));
const safeFetch = (url, opts) => (window.authFetch ? window.authFetch(url, opts) : fetch(url, opts));

// --- 0. Shimmer Skeleton Loader ---
function renderTableSkeleton(tbodyId, rows = 5, cols = 6) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    let skeletonHtml = '';
    for (let r = 0; r < rows; r++) {
        skeletonHtml += '<tr>';
        for (let c = 0; c < cols; c++) {
            if (c === 0) {
                skeletonHtml += '<td class="ps-3"><div class="skeleton-shimmer skeleton-badge"></div></td>';
            } else if (c === 1) {
                skeletonHtml += '<td><div class="skeleton-shimmer skeleton-line"></div></td>';
            } else {
                skeletonHtml += `<td><div class="skeleton-shimmer ${c % 2 === 0 ? 'skeleton-line-sm' : 'skeleton-badge'}"></div></td>`;
            }
        }
        skeletonHtml += '</tr>';
    }
    tbody.innerHTML = skeletonHtml;
}

// --- 1. Load Date-Wise Stock Ledger ---
async function loadDateWiseStock() {
    const dateInput = document.getElementById('ledgerDate');
    if (!dateInput) return;
    const selectedDate = dateInput.value;
    if (!selectedDate) return;

    const tbody = document.getElementById('ledgerTable');
    if (tbody) renderTableSkeleton('ledgerTable', 4, 5);

    try {
        const response = await safeFetch(`/api/date-wise-stock?report_date=${encodeURIComponent(selectedDate)}`);
        const data = await response.json();

        if (!tbody) return;

        currentLedgerData = data.stock_ledger || [];

        if (currentLedgerData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted py-4">No stock movement on this date.</td></tr>`;
            return;
        }

        tbody.innerHTML = currentLedgerData.map(row => {
            const rawName = row.item_name || '';
            const escapedName = safeEscape(rawName);
            const u = safeEscape(row.unit || 'PCS');
            const opening = Number(row.opening_qty) || 0;
            const inQty = Number(row.in_qty) || 0;
            const outQty = Number(row.out_qty) || 0;
            const closing = opening + inQty - outQty;

            return `
                <tr>
                    <td class="text-start ps-4">
                        <span class="clickable-item" data-item-name="${escapedName}">
                            <i class="bi bi-search me-1"></i> ${escapedName}
                        </span>
                    </td>
                    <td><span class="fw-bold text-secondary">${opening} ${u}</span></td>
                    <td><span class="badge bg-success-subtle text-success fs-6">+${inQty} ${u}</span></td>
                    <td><span class="badge bg-danger-subtle text-danger fs-6">-${outQty} ${u}</span></td>
                    <td><span class="badge bg-primary fs-6 fw-bold px-3 py-1">${closing} ${u}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Error fetching ledger:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-danger py-3">Error loading ledger data.</td></tr>`;
        if (window.showToast) window.showToast("Error loading ledger data!", "error");
    }
}

// --- 2. Load Inward & Outward Reports with Server-Side Pagination ---
async function loadReports() {
    renderTableSkeleton('inwardTable', 6, 8);
    renderTableSkeleton('outwardTable', 6, 6);

    try {
        const page = Math.max(currentInwardPage, currentOutwardPage);
        let url = `/api/reports?page=${page}&limit=${PAGE_SIZE}`;

        if (currentSearchText) {
            url += `&search=${encodeURIComponent(currentSearchText)}`;
        }
        if (selectedItemFilter) {
            url += `&item_filter=${encodeURIComponent(selectedItemFilter)}`;
        }

        const response = await safeFetch(url);
        const data = await response.json();

        globalInwardData = data.inward_history || [];
        globalOutwardData = data.outward_history || [];

        if (data.pagination) {
            totalInwardPages = data.pagination.total_inward_pages || 1;
            totalOutwardPages = data.pagination.total_outward_pages || 1;
            
            const inwardCountEl = document.getElementById('inwardCount');
            const outwardCountEl = document.getElementById('outwardCount');
            if (inwardCountEl) inwardCountEl.innerText = `${data.pagination.total_inward} Total Records`;
            if (outwardCountEl) outwardCountEl.innerText = `${data.pagination.total_outward} Total Records`;
        }

        renderTables();
        updatePaginationUI();
    } catch (err) {
        console.error("Error loading reports:", err);
        const inwardTbody = document.getElementById('inwardTable');
        const outwardTbody = document.getElementById('outwardTable');
        if (inwardTbody) inwardTbody.innerHTML = `<tr><td colspan="8" class="text-danger py-4">Error loading Inward report.</td></tr>`;
        if (outwardTbody) outwardTbody.innerHTML = `<tr><td colspan="6" class="text-danger py-4">Error loading Outward report.</td></tr>`;
        if (window.showToast) window.showToast("Error loading reports!", "error");
    }
}

// --- 3. Render Tables (Sanitized & Paginated) ---
function renderTables() {
    // Render Outward Table
    const outwardTbody = document.getElementById('outwardTable');
    if (outwardTbody) {
        if (globalOutwardData.length === 0) {
            outwardTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No Outward records found.</td></tr>`;
        } else {
            outwardTbody.innerHTML = globalOutwardData.map(row => {
                const boxId = safeEscape(row.box_id);
                const itemName = safeEscape(row.item_name);
                const issuedTo = safeEscape(row.issued_to);
                const scannedBy = safeEscape(row.scanned_by || 'Store Keeper');
                const u = safeEscape(row.unit || 'PCS');
                const qtyIssued = Number(row.qty_issued) || 0;
                const outDate = row.outward_date ? safeEscape(new Date(row.outward_date).toLocaleString()) : 'N/A';

                return `
                    <tr>
                        <td class="ps-3"><span class="badge bg-slate-800 bg-dark font-monospace">${boxId}</span></td>
                        <td class="fw-bold text-slate-800">
                            <span class="clickable-item" data-item-name="${itemName}">${itemName}</span>
                        </td>
                        <td><span class="badge bg-danger fs-6">-${qtyIssued} ${u}</span></td>
                        <td><span class="text-indigo fw-bold">${issuedTo}</span></td>
                        <td><small class="text-muted">${scannedBy}</small></td>
                        <td><small class="text-muted">${outDate}</small></td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Render Inward Table
    const inwardTbody = document.getElementById('inwardTable');
    if (inwardTbody) {
        if (globalInwardData.length === 0) {
            inwardTbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No Inward records found.</td></tr>`;
        } else {
            inwardTbody.innerHTML = globalInwardData.map(row => {
                const boxId = safeEscape(row.box_id);
                const itemName = safeEscape(row.item_name);
                const supplier = safeEscape(row.supplier_or_party || 'N/A');
                const remark = safeEscape(row.remark || 'N/A');
                const u = safeEscape(row.unit || 'PCS');
                const initialQty = Number(row.initial_qty || row.qty_in_box) || 0;
                const currentQty = Number(row.qty_in_box) || 0;
                const createdDate = row.created_at ? safeEscape(new Date(row.created_at).toLocaleString()) : 'N/A';
                const statusBadge = row.status === 'IN_STORE' 
                    ? '<span class="badge bg-success">IN STORE</span>' 
                    : '<span class="badge bg-secondary">OUT</span>';

                return `
                    <tr>
                        <td class="ps-3"><span class="badge bg-slate-800 bg-dark font-monospace">${boxId}</span></td>
                        <td class="fw-bold text-slate-800">
                            <span class="clickable-item" data-item-name="${itemName}">${itemName}</span>
                        </td>
                        <td><span class="badge bg-success-subtle text-success border border-success-subtle fw-bold fs-6">${initialQty} ${u}</span></td>
                        <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold fs-6">${currentQty} ${u}</span></td>
                        <td><span class="text-secondary fw-semibold">${supplier}</span></td>
                        <td><small class="text-muted">${remark}</small></td>
                        <td>${statusBadge}</td>
                        <td><small class="text-muted">${createdDate}</small></td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// --- 4. Pagination Controls Logic ---
function updatePaginationUI() {
    const inwardPageInfo = document.getElementById('inwardPageInfo');
    const inwardPrevBtn = document.getElementById('inwardPrevBtn');
    const inwardNextBtn = document.getElementById('inwardNextBtn');

    if (inwardPageInfo) inwardPageInfo.innerText = `Page ${currentInwardPage} of ${totalInwardPages}`;
    if (inwardPrevBtn) inwardPrevBtn.disabled = (currentInwardPage <= 1);
    if (inwardNextBtn) inwardNextBtn.disabled = (currentInwardPage >= totalInwardPages);

    const outwardPageInfo = document.getElementById('outwardPageInfo');
    const outwardPrevBtn = document.getElementById('outwardPrevBtn');
    const outwardNextBtn = document.getElementById('outwardNextBtn');

    if (outwardPageInfo) outwardPageInfo.innerText = `Page ${currentOutwardPage} of ${totalOutwardPages}`;
    if (outwardPrevBtn) outwardPrevBtn.disabled = (currentOutwardPage <= 1);
    if (outwardNextBtn) outwardNextBtn.disabled = (currentOutwardPage >= totalOutwardPages);
}

function changeInwardPage(delta) {
    const targetPage = currentInwardPage + delta;
    if (targetPage >= 1 && targetPage <= totalInwardPages) {
        currentInwardPage = targetPage;
        loadReports();
    }
}

function changeOutwardPage(delta) {
    const targetPage = currentOutwardPage + delta;
    if (targetPage >= 1 && targetPage <= totalOutwardPages) {
        currentOutwardPage = targetPage;
        loadReports();
    }
}

// --- 5. Live Search & Debounced Filter ---
function filterBySearchText() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    currentSearchText = searchInput.value.trim();
    currentInwardPage = 1;
    currentOutwardPage = 1;
    loadReports();
}

const debouncedSearch = window.debounce ? window.debounce(filterBySearchText, 300) : filterBySearchText;

function filterByItem(itemName) {
    if (!itemName) return;
    selectedItemFilter = itemName;
    currentInwardPage = 1;
    currentOutwardPage = 1;

    const badge = document.getElementById('selectedItemBadge');
    const alertBox = document.getElementById('filterAlert');
    if (badge) badge.innerText = itemName;
    if (alertBox) alertBox.classList.remove('d-none');

    loadReports();
}

function clearItemFilter() {
    selectedItemFilter = null;
    currentSearchText = '';
    currentInwardPage = 1;
    currentOutwardPage = 1;

    const searchInput = document.getElementById('searchInput');
    const alertBox = document.getElementById('filterAlert');
    if (searchInput) searchInput.value = '';
    if (alertBox) alertBox.classList.add('d-none');

    loadReports();
}

// --- 6. End-to-End System Summary & Fulfillment Analytics ---
async function loadEndToEndSummary() {
    try {
        const res = await safeFetch('/api/reports/end-to-end-summary');
        const data = await res.json();

        if (data.status === 'success') {
            const varianceEl = document.getElementById('e2e-variance-qty');
            const inwardEl = document.getElementById('e2e-inward-qty');
            const dpOutEl = document.getElementById('e2e-dp-out-qty');

            if (varianceEl) varianceEl.innerText = (data.stock_summary?.variance_qty || 0).toLocaleString();
            if (inwardEl) inwardEl.innerText = (data.stock_summary?.total_inward_qty || 0).toLocaleString();
            if (dpOutEl) dpOutEl.innerText = (data.stock_summary?.total_dp_outward_qty || 0).toLocaleString();

            const directPct = data.fulfillment_summary?.direct_pipes?.fulfillment_rate_pct || 0;
            const directPctEl = document.getElementById('e2e-direct-pct');
            const directBarEl = document.getElementById('e2e-direct-bar');
            const directTextEl = document.getElementById('e2e-direct-text');

            if (directPctEl) directPctEl.innerText = directPct + '%';
            if (directBarEl) directBarEl.style.width = Math.min(100, Math.max(0, directPct)) + '%';
            if (directTextEl) {
                const disp = data.fulfillment_summary?.direct_pipes?.dispatched_qty || 0;
                const plan = data.fulfillment_summary?.direct_pipes?.planned_qty || 0;
                directTextEl.innerText = `${disp} / ${plan} Meters Dispatched`;
            }

            const kitPct = data.fulfillment_summary?.store_kits?.fulfillment_rate_pct || 0;
            const kitPctEl = document.getElementById('e2e-kit-pct');
            const kitBarEl = document.getElementById('e2e-kit-bar');
            const kitTextEl = document.getElementById('e2e-kit-text');

            if (kitPctEl) kitPctEl.innerText = kitPct + '%';
            if (kitBarEl) kitBarEl.style.width = Math.min(100, Math.max(0, kitPct)) + '%';
            if (kitTextEl) {
                const comp = data.fulfillment_summary?.store_kits?.completed_kits || 0;
                const tot = data.fulfillment_summary?.store_kits?.total_kits || 0;
                kitTextEl.innerText = `${comp} / ${tot} Store Kits Completed`;
            }

            renderNonDpChart(data.non_dp_summary?.reason_labels, data.non_dp_summary?.reason_qtys);

            const tbody = document.getElementById('nondpTableBody');
            if (tbody) {
                if (data.non_dp_summary?.history && data.non_dp_summary.history.length > 0) {
                    tbody.innerHTML = data.non_dp_summary.history.map(row => `
                        <tr>
                            <td><span class="badge bg-secondary font-monospace">${safeEscape(row.box_id)}</span></td>
                            <td>${safeEscape(row.item_name || 'Item')}</td>
                            <td><strong class="text-info">${Number(row.qty_issued) || 0}</strong></td>
                            <td><span class="badge bg-info text-dark">${safeEscape(row.issued_to)}</span></td>
                            <td class="text-muted">${safeEscape(row.formatted_date)}</td>
                        </tr>
                    `).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No non-DP outward records found.</td></tr>`;
                }
            }
        }
    } catch (err) {
        console.error("End-to-End Summary Error:", err);
    }
}

// --- 7. Non-DP Chart Rendering ---
function renderNonDpChart(labels, qtys) {
    const ctx = document.getElementById('nondpChart');
    if (!ctx) return;
    if (nondpChartObj) nondpChartObj.destroy();

    const chartLabels = labels && labels.length > 0 ? labels.map(l => safeEscape(l)) : ['Testing', 'Sample', 'Scrap/Damage', 'Internal Use'];
    const chartQtys = qtys && qtys.length > 0 ? qtys : [0, 0, 0, 0];

    nondpChartObj = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartQtys,
                backgroundColor: ['#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#a855f7'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, color: 'gray' } }
            }
        }
    });
}

function autoRefreshReports() {
    loadReports();
    loadEndToEndSummary();
}

// --- 8. Excel & PDF Export (SheetJS) ---
function exportExcel(type = 'all') {
    if (typeof XLSX === 'undefined') {
        if (window.showToast) window.showToast("XLSX library could not be loaded. Please refresh the page.", "error");
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        const dateStr = new Date().toISOString().slice(0, 10);

        if (type === 'all' || type === 'ledger') {
            const ledgerRows = (currentLedgerData || []).map((row, idx) => ({
                "Sr No": idx + 1,
                "Item Name": row.item_name || '',
                "Opening Stock": row.opening_qty || 0,
                "Inward Qty (+)": row.in_qty || 0,
                "Outward Qty (-)": row.out_qty || 0,
                "Closing Stock (=)": (row.opening_qty || 0) + (row.in_qty || 0) - (row.out_qty || 0),
                "Unit": row.unit || 'MTR'
            }));
            const wsLedger = XLSX.utils.json_to_sheet(ledgerRows);
            XLSX.utils.book_append_sheet(wb, wsLedger, "Daily Stock Ledger");
        }

        if (type === 'all' || type === 'inward') {
            const inwardRows = (globalInwardData || []).map((row, idx) => ({
                "Sr No": idx + 1,
                "Box ID": row.box_id || '',
                "Item Name": row.item_name || '',
                "Initial Qty": row.initial_qty || row.qty_in_box || 0,
                "Remaining Qty": row.qty_in_box || 0,
                "Unit": row.unit || 'Pcs',
                "Supplier / Party": row.supplier_or_party || 'N/A',
                "Remark": row.remark || '',
                "Status": row.status || 'IN_STORE',
                "Date": row.created_at ? new Date(row.created_at).toLocaleString() : ''
            }));
            const wsInward = XLSX.utils.json_to_sheet(inwardRows);
            XLSX.utils.book_append_sheet(wb, wsInward, "Inward History");
        }

        if (type === 'all' || type === 'outward') {
            const outwardRows = (globalOutwardData || []).map((row, idx) => ({
                "Sr No": idx + 1,
                "Box ID": row.box_id || '',
                "Item Name": row.item_name || '',
                "Qty Issued": row.qty_issued || 0,
                "Unit": row.unit || 'Pcs',
                "Issued To": row.issued_to || '',
                "Scanned By": row.scanned_by || 'Store Keeper',
                "Outward Date": row.outward_date ? new Date(row.outward_date).toLocaleString() : ''
            }));
            const wsOutward = XLSX.utils.json_to_sheet(outwardRows);
            XLSX.utils.book_append_sheet(wb, wsOutward, "Outward History");
        }

        const fileName = `Store_Stock_Report_${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);

        if (window.showToast) window.showToast(`✅ Excel Report '${fileName}' downloaded successfully!`, "success");
    } catch (e) {
        console.error("Excel Export error:", e);
        if (window.showToast) window.showToast("Error during Excel export!", "error");
    }
}

function printReportPdf() {
    if (window.showToast) window.showToast("🖨️ Opening PDF print dialog...", "info", null, 2000);
    setTimeout(() => {
        window.print();
    }, 300);
}

// --- 9. WebSocket with Heartbeat (Ping/Pong) & Resilient Reconnection ---
let reportSocket = null;
let heartbeatInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function connectWebSocket() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
        reportSocket = new WebSocket(wsUrl);

        reportSocket.onopen = function () {
            console.log("⚡ Reports WebSocket: Connected with live Heartbeat.");
            reconnectAttempts = 0;

            heartbeatInterval = setInterval(() => {
                if (reportSocket && reportSocket.readyState === WebSocket.OPEN) {
                    reportSocket.send("PING");
                }
            }, 25000);
        };

        reportSocket.onmessage = function (event) {
            if (event.data === "PONG") {
                return;
            }

            if (event.data === "STOCK_UPDATED") {
                console.log("Reports WebSocket: Received STOCK_UPDATED. Refreshing data...");
                if (window.showToast) window.showToast("🔄 Stock updated! Reports refreshed.", "info", null, 2500);
                autoRefreshReports();
            }
        };

        reportSocket.onclose = function () {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            reconnectAttempts++;
            const delay = Math.min(MAX_RECONNECT_DELAY, 2000 * Math.pow(1.5, reconnectAttempts));
            console.warn(`Reports WebSocket: Disconnected. Reconnecting in ${(delay / 1000).toFixed(1)}s...`);
            setTimeout(connectWebSocket, delay);
        };

        reportSocket.onerror = function (error) {
            console.error("Reports WebSocket Error:", error);
            reportSocket.close();
        };
    } catch (e) {
        console.error("WebSocket setup failed:", e);
    }
}

// --- 10. Event Listeners Registration ---
document.addEventListener('DOMContentLoaded', () => {
    // Ledger Date input & button
    const dateInput = document.getElementById('ledgerDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
        dateInput.addEventListener('change', loadDateWiseStock);
    }
    const dateSearchBtn = document.getElementById('dateSearchBtn');
    if (dateSearchBtn) dateSearchBtn.addEventListener('click', loadDateWiseStock);

    // ⚡ 300ms Debounced live search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debouncedSearch);
        searchInput.addEventListener('keyup', debouncedSearch);
    }

    // Filter clear & Summary refresh
    const clearFilterBtn = document.getElementById('clearItemFilterBtn');
    if (clearFilterBtn) clearFilterBtn.addEventListener('click', clearItemFilter);

    const refreshSummaryBtn = document.getElementById('refreshSummaryBtn');
    if (refreshSummaryBtn) refreshSummaryBtn.addEventListener('click', loadEndToEndSummary);

    // Inward Pagination Buttons
    const inwardPrevBtn = document.getElementById('inwardPrevBtn');
    const inwardNextBtn = document.getElementById('inwardNextBtn');
    if (inwardPrevBtn) inwardPrevBtn.addEventListener('click', () => changeInwardPage(-1));
    if (inwardNextBtn) inwardNextBtn.addEventListener('click', () => changeInwardPage(1));

    // Outward Pagination Buttons
    const outwardPrevBtn = document.getElementById('outwardPrevBtn');
    const outwardNextBtn = document.getElementById('outwardNextBtn');
    if (outwardPrevBtn) outwardPrevBtn.addEventListener('click', () => changeOutwardPage(-1));
    if (outwardNextBtn) outwardNextBtn.addEventListener('click', () => changeOutwardPage(1));

    // Export Buttons
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => exportExcel('all'));

    const printPdfBtn = document.getElementById('printPdfBtn');
    if (printPdfBtn) printPdfBtn.addEventListener('click', printReportPdf);

    // Delegated click listener for item names
    document.addEventListener('click', (e) => {
        const itemTarget = e.target.closest('[data-item-name]') || e.target.closest('.clickable-item');
        if (itemTarget) {
            const itemName = itemTarget.getAttribute('data-item-name') || itemTarget.innerText.trim();
            if (itemName) filterByItem(itemName);
        }
    });

    // Initial load
    Promise.all([
        loadDateWiseStock(),
        loadReports(),
        loadEndToEndSummary()
    ]).finally(() => {
        if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
            window.PageLoader.hide();
        }
    });
    connectWebSocket();
});

// Backwards compatibility globals
window.loadDateWiseStock = loadDateWiseStock;
window.loadReports = loadReports;
window.loadEndToEndSummary = loadEndToEndSummary;
window.filterBySearchText = filterBySearchText;
window.filterByItem = filterByItem;
window.clearItemFilter = clearItemFilter;
window.autoRefreshReports = autoRefreshReports;
window.changeInwardPage = changeInwardPage;
window.changeOutwardPage = changeOutwardPage;
window.exportExcel = exportExcel;
window.printReportPdf = printReportPdf;
