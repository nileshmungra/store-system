const API_URL = window.location.origin;
        let allItems = [];
        let finishedGoods = [];
        let rawMaterials = [];
        let currentEditingBomId = null;

function setListLoading(containerId, isLoading) {
            const container = document.getElementById(containerId);
            if (!container || !isLoading) return;
            container.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-warning" role="status"></div><p class="text-muted mt-2">Loading...</p></div>`;
        }

function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function debugBOMApi() {
            try {
                const res = await fetch(`${API_URL}/api/boms/list`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                });
                const data = await res.json();
                console.group("BOM API Debug");
                console.log("Status:", res.status, res.statusText);
                console.log("Response:", JSON.stringify(data, null, 2));
                console.log("BOM count:", data.boms ? data.boms.length : 0);
                if (data.boms && data.boms.length > 0) {
                    console.log("First BOM:", data.boms[0]);
                }
                console.groupEnd();
                
                if (window.showToast) {
                    window.showToast(`BOM API: ${data.boms ? data.boms.length : 0} BOMs found. Check console (F12) for details.`, 
                        data.boms && data.boms.length > 0 ? 'success' : 'warning');
                }
            } catch (err) {
                console.error("Debug error:", err);
                if (window.showToast) window.showToast("Debug failed: " + err.message, 'error');
            }
        }

        document.addEventListener("DOMContentLoaded", async () => {
            await Promise.all([
                loadAllItems(),
                loadBOMs()
            ]);

            if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
                window.PageLoader.hide();
            }
        });

        async function loadAllItems() {
            try {
                const res = await fetch(`${API_URL}/api/items/list?limit=0`);
                const data = await res.json();
                allItems = data.items || [];

                finishedGoods = allItems.filter(i => i.is_own_production === 1 || i.item_group === 'Own Production');
                rawMaterials = allItems.filter(i => i.is_own_production === 0 && i.item_group !== 'Own Production');

                const fgDatalist = document.getElementById('finishedGoodsList');
                fgDatalist.innerHTML = finishedGoods.map(i => `<option value="${escapeHtml(i.item_name)}" data-id="${i.id}"></option>`).join('');

            } catch (err) {
                console.error("Error loading items for BOM:", err);
            }
        }

