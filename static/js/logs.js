/**
 * ====================================================================
 * 📜 Activity Log Book Page JavaScript (Secure & Debounced)
 * ====================================================================
 * Handles fetching with token-based authFetch, XSS sanitization,
 * 300ms search debouncing, and real-time WebSocket updates for logs.
 */

let allLogs = [];

const safeEscape = (str) => (window.escapeHtml ? window.escapeHtml(str) : String(str || '').replace(/[&<>"'`]/g, ''));
const safeFetch = (url, opts) => (window.authFetch ? window.authFetch(url, opts) : fetch(url, opts));

async function loadLogs() {
    try {
        const res = await safeFetch('/api/logs');
        const data = await res.json();
        allLogs = data.logs || [];
        renderLogs(allLogs);
    } catch (err) {
        console.error("Logs error:", err);
    }
}

function renderLogs(logs) {
    const tbody = document.getElementById('logsTable');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No activity logs found.</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(row => {
        const id = safeEscape(row.id);
        const userName = safeEscape(row.user_name || 'Admin');
        const action = safeEscape(row.action || '');
        const details = safeEscape(row.details || '');
        const timeStr = row.timestamp ? safeEscape(new Date(row.timestamp).toLocaleString()) : 'N/A';

        let badgeClass = 'bg-primary';
        if (action.includes('INWARD') || action.includes('ADD')) badgeClass = 'bg-success';
        if (action.includes('OUTWARD') || action.includes('DISPATCH')) badgeClass = 'bg-danger';
        if (action.includes('RESET') || action.includes('WARNING')) badgeClass = 'bg-warning text-dark';

        return `
            <tr>
                <td class="ps-4 fw-bold text-secondary">#${id}</td>
                <td><small class="text-muted">${timeStr}</small></td>
                <td><span class="badge bg-dark px-2 py-1">${userName}</span></td>
                <td><span class="badge ${badgeClass} fs-6">${action}</span></td>
                <td class="fw-semibold text-slate-800">${details}</td>
            </tr>
        `;
    }).join('');
}

function filterLogs() {
    const searchInput = document.getElementById('logSearch');
    if (!searchInput) return;
    const text = searchInput.value.toLowerCase().trim();

    if (!text) {
        renderLogs(allLogs);
        return;
    }

    const filtered = allLogs.filter(row =>
        (row.user_name && String(row.user_name).toLowerCase().includes(text)) ||
        (row.action && String(row.action).toLowerCase().includes(text)) ||
        (row.details && String(row.details).toLowerCase().includes(text))
    );
    renderLogs(filtered);
}

// ⚡ 300ms Debounced Log Search
const debouncedLogSearch = window.debounce ? window.debounce(filterLogs, 300) : filterLogs;

// Real-Time WebSocket Connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = function () {
        console.log("Logs WebSocket: Connected for live updates.");
    };

    ws.onmessage = function (event) {
        if (event.data === "STOCK_UPDATED" || event.data === "LOG_ADDED") {
            console.log("Logs WebSocket: Received signal. Refreshing logs...");
            loadLogs();
        }
    };

    ws.onclose = function () {
        console.log("Logs WebSocket: Disconnected. Reconnecting in 5 seconds...");
        setTimeout(connectWebSocket, 5000);
    };
}

// Register event listeners
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('logSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debouncedLogSearch);
        searchInput.addEventListener('keyup', debouncedLogSearch);
    }

    const refreshBtn = document.getElementById('refreshLogsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLogs);
    }

    loadLogs().then(() => {
        if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
            window.PageLoader.hide();
        }
    });
    connectWebSocket();
});

window.loadLogs = loadLogs;
window.filterLogs = filterLogs;
