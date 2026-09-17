let currentPlanId = null;
        let globalGrandTotalWeight = 0;

        document.addEventListener("DOMContentLoaded", async () => {
            const savedTheme = localStorage.getItem('theme_preference') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);

            const urlParams = new URLSearchParams(window.location.search);
            currentPlanId = urlParams.get('plan_id') || urlParams.get('dp_number');

            await loadPlanSelector();

            if (currentPlanId) {
                document.getElementById('planSelector').value = String(currentPlanId);
                await loadChallanData(currentPlanId);
            }

            document.getElementById('planSelector').addEventListener('change', async (e) => {
                const selectedPlanId = e.target.value;
                if (selectedPlanId) {
                    currentPlanId = selectedPlanId;
                    await loadChallanData(currentPlanId);
                } else {
                    currentPlanId = null;
                    resetChallanUI();
                }
            });

            document.getElementById('input_gross_weight').addEventListener('input', (e) => {
                const grossVal = parseFloat(e.target.value) || 0;
                const finalNet = Math.max(0, globalGrandTotalWeight + grossVal);
                document.getElementById('lbl_grand_total_weight').innerText = `${finalNet.toFixed(2)} KG`;
            });

            if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
                window.PageLoader.hide();
            }
        });

        function resetChallanUI() {
            document.getElementById('planSelector').value = '';
            document.getElementById('challanItemsTbody').innerHTML =
                `<tr><td colspan="8" class="text-center py-4 ch-empty-msg"><i class="bi bi-inbox me-2"></i>Please select a DP Plan.</td></tr>`;
            document.getElementById('lbl_so_no').innerText = '—';
            document.getElementById('lbl_challan_date').innerText = '—';
            document.getElementById('lbl_status_badge').innerText = 'STATUS: —';
            
            const dpPlanDisplay = document.getElementById('dpPlanNumberDisplay');
            if (dpPlanDisplay) {
                dpPlanDisplay.innerText = 'DP PLAN: —';
            }
        }

        async function loadPlanSelector() {
            const selectEl = document.getElementById('planSelector');
            try {
                const res = await fetch(`/api/dispatch-plans/list`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                if (res.ok && data.plans) {
                    selectEl.innerHTML = '<option value="">-- Select DP Plan --</option>' +
                        data.plans.map(plan => `<option value="${plan.id}">${plan.plan_no} (SO: ${plan.so_no || 'N/A'})</option>`).join('');
                }
            } catch (e) {
                // silently fail
            }
        }

        async function loadChallanData(planId) {
            const tbody = document.getElementById('challanItemsTbody');
            try {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">
                    <div class="spinner-border text-primary me-2" style="width:1.2rem;height:1.2rem;border-width:2px;"></div>Loading...
                </td></tr>`;

                const res = await fetch(`/api/delivery-challan/${encodeURIComponent(planId)}`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();

                if (!res.ok) {
                    if (window.showToast) window.showToast("❌ Error: " + (data.detail || "Failed to load data"), "error");
                    return;
                }

                document.getElementById('lbl_so_no').innerText = data.so_no || 'N/A';
                document.getElementById('lbl_status_badge').innerText = `STATUS: ${data.plan_status || 'UNKNOWN'}`;

                // Update DP Plan Number banner for printing
                const dpPlanDisplay = document.getElementById('dpPlanNumberDisplay');
                if (dpPlanDisplay && data.plan_no) {
                    dpPlanDisplay.innerText = `DP PLAN: ${data.plan_no}`;
                }

                const now = new Date(data.created_at || Date.now());
                document.getElementById('lbl_challan_date').innerText =
                    now.toLocaleDateString('en-IN') + ' ' +
                    now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

                if (data.vehicle_no) document.getElementById('input_vehicle_no').value = data.vehicle_no;
                if (data.transporter_name) document.getElementById('input_transporter_name').value = data.transporter_name;
                if (data.driver_info) document.getElementById('input_driver_info').value = data.driver_info;
                document.getElementById('input_loading_datetime').value = new Date().toLocaleString('en-IN');

                const items = data.items || [];
                let totalPlannedQty = 0, grandTotalWeight = 0;

                tbody.innerHTML = items.map((itm, idx) => {
                    const plannedQty = parseFloat(itm.planned_qty) || 0;
                    const wtPerUnit = parseFloat(itm.weight_per_pc) || 0;
                    const itemTotalWt = parseFloat(itm.total_weight_kg) || (plannedQty * wtPerUnit);

                    totalPlannedQty += plannedQty;
                    grandTotalWeight += itemTotalWt;

                    return `
                        <tr>
                            <td class="text-center fw-bold">${idx + 1}</td>
                            <td class="fw-semibold">${escapeHtml(itm.item_name)}</td>
                            <td class="text-center font-monospace">${plannedQty}</td>
                            <td class="text-center fw-bold font-monospace ch-loaded-qty">${plannedQty}</td>
                            <td class="text-center">${escapeHtml(itm.unit || 'Nos')}</td>
                            <td class="text-end font-monospace">${wtPerUnit > 0 ? wtPerUnit.toFixed(3) : '—'}</td>
                            <td class="text-end fw-bold font-monospace">${itemTotalWt.toFixed(2)} KG</td>
                        </tr>`;
                }).join('');

                globalGrandTotalWeight = grandTotalWeight;
                document.getElementById('tfoot_total_planned').innerText = totalPlannedQty;
                document.getElementById('tfoot_total_loaded').innerText = totalPlannedQty;
                document.getElementById('tfoot_total_weight').innerText = `${grandTotalWeight.toFixed(2)} KG`;
                document.getElementById('lbl_total_items_count').innerText = `${items.length} Items`;
                document.getElementById('lbl_grand_total_weight').innerText = `${grandTotalWeight.toFixed(2)} KG`;

            } catch (err) {
                if (window.showToast) window.showToast("❌ Failed to load loading list data.", "error");
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function saveVehicleInfo() {
            if (!currentPlanId) return;
            try {
                const res = await fetch(`/api/delivery-challan/update-vehicle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
                    body: JSON.stringify({
                        plan_id: currentPlanId,
                        vehicle_no: document.getElementById('input_vehicle_no').value.trim(),
                        transporter_name: document.getElementById('input_transporter_name').value.trim(),
                        driver_info: document.getElementById('input_driver_info').value.trim()
                    })
                });
                if (res.ok) { if (window.showToast) window.showToast("✅ Vehicle details saved successfully!", "success"); }
                else { if (window.showToast) window.showToast("❌ Error saving details.", "error"); }
            } catch (err) {
                if (window.showToast) window.showToast("❌ Connection Error.", "error");
            }
        }
