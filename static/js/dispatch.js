const API_URL = "";
        let allPlansData = [];
        let editItemModal, editPlanModal;

        document.addEventListener("DOMContentLoaded", async () => {
            const loadingDropzone = document.getElementById('loadingEntryDropzone');
            if (loadingDropzone) {
                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eName => {
                    loadingDropzone.addEventListener(eName, preventDefaults, false);
                });
                ['dragenter', 'dragover'].forEach(eName => {
                    loadingDropzone.addEventListener(eName, () => loadingDropzone.classList.add('dragover'), false);
                });
                ['dragleave', 'drop'].forEach(eName => {
                    loadingDropzone.addEventListener(eName, () => loadingDropzone.classList.remove('dragover'), false);
                });
                loadingDropzone.addEventListener('drop', function (e) {
                    const dt = e.dataTransfer;
                    if (dt.files && dt.files.length > 0) {
                        document.getElementById('loadingEntryFile').files = dt.files;
                        fileSelected(document.getElementById('loadingEntryFile'), 'loadingEntryFileNameDisplay');
                    }
                });
            }

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }

            try {
                await Promise.all([
                    loadLoadingEntryDpPlans(),
                    loadDispatchPlans()
                ]);
            } catch (err) {
                console.error("Initial load error:", err);
            } finally {
                if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
                    window.PageLoader.hide();
                }
            }
        });

        function fileSelected(input, displayId = 'loadingEntryFileNameDisplay') {
            const display = document.getElementById(displayId);
            if (input.files && input.files[0]) {
                display.innerText = `📄 Selected File: ${input.files[0].name}`;
            } else {
                display.innerText = '';
            }
        }

        async function submitLoadingEntryExcel(e) {
            e.preventDefault();
            const fileInput = document.getElementById('loadingEntryFile');
            if (!fileInput.files || !fileInput.files[0]) {
                if (window.showToast) window.showToast("⚠️ Please select the Pending Loading Entry Excel file!", "warning");
                return;
            }

            const btn = document.getElementById('loadingEntrySubmitBtn');
            const progress = document.getElementById('loading-upload-progress');
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Processing...`;
            progress.style.display = 'block';

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            const customDpNo = document.getElementById('uploadCustomDpNo')?.value?.trim();
            if (customDpNo) {
                formData.append('disp_plan_no', customDpNo);
            }

            try {
                const res = await fetch(`${API_URL}/api/dispatch/upload-loading-entry`, {
                    method: 'POST',
                    headers: { 'Bypass-Tunnel-Reminder': 'true' },
                    body: formData
                });

                const data = await res.json();
                if (res.ok) {
                    if (window.showToast) window.showToast(data.message || "Excel Uploaded Successfully!", res.ok ? "success" : "error");
                    const modalEl = document.getElementById('uploadLoadingEntryModal');
                    const modalInstance = bootstrap.Modal.getInstance(modalEl);
                    if (modalInstance) modalInstance.hide();
                    document.getElementById('uploadLoadingEntryForm').reset();
                    document.getElementById('loadingEntryFileNameDisplay').innerText = '';
                    await loadLoadingEntryDpPlans();
                    loadDispatchPlans();
                    const select = document.getElementById('loadingDpSelect');
                    if (select && select.options.length > 1) {
                        select.selectedIndex = 1;
                        handleLoadingDpSelect();
                    }
                } else {
                    if (window.showToast) window.showToast("❌ " + (data.detail || data.message || "Error uploading file"), "error");
                }
            } catch (err) {
                console.error("Upload error:", err);
                if (window.showToast) window.showToast("❌ Unable to connect to server: " + err.message, "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> Upload & Process`;
                progress.style.display = 'none';
            }
        }

        async function loadLoadingEntryDpPlans() {
            const select = document.getElementById('loadingDpSelect');
            try {
                const res = await fetch(`${API_URL}/api/loading-entry/dp-plans`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                if (res.ok && data.dp_plans) {
                    const optionsHtml = '<option value="">-- Select DP Plan Number --</option>' +
                        data.dp_plans.map(dp => `<option value="${dp}">${dp}</option>`).join('');
                    select.innerHTML = optionsHtml;
                }
            } catch (e) {
                console.error("Error loading DP plans", e);
            }
        }

        async function handleLoadingDpSelect() {
            const dpPlanNo = document.getElementById('loadingDpSelect').value;
            const soContainer = document.getElementById('soNumberContainer');
            const itemsContainer = document.getElementById('loading-items-container');
            const plansListArea = document.getElementById('plansListArea');
            soContainer.innerHTML = '';
            soContainer.style.display = 'none';
            itemsContainer.style.display = 'none';

            if (!dpPlanNo) {
                if (plansListArea) plansListArea.style.display = 'block';
                return;
            }

            if (plansListArea) plansListArea.style.display = 'none';

            try {
                const res = await fetch(`${API_URL}/api/loading-entry/so-numbers/${encodeURIComponent(dpPlanNo)}`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                if (res.ok && data.so_numbers && data.so_numbers.length > 0) {
                    soContainer.style.display = 'flex';
                    soContainer.innerHTML = data.so_numbers.map(so => {
                        const safeId = `so-${so.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                        return `
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" value="${so}" id="${safeId}" onchange="handleSoSelection()" checked>
                                <label class="form-check-label fw-bold cursor-pointer" for="${safeId}">
                                    ${so}
                                </label>
                            </div>
                        `;
                    }).join('');
                    // After checking all SOs by default, automatically trigger the item loading.
                    handleSoSelection();
                }
            } catch (e) {
                console.error("Error fetching SO numbers", e);
            }
        }

        async function handleSoSelection() {
            const dpPlanNo = document.getElementById('loadingDpSelect').value;
            const soCheckboxes = document.querySelectorAll('#soNumberContainer input[type="checkbox"]:checked');
            const selectedSoNumbers = Array.from(soCheckboxes).map(cb => cb.value);
            const itemsContainer = document.getElementById('loading-items-container');
            const itemsTbody = document.getElementById('loadingItemsTbody');

            document.getElementById('createPlanBtn').disabled = true;
            let finalItemList = [];
            if (!dpPlanNo || selectedSoNumbers.length === 0) {
                itemsTbody.innerHTML = '';
                itemsContainer.style.display = 'none';
                return;
            }

            itemsContainer.style.display = 'block';
            itemsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Loading items...</td></tr>';

            try {
                const res = await fetch(`${API_URL}/api/loading-entry/items?dp_plan_no=${encodeURIComponent(dpPlanNo)}&so_numbers=${encodeURIComponent(selectedSoNumbers.join(','))}`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                if (res.ok && data.items) {
                    if (data.items.length === 0) {
                        itemsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No items found for selection.</td></tr>';
                        return;
                    }

                    const aggregatedItems = {};
                    data.items.forEach(item => {
                        const key = `${item.item_name}_${item.item_code || ''}_${item.unit}`;
                        if (!aggregatedItems[key]) {
                            aggregatedItems[key] = {
                                item_name: item.item_name,
                                item_code: item.item_code || 'N/A',
                                pending_qty: 0,
                                unit: item.unit || 'Nos'
                            };
                        }
                        const parsedQty = parseFloat(item.pending_qty || item.planned_qty || 0);
                        aggregatedItems[key].pending_qty += isNaN(parsedQty) ? 0 : parsedQty;
                    });

                    finalItemList = Object.values(aggregatedItems);
                    document.getElementById('totalItemsCount').innerText = `${finalItemList.length} Items`;

                    itemsTbody.innerHTML = finalItemList.map((item, index) => `
                        <tr>
                            <td class="text-center" style="color: #000000 !important;">${index + 1}</td>
                            <td class="fw-bold" style="color: #000000 !important;">${item.item_name}</td>
                            <td><span class="badge bg-secondary text-dark">${item.item_code}</span></td>
                            <td class="text-center"><span class="badge bg-info text-dark fs-6">${Number(item.pending_qty.toFixed(2))}</span></td>
                            <td class="text-center" style="color: #000000 !important;">${item.unit}</td>
                        </tr>
                    `).join('');
                }
            } catch (e) {
                console.error("Error fetching items", e);
                itemsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">Error loading items.</td></tr>';
            }
            document.getElementById('createPlanBtn').disabled = !(finalItemList && finalItemList.length > 0);
        }

        async function createDispatchPlan() {
            const dpPlanNo = document.getElementById('loadingDpSelect').value;
            const soCheckboxes = document.querySelectorAll('#soNumberContainer input[type="checkbox"]:checked');
            const selectedSoNumbers = Array.from(soCheckboxes).map(cb => cb.value);

            if (!dpPlanNo || selectedSoNumbers.length === 0) {
                if (window.showToast) window.showToast("Please select a DP Plan and at least one SO number.", "info");
                return;
            }

            const btn = document.getElementById('createPlanBtn');
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Creating...`;

            try {
                const res = await fetch(`${API_URL}/api/dispatch/create-from-loading-entry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Bypass-Tunnel-Reminder': 'true'
                    },
                    body: JSON.stringify({
                        disp_plan_no: dpPlanNo,
                        so_numbers: selectedSoNumbers
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    if (window.showToast) window.showToast(data.message || "Dispatch Plan created successfully!", "success");
                    window.location.reload(); // Reload the page to clear selections and refresh lists
                } else {
                    if (window.showToast) window.showToast("❌ " + (data.detail || "Error creating dispatch plan."), "error");
                }
            } catch (e) {
                if (window.showToast) window.showToast("❌ Server error while creating plan.", "error");
            }
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> Create Dispatch Plan`;
        }

async function loadDispatchPlans(isSilent = false) {
            if (isSilent && document.hidden) return;
            const pendingContainer = document.getElementById('pendingPlansContainer');
            const completedContainer = document.getElementById('completedPlansContainer');
            const pendingCountEl = document.getElementById('pendingCount');
            const completedCountEl = document.getElementById('completedCount');

            try {
                const res = await fetch(`${API_URL}/api/dispatch-plans/list`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                });
                const data = await res.json();
                allPlansData = data.plans || [];

                const pendingPlans = allPlansData.filter(p => p.status !== 'COMPLETED');
                const completedPlans = allPlansData.filter(p => p.status === 'COMPLETED');

                if (pendingCountEl) pendingCountEl.textContent = pendingPlans.length;
                if (completedCountEl) completedCountEl.textContent = completedPlans.length;

                // Render pending plans
                if (pendingPlans.length === 0) {
                    pendingContainer.innerHTML = `
                    <div class="glass-card p-5 text-center text-muted">
                        <i class="bi bi-inbox display-1 text-slate-600 mb-3 d-block"></i>
                        <h5>No Pending Dispatch Plans.</h5>
                        <p class="small">All plans are completed or none exist yet.</p>
                    </div>`;
                } else {
                    pendingContainer.innerHTML = renderPlansCards(pendingPlans);
                }

                // Render completed plans
                if (completedPlans.length === 0) {
                    completedContainer.innerHTML = `
                    <div class="glass-card p-5 text-center text-muted">
                        <i class="bi bi-check2-circle display-1 text-success mb-3 d-block"></i>
                        <h5>No Completed Dispatch Plans.</h5>
                        <p class="small">Completed plans will appear here.</p>
                    </div>`;
                } else {
                    completedContainer.innerHTML = renderPlansCards(completedPlans);
                }
            } catch (err) {
                console.error("Error loading plans:", err);
                pendingContainer.innerHTML = `<div class="alert alert-danger text-center">❌ Error loading Dispatch Plans.</div>`;
                completedContainer.innerHTML = `<div class="alert alert-danger text-center">❌ Error loading Dispatch Plans.</div>`;
            }
        }

        function renderPlansCards(plans) {
            return plans.map(plan => {
                const isCompleted = plan.status === 'COMPLETED';
                return `
                <div class="glass-card mb-4 overflow-hidden" style="background-color: var(--bg-card) !important;">
                    <div class="p-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2" style="border-color: var(--border-color) !important;">
                        <div>
                            <span class="badge ${isCompleted ? 'bg-success' : 'bg-brand'} me-2 fs-6">
                                ${isCompleted ? '✔ COMPLETED' : '🟢 ACTIVE PLAN'}
                            </span>
                            <strong class="fs-5 font-monospace me-2" style="color: var(--text-main);">${plan.plan_no}</strong>
                            <span class="small text-muted"><i class="bi bi-receipt me-1"></i> SO No: ${plan.so_no || 'N/A'}</span>
                            <button onclick='openEditPlanModal(${plan.id}, ${JSON.stringify(plan.plan_no)}, ${JSON.stringify(plan.so_no)})' class="btn btn-sm btn-outline-info ms-2 py-0 px-2" title="Edit Plan Details"><i class="bi bi-pencil"></i></button>
                        </div>
<div class="d-flex align-items-center gap-2">
                            <a href="/scanner?plan_id=${plan.id}" class="btn btn-sm btn-brand fw-bold">
                                <i class="bi bi-qr-code-scan me-1"></i> 📲 Scan for this Plan
                            </a>
                            <button onclick="printPlan(${plan.id})" class="btn btn-sm btn-outline-secondary">
                                <i class="bi bi-printer"></i> Print
                            </button>
                            <button onclick="deletePlan(${plan.id}, '${plan.plan_no}')" class="btn btn-sm btn-outline-danger">
                                <i class="bi bi-trash"></i> Delete
                            </button>
                        </div>
                    </div>

                    <div class="p-3">
                        <div class="table-responsive">
                            <table class="table table-custom table-hover align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Item Description</th>
                                        <th class="text-center">Planned Qty</th>
                                        <th class="text-center">Dispatched Qty</th>
                                        <th class="text-center">Remaining</th>
                                        <th class="text-center">Status</th>
                                        <th class="text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(plan.items || []).map((item, idx) => {
                        const done = item.dispatched_qty >= item.planned_qty;
                        const rem = Math.max(0, item.planned_qty - item.dispatched_qty);
                        return `
                                                <tr>
                                                    <td style="color: #000000 !important;">${idx + 1}</td>
                                                    <td class="fw-bold" style="color: #000000 !important;">${item.item_name}</td>
                                                    <td class="text-center"><span class="badge bg-secondary fs-6">${item.planned_qty} ${item.unit}</span></td>
                                                    <td class="text-center"><span class="badge bg-info text-dark fs-6">${item.dispatched_qty} ${item.unit}</span></td>
                                                    <td class="text-center"><span class="badge ${rem === 0 ? 'bg-success' : 'bg-warning text-dark'} fs-6">${rem} ${item.unit}</span></td>
                                                    <td class="text-center"><span class="badge ${done ? 'bg-success' : 'border border-warning text-warning'}">${done ? '✔ DONE' : '⏳ PENDING'}</span></td>
                                                    <td class="text-center"><button onclick='openEditItemModal(${item.id}, ${JSON.stringify(item.item_name)}, ${item.planned_qty}, ${JSON.stringify(item.unit)})' class="btn btn-sm btn-outline-primary py-0 px-2"><i class="bi bi-pencil"></i> Edit</button></td>
                                                </tr>
                                        `;
                    }).join('') || `<tr><td colspan="7" class="text-center text-muted py-3">No items in this plan.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                `;
}).join('');
        }

        function printPlan(planId) {
            const plan = allPlansData.find(p => p.id === planId);
            if (!plan) {
                if (window.showToast) window.showToast("Could not find plan data to print.", "info");
                return;
            }

            const printContent = `
            <html>
            <head>
            <style>
                @page { size: A4; margin: 15mm 10mm; }
                body { font-family: 'Arial', sans-serif; color: #000; margin: 0; padding: 0; }
                .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
                .header h1 { font-size: 20px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px; }
                .header p { font-size: 12px; margin: 2px 0; color: #555; }
                .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; border: 1px solid #ccc; padding: 10px 15px; border-radius: 4px; }
                .info-grid div { display: flex; flex-direction: column; }
                .info-grid strong { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 2px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
                th { background-color: #f0f0f0; border: 1px solid #999; padding: 10px 8px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
                th.num { text-align: right; }
                th.center { text-align: center; }
                td { border: 1px solid #999; padding: 8px 10px; }
                td.num { text-align: right; font-weight: bold; }
                td.center { text-align: center; }
                .footer { margin-top: 30px; border-top: 2px solid #000; padding-top: 10px; font-size: 11px; color: #777; text-align: center; }
                .sign-section { display: flex; justify-content: space-between; margin-top: 40px; }
                .sign-box { width: 45%; border-top: 1px solid #999; padding-top: 8px; text-align: center; font-size: 12px; }
                @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
            </head>
            <body>
            <div class="header">
                <h1>Bhumi Polymers Pvt. Ltd.</h1>
                <p>Dispatch Plan Document</p>
            </div>
            
            <div class="info-grid">
                <div><strong>Dispatch Plan No</strong>${plan.plan_no}</div>
                <div><strong>SO Number</strong>${plan.so_no || 'N/A'}</div>
                <div><strong>Date</strong>${new Date(plan.created_at).toLocaleDateString('en-IN')}</div>
                <div><strong>Total Items</strong>${(plan.items || []).length}</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th>Item Description</th>
                        <th class="num" style="width: 15%;">Planned Qty</th>
                        <th class="center" style="width: 10%;">Unit</th>
                        <th class="center" style="width: 10%;">Dispatched</th>
                        <th class="center" style="width: 10%;">Remaining</th>
                        <th class="center" style="width: 10%;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${(plan.items || []).map((item, idx) => {
                        const dispatched = item.dispatched_qty || 0;
                        const remaining = Math.max(0, item.planned_qty - dispatched);
                        const done = dispatched >= item.planned_qty;
                        return `
                        <tr>
                            <td class="center">${idx + 1}</td>
                            <td style="font-weight: bold;">${item.item_name}</td>
                            <td class="num">${item.planned_qty}</td>
                            <td class="center">${item.unit}</td>
                            <td class="num">${dispatched}</td>
                            <td class="num">${remaining}</td>
                            <td class="center" style="color: ${done ? 'green' : 'orange'}; font-weight: bold;">
                                ${done ? 'DONE' : 'PENDING'}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            
            <div class="sign-section">
                <div class="sign-box">Sender Signature</div>
                <div class="sign-box">Receiver Signature</div>
            </div>
            
            <div class="footer">
                Generated on ${new Date().toLocaleString('en-IN')} | Bhumi Factory & Dispatch Manager
            </div>
            </body>
            </html>`;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                if (window.showToast) window.showToast("Please allow popups to print.", "warning");
                return;
            }
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 500);
        }

        function printDispatchThermalLabel(planId) {
            const plan = allPlansData.find(p => p.id === planId);
            if (!plan) {
                if (window.showToast) window.showToast("Could not find plan data to print.", "info");
                return;
            }

            const printArea = document.getElementById('thermal-label-print-area');
            if (!printArea) return;

            document.getElementById('thermal-dp-no').innerText = plan.plan_no || 'N/A';
            document.getElementById('thermal-so-no').innerText = plan.so_no || 'N/A';
            const itemCount = (plan.items || []).length;
            document.getElementById('thermal-items-count').innerText = `${itemCount} Items`;
            document.getElementById('thermal-status').innerText = plan.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE';
            document.getElementById('thermal-date').innerText = new Date(plan.created_at).toLocaleDateString('en-IN') + ' ' + new Date(plan.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const qrPayload = JSON.stringify({
                planId: plan.id,
                planNo: plan.plan_no,
                soNo: plan.so_no || '',
                items: plan.items || [],
                status: plan.status
            });

            const qrContainer = document.getElementById('thermal-qrcode-dispatch');
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: qrPayload,
                width: 140,
                height: 140,
                correctLevel: QRCode.CorrectLevel.H
            });

            document.body.classList.add('print-thermal-label');
            printArea.style.display = 'block';
            setTimeout(() => {
                window.print();
            }, 300);
        }

        async function deletePlan(id, planNo) {
            if (!confirm(`Are you sure you want to delete Dispatch Plan '${planNo}' ?`)) return;

            try {
                const res = await fetch(`${API_URL}/api/dispatch-plan/${id}`, { method: 'DELETE' });
                const data = await res.json();
                    if (window.showToast) window.showToast(data.message || data.detail, res.ok ? "success" : "error");
                if (res.ok) loadDispatchPlans();
            } catch (err) {
                if (window.showToast) window.showToast("❌ Server Error", "error");
            }
        }

        let itemNamesLoaded = false;
        async function populateItemsDatalist() {
            if (itemNamesLoaded) return;
            try {
                const res = await fetch(`${API_URL}/api/items/names`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                const datalist = document.getElementById('itemsDatalist');
                if (!datalist) return;
                const names = data.names || [];
                datalist.innerHTML = names.map(n => `<option value="${n}">`).join('');
                itemNamesLoaded = true;
            } catch (err) {
                console.error("Error populating items datalist:", err);
            }
        }

        function openEditPlanModal(planId, planNo, soNo) {
            document.getElementById('editPlanId').value = planId;
            document.getElementById('editPlanNo').value = planNo;
            document.getElementById('editSoNo').value = soNo;
            if (!editPlanModal) {
                const el = document.getElementById('editPlanModal');
                if (el && typeof bootstrap !== 'undefined') editPlanModal = new bootstrap.Modal(el);
            }
            if (editPlanModal) editPlanModal.show();
        }

        async function submitPlanUpdate(e) {
            e.preventDefault();
            const planId = document.getElementById('editPlanId').value;
            const planData = {
                plan_no: document.getElementById('editPlanNo').value,
                so_no: document.getElementById('editSoNo').value,
            };

            try {
                const res = await fetch(`${API_URL}/api/dispatch-plan/${planId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(planData)
                });
                const result = await res.json();
                if (window.showToast) window.showToast(result.message || result.detail, res.ok ? "success" : "error");
                if (res.ok) {
                    editPlanModal.hide();
                    loadDispatchPlans();
                }
            } catch (err) {
                if (window.showToast) window.showToast("❌ Server Error", "error");
            }
        }

        function openEditItemModal(itemId, itemName, plannedQty, unit) {
            populateItemsDatalist();
            document.getElementById('editItemId').value = itemId;
            document.getElementById('editItemName').value = itemName;
            document.getElementById('editPlannedQty').value = plannedQty;
            document.getElementById('editUnit').value = unit;
            if (!editItemModal) {
                const el = document.getElementById('editItemModal');
                if (el && typeof bootstrap !== 'undefined') editItemModal = new bootstrap.Modal(el);
            }
            if (editItemModal) editItemModal.show();
        }

        async function submitItemUpdate(e) {
            e.preventDefault();
            const itemId = document.getElementById('editItemId').value;
            const itemData = {
                item_name: document.getElementById('editItemName').value,
                planned_qty: parseFloat(document.getElementById('editPlannedQty').value),
                unit: document.getElementById('editUnit').value,
            };

            try {
                const res = await fetch(`${API_URL}/api/dispatch-plan/item/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemData)
                });
                const result = await res.json();
                if (window.showToast) window.showToast(result.message || result.detail, res.ok ? "success" : "error");
                if (res.ok) {
                    editItemModal.hide();
                    loadDispatchPlans();
                }
            } catch (err) {
                if (window.showToast) window.showToast("❌ Server Error", "error");
            }
        }

        // Theme will be initialized by theme.js which auto-applies on load
        if (window.ThemeManager && typeof window.ThemeManager.applyTheme === 'function') {
            window.ThemeManager.applyTheme();
        }

        /**
         * Download a properly formatted Excel template for Dispatch Plan upload.
         * This ensures users have the correct column headers expected by the backend.
         */
        function downloadTemplateExcel() {
            // CSV content with the exact headers the backend expects
            const headers = [
                'Disp. Plan No.',
                'Disp. Plan Date',
                'SO No.',
                'SO Date',
                'Cust./Location',
                'Dealer',
                'Village',
                'District',
                'Item',
                'Code',
                'Pend. Qty.',
                'Unit'
            ];

            // Example data row
            const exampleRow = [
                'DP-2026-001',
                '2026-09-16',
                'SO-2026-001',
                '2026-09-16',
                'Customer Name / Location',
                'Dealer Name',
                'Village Name',
                'District Name',
                'Item Name',
                'ITEM001',
                '100',
                'Nos'
            ];

            // Build CSV
            const csvContent = [
                headers.join(','),
                exampleRow.join(',')
            ].join('\n');

            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'dispatch_plan_template.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (window.showToast) window.showToast('✅ Template downloaded! Fill it and upload.', 'success');
        }
