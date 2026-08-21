/**
 * ====================================================================
 * 📊 Executive Dashboard Page JavaScript (Secure)
 * ====================================================================
 * Loads KPI metrics via authFetch, renders charts, and handles real-time WebSocket updates.
 */

let trendChartObj = null;
let groupChartObj = null;

const safeFetch = (url, opts) => (window.authFetch ? window.authFetch(url, opts) : fetch(url, opts));

// Fetch Live Dashboard Stats & Render Charts
async function loadDashboardStats() {
    try {
        const res = await safeFetch('/api/dashboard/stats');
        const data = await res.json();

        if (data.status === 'success') {
            // Update KPI Cards
            const inQtyEl = document.getElementById('kpi-inward-qty');
            const inCountEl = document.getElementById('kpi-inward-count');
            const prodWeightEl = document.getElementById('kpi-prod-weight');
            const prodCountEl = document.getElementById('kpi-prod-count');
            const dpCountEl = document.getElementById('kpi-dp-count');
            const itemCountEl = document.getElementById('kpi-item-count');

            if (inQtyEl) inQtyEl.innerText = (data.today_inward_qty || 0).toLocaleString() + ' Qty';
            if (inCountEl) inCountEl.innerText = (data.today_inward_count || 0) + ' Batches';

            if (prodWeightEl) prodWeightEl.innerText = (data.today_prod_weight || 0).toLocaleString() + ' KG';
            if (prodCountEl) prodCountEl.innerText = (data.today_prod_count || 0) + ' Coils';

            if (dpCountEl) dpCountEl.innerText = data.pending_dispatch_count || 0;
            if (itemCountEl) itemCountEl.innerText = data.total_items_count || 0;

            // Render Bar Chart
            if (data.chart) {
                renderTrendChart(data.chart.labels, data.chart.inward, data.chart.production);
                renderGroupChart(data.chart.group_labels, data.chart.group_counts);
            }
        }
    } catch (err) {
        console.error("Dashboard Stats Fetch Error:", err);
    }
}

function renderTrendChart(labels, inwardData, prodData) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (trendChartObj) trendChartObj.destroy();

    const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#f8fafc';
    const mutedColor = getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#94a3b8';

    trendChartObj = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels || [],
            datasets: [
                {
                    label: 'Inward Quantity',
                    data: inwardData || [],
                    backgroundColor: 'rgba(59, 130, 246, 0.75)',
                    borderColor: '#3b82f6',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Production Weight (KG)',
                    data: prodData || [],
                    backgroundColor: 'rgba(245, 158, 11, 0.75)',
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor } }
            },
            scales: {
                x: { ticks: { color: mutedColor }, grid: { display: false } },
                y: { ticks: { color: mutedColor }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderGroupChart(labels, counts) {
    const canvas = document.getElementById('groupChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (groupChartObj) groupChartObj.destroy();

    const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#f8fafc';
    const bgMain = getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#0f172a';

    groupChartObj = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels || [],
            datasets: [{
                data: counts || [],
                backgroundColor: [
                    '#6366f1',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6'
                ],
                borderWidth: 2,
                borderColor: bgMain
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor, font: { size: 12 } } }
            }
        }
    });
}

// WebSocket for Real-Time Live Updates
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = function () {
        console.log("Dashboard WebSocket: Connected for live updates.");
    };

    ws.onmessage = function (event) {
        if (event.data === "STOCK_UPDATED") {
            console.log("Dashboard WebSocket: Received signal. Refreshing stats...");
            loadDashboardStats();
        }
    };

    ws.onclose = function () {
        console.log("Dashboard WebSocket: Disconnected. Reconnecting in 5 seconds...");
        setTimeout(connectWebSocket, 5000);
    };
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboardStats();
    connectWebSocket();

    if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
        window.PageLoader.hide();
    }
});

window.loadDashboardStats = loadDashboardStats;