async function loadBOMs() {
            const container = document.getElementById('bomsListContainer');
            if (!container) {
                console.error("BOM list container not found!");
                return;
            }
            setListLoading('bomsListContainer', true);
            try {
                const res = await fetch(`${API_URL}/api/boms/list`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                });
                
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                
                const data = await res.json();
                console.log("BOM API Response:", data);

                if (data.status === "error" || data.detail) {
                    throw new Error(data.detail || data.message || "API returned error");
                }

                if (!data.boms || data.boms.length === 0) {
                    container.innerHTML = `
                    <div class="text-center text-muted p-5 border border-secondary rounded">
                        <i class="bi bi-inbox display-1 text-slate-600 mb-3 d-block"></i>
                        <h5>No BOM definitions found.</h5>
                        <p class="small">Create your first Bill of Materials using the form on the left.</p>
                    </div>`;
                    console.log("No BOMs in database");
                    return;
                }

                console.log(`Rendering ${data.boms.length} BOMs`);
                
                const bomsHtml = data.boms.map((bom, index) => {
                    console.log(`BOM ${index}:`, bom);
                    
                    const bomJson = encodeURIComponent(JSON.stringify(bom));
                    const components = bom.components || [];
                    
                    const componentsHtml = components.length > 0
                        ? components.map(c => `
                            <li class="d-flex justify-content-between border-bottom border-secondary py-1">
                                <span class="text-muted">${escapeHtml(c.component_name || 'Unknown')}</span>
                                <span class="fw-bold text-info">${c.quantity} ${escapeHtml(c.unit || '')}</span>
                            </li>
                        `).join('')
                        : '<li class="text-muted small">No components defined</li>';

                    return `
                    <div class="card mb-3 border-0 shadow-sm" style="background: var(--bg-card) !important;">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                                <h6 class="fw-bold text-white mb-0">
                                    <i class="bi bi-diagram-3 text-warning me-1"></i>
                                    ${escapeHtml(bom.finished_good_name || 'Unknown Product')}
                                </h6>
                                <div class="d-flex gap-1">
                                    <button class="btn btn-sm btn-outline-primary py-0 px-2" 
                                            onclick='editBOM("${bomJson}")'
                                            title="Edit this BOM">
                                        <i class="bi bi-pencil"></i> Edit
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger py-0 px-2" 
                                            onclick="deleteBOM(${bom.bom_id})"
                                            title="Delete this BOM">
                                        <i class="bi bi-trash"></i> Delete
                                    </button>
                                </div>
                            </div>
                            <ul class="list-unstyled mb-0 small">
                                ${componentsHtml}
                            </ul>
                        </div>
                    </div>
                `;
                }).join('');
                
                container.innerHTML = bomsHtml;

            } catch (err) {
                console.error("Error loading BOMs:", err);
                container.innerHTML = `
                <div class="alert alert-danger">
                    <h6>❌ Failed to load BOM definitions</h6>
                    <p class="mb-0 small">${err.message}</p>
                    <button class="btn btn-sm btn-outline-danger mt-2" onclick="loadBOMs()">
                        Retry
                    </button>
                </div>`;
            } finally {
                setListLoading('bomsListContainer', false);
            }
        }

        function addComponentRow(component = null) {
            const container = document.getElementById('componentsContainer');
            const row = document.createElement('div');
            row.className = 'row g-2 align-items-center component-row';

            const componentId = component ? component.component_item_id : '';
            const componentName = component ? component.component_name : '';
            const quantity = component ? component.quantity : '';

            const rmOptionsId = `rawMaterialsList_${Date.now()}`;
            row.innerHTML = `
            <div class="col-7">
                <input class="form-control form-control-sm form-control-dark component-item" list="${rmOptionsId}" placeholder="Search raw material item..." value="${escapeHtml(componentName)}" required autocomplete="off">
                <datalist id="${rmOptionsId}">
                    ${rawMaterials.map(i => `<option value="${escapeHtml(i.item_name)}" data-id="${i.id}"></option>`).join('')}
                </datalist>
            </div>
            <div class="col-3">
                <input type="number" step="any" class="form-control form-control-sm form-control-dark component-qty" placeholder="Qty" value="${quantity}" required>
            </div>
            <div class="col-2 text-end">
                <button type="button" class="btn btn-sm btn-danger py-0 px-2" onclick="this.closest('.component-row').remove()">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `;
            container.appendChild(row);
        }

        function clearForm() {
            document.getElementById('bomForm').reset();
            document.getElementById('componentsContainer').innerHTML = '';
            currentEditingBomId = null;
        }

        function editBOM(bomJson) {
            try {
                const bom = JSON.parse(decodeURIComponent(bomJson));
                clearForm();
                document.getElementById('finishedGood').value = bom.finished_good_name;
                currentEditingBomId = bom.bom_id;

                bom.components.forEach(c => {
                    addComponentRow(c);
                });

                window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (err) {
                console.error("Invalid BOM data:", err);
                if (window.showToast) window.showToast('Invalid BOM data received', 'error');
            }
        }

        async function deleteBOM(bomId) {
            if (!confirm("Are you sure you want to delete this BOM?")) return;

            try {
                const res = await fetch(`${API_URL}/api/boms/delete/${bomId}`, { method: 'DELETE' });
                const data = await res.json();
                if (window.showToast) window.showToast(data.message || data.detail, res.ok ? 'success' : 'error');
                if (res.ok) {
                    loadBOMs();
                }
            } catch (err) {
                if (window.showToast) window.showToast("Server Error", 'error');
            }
        }

        function findOptionId(datalistId, value) {
            const datalist = document.getElementById(datalistId);
            for (const option of datalist.options) {
                if (option.value === value) {
                    return parseInt(option.getAttribute('data-id'));
                }
            }
            return null;
        }

async function saveBOM(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalBtnHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving...`;

            const fgInput = document.getElementById('finishedGood');
            const finishedGoodId = findOptionId('finishedGoodsList', fgInput.value);

            if (!finishedGoodId) {
                if (window.showToast) window.showToast("Please select a Finished Good from the list.", "warning");
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
                return;
            }

            const components = [];
            const componentRows = document.querySelectorAll('.component-row');
            let validationFailed = false;

            componentRows.forEach(row => {
                const itemNameInput = row.querySelector('.component-item');
                const qtyInput = row.querySelector('.component-qty');
                const datalistId = itemNameInput.getAttribute('list');

                const componentId = findOptionId(datalistId, itemNameInput.value);

                if (!componentId || !qtyInput.value) {
                    validationFailed = true;
                } else {
                    components.push({
                        component_item_id: componentId,
                        quantity: parseFloat(qtyInput.value)
                    });
                }
            });

            if (validationFailed) {
                if (window.showToast) window.showToast("Please fill in all components and their quantities correctly.", "warning");
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
                return;
            }

            if (components.length === 0) {
                if (window.showToast) window.showToast("Please add at least one component.", "warning");
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
                return;
            }

            const payload = {
                finished_good_item_id: finishedGoodId,
                components: components
            };

            try {
                const res = await fetch(`${API_URL}/api/boms/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (window.showToast) window.showToast(data.message || data.detail || "Saved", res.ok ? 'success' : 'error');

                if (res.ok) {
                    clearForm();
                    // Wait a moment for DB commit, then refresh
                    setTimeout(() => {
                        loadBOMs();
                    }, 500);
                }
            } catch (err) {
                console.error("Save error:", err);
                if (window.showToast) window.showToast("❌ Server Error: " + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
            }
        }
