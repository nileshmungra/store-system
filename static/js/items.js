let currentPage = 1;
        let limit = 50;
        let editingMachineId = null;

        document.addEventListener('DOMContentLoaded', () => {
            applyGlobalTheme();
            // Try initial load if password isn't required or already authenticated
            loadItems();
            loadMachines();
        });

        async function checkPassword() {
            const pass = document.getElementById("admin-pass").value;
            if (!pass) return;

            try {
                const res = await fetch('/api/admin/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pass })
                });
                const data = await res.json();

                if (data.valid) {
                    document.getElementById("login-box").style.display = "none";
                    document.getElementById("protected-content").style.display = "block";
                    document.getElementById("error-msg").style.display = "none";

                    // Reload Data after auth
                    await Promise.all([loadItems(1), loadMachines()]);
                    if (window.PageLoader) window.PageLoader.hide();
                } else {
                    document.getElementById("error-msg").style.display = "block";
                }
            } catch (err) {
                console.error("Password verification error:", err);
                document.getElementById("error-msg").style.display = "block";
            }
        }

        async function loadItems(page = 1) {
            currentPage = page;
            const searchInput = document.getElementById("itemSearchInput");
            const search = searchInput ? searchInput.value.trim() : "";
            const groupSelect = document.getElementById("groupFilterSelect");
            const group = groupSelect ? groupSelect.value : "";
            const ownFilterSelect = document.getElementById("ownFilterSelect");
            const ownFilter = ownFilterSelect ? ownFilterSelect.value : "";

            const tbody = document.getElementById("itemsTableBody");
            if (!tbody) return;

            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

            let url = `/api/items/list?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&group=${encodeURIComponent(group)}`;
            if (ownFilter === "only_own") url += "&only_own=true";
            if (ownFilter === "exclude_own") url += "&exclude_own=true";
            if (ownFilter === "only_outsource") url += "&only_outsource=true";
            if (ownFilter === "exclude_outsource") url += "&exclude_outsource=true";

            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error("Failed to fetch data");
                const data = await res.json();

                tbody.innerHTML = "";

                // Populate Group Dropdown
                if (data.groups && groupSelect) {
                    const currVal = groupSelect.value;
                    let opts = '<option value="">All Item Groups</option>';
                    data.groups.forEach(g => {
                        opts += `<option value="${escapeHtml(g)}" ${g === currVal ? 'selected' : ''}>${escapeHtml(g)}</option>`;
                    });
                    groupSelect.innerHTML = opts;
                }

                // Handle items response array vs object
                const itemList = Array.isArray(data) ? data : (data.items || []);
                const totalItems = data.total_items || itemList.length;

                if (itemList.length > 0) {
                    itemList.forEach(item => {
                        const isOwn = (item.is_own_production || item.item_group === 'Own Production');
                        const isOut = (item.is_outsource == 1 || item.is_outsource === true);

                        tbody.innerHTML += `
                            <tr>
                                <td><span class="badge bg-secondary">${escapeHtml(item.item_code || '-')}</span></td>
                                <td style="font-weight: 500;">${escapeHtml(item.item_name || '')}</td>
                                <td>${escapeHtml(item.item_group || '-')}</td>
                                <td>${escapeHtml(item.unit || 'PCS')}</td>
                                <td>₹${parseFloat(item.rate || 0).toFixed(2)}</td>
                                <td style="text-align: center;">
                                    <button onclick="toggleOwnProd(${item.id})" class="btn btn-sm" style="padding: 3px 8px; font-size: 0.75rem; background: ${isOwn ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)'}; color: ${isOwn ? '#10b981' : '#94a3b8'}; border: 1px solid ${isOwn ? '#10b981' : '#334155'};">
                                        ${isOwn ? '🟢 Yes (Own)' : '⚪ No'}
                                    </button>
                                </td>
                                <td style="text-align: center;">
                                    <button onclick="toggleOutsource(${item.id})" class="btn btn-sm" style="padding: 3px 8px; font-size: 0.75rem; background: ${isOut ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)'}; color: ${isOut ? '#f59e0b' : '#94a3b8'}; border: 1px solid ${isOut ? '#f59e0b' : '#334155'};">
                                        ${isOut ? '🟡 Yes (Outsource)' : '⚪ No'}
                                    </button>
                                </td>
                                <td style="text-align: center; white-space: nowrap;">
                                    <button onclick="deleteItem(${item.id})" class="btn btn-danger btn-sm" style="padding: 4px 10px; font-size: 0.75rem;">
                                        <i class="fa-solid fa-trash"></i> Delete
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                } else {
                    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No items available</td></tr>`;
                }

                // Pagination setup
                const totalPages = limit > 0 ? Math.ceil(totalItems / limit) : 1;
                document.getElementById('page-info').innerText = `Page ${currentPage} of ${totalPages || 1} (${totalItems} items)`;
                document.getElementById('prev-btn').disabled = currentPage <= 1;
                document.getElementById('next-btn').disabled = currentPage >= totalPages;

            } catch (err) {
                console.error("Error loading items:", err);
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4"><i class="fa-solid fa-triangle-exclamation me-1"></i> Failed to load items. Please refresh or verify login.</td></tr>`;
            }
        }

        function changePage(direction) {
            loadItems(currentPage + direction);
        }

        function changePageSize() {
            limit = parseInt(document.getElementById("pageSizeSelect").value, 10);
            loadItems(1);
        }

        function debounce(fn, ms) {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), ms);
            };
        }
        const debouncedSearch = debounce(() => loadItems(1), 300);

        async function saveItem(e) {
            e.preventDefault();
            const formData = new FormData();
            formData.append('item_code', document.getElementById('item_code').value);
            formData.append('item_name', document.getElementById('item_name').value);
            formData.append('item_group', document.getElementById('item_group').value);
            formData.append('hsn_code', document.getElementById('hsn_code').value);
            formData.append('unit', document.getElementById('unit').value);
            formData.append('rate', document.getElementById('rate').value || 0);
            formData.append('is_outsource', document.getElementById('is_outsource_check').checked ? 'true' : 'false');

            const fileInput = document.getElementById('image');
            if (fileInput.files[0]) formData.append('image', fileInput.files[0]);

            try {
                const res = await fetch('/api/items/add', { method: 'POST', body: formData });
                const result = await res.json();
                if (window.showToast) window.showToast(result.message || result.detail, res.ok ? 'success' : 'error');
                if (res.ok) {
                    document.getElementById('addItemForm').reset();
                    document.getElementById('imagePreview').style.display = 'none';
                    loadItems(currentPage);
                }
            } catch (err) {
                if (window.showToast) window.showToast('Error saving item', 'error');
            }
        }

        async function toggleOwnProd(itemId) {
            try {
                const res = await fetch(`/api/items/toggle-own/${itemId}`, { method: 'POST' });
                if (res.ok) {
                    loadItems(currentPage);
                    if (window.showToast) window.showToast('Own Production status updated', 'success');
                }
            } catch (err) { console.error(err); }
        }

        async function toggleOutsource(itemId) {
            try {
                const res = await fetch(`/api/items/toggle-outsourced/${itemId}`, { method: 'POST' });
                if (res.ok) {
                    loadItems(currentPage);
                    if (window.showToast) window.showToast('Outsource status updated', 'success');
                }
            } catch (err) { console.error(err); }
        }

        async function deleteItem(id) {
            if (confirm("Are you sure you want to delete this item?")) {
                try {
                    const res = await fetch(`/api/items/delete/${id}`, { method: 'DELETE' });
                    const result = await res.json();
                    if (window.showToast) window.showToast(result.message || result.detail, res.ok ? 'success' : 'error');
                    loadItems(currentPage);
                } catch (err) { console.error(err); }
            }
        }

        async function uploadExcel() {
            const fileInput = document.getElementById('excelFile');
            if (!fileInput.files[0]) {
                if (window.showToast) window.showToast("Please select an Excel file!", "warning");
                return;
            }

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            try {
                const res = await fetch('/api/items/upload-excel', { method: 'POST', body: formData });
                const result = await res.json();
                if (window.showToast) window.showToast(result.message || result.detail, res.ok ? 'success' : 'error');
                if (res.ok) loadItems(1);
            } catch (err) { console.error(err); }
        }

        async function loadMachines() {
            const tbody = document.getElementById("machinesTableBody");
            if (!tbody) return;

            try {
                const res = await fetch('/api/machines');
                const data = await res.json();
                tbody.innerHTML = "";

                const machines = data.machines || [];
                if (machines.length > 0) {
                    machines.forEach(m => {
                        tbody.innerHTML += `
                            <tr>
                                <td>#${m.id}</td>
                                <td style="font-weight: 500;">${escapeHtml(m.machine_name)}</td>
                                <td style="text-align: center;">
                                    <button onclick='editMachine(${m.id}, "${escapeHtml(m.machine_name)}")' class="btn btn-sm btn-primary" style="padding: 2px 8px; font-size: 0.75rem;">
                                        <i class="fa-solid fa-pencil"></i>
                                    </button>
                                    <button onclick="deleteMachine(${m.id})" class="btn btn-sm btn-danger" style="padding: 2px 8px; font-size: 0.75rem;">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                } else {
                    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2">No machines available</td></tr>`;
                }
            } catch (err) { console.error("Error loading machines:", err); }
        }

        async function addMachine(e) {
            e.preventDefault();
            const name = document.getElementById('new_machine_name').value.trim();
            if (!name) return;

            const formData = new FormData();
            formData.append('machine_name', name);

            try {
                const res = await fetch('/api/machines/add', { method: 'POST', body: formData });
                if (res.ok) {
                    document.getElementById('addMachineForm').reset();
                    loadMachines();
                }
            } catch (err) { console.error(err); }
        }

        function editMachine(id, name) {
            editingMachineId = id;
            document.getElementById('editMachineInput').value = name;
            new bootstrap.Modal(document.getElementById('editMachineModal')).show();
        }

        async function saveMachineEdit() {
            const newName = document.getElementById('editMachineInput').value.trim();
            if (!newName) return;

            const formData = new FormData();
            formData.append('machine_name', newName);

            try {
                const res = await fetch(`/api/machines/update/${editingMachineId}`, { method: 'PUT', body: formData });
                if (res.ok) {
                    bootstrap.Modal.getInstance(document.getElementById('editMachineModal')).hide();
                    loadMachines();
                }
            } catch (err) { console.error(err); }
        }

        async function deleteMachine(id) {
            if (confirm("Delete this machine?")) {
                try {
                    await fetch(`/api/machines/delete/${id}`, { method: 'DELETE' });
                    loadMachines();
                } catch (err) { console.error(err); }
            }
        }

        async function eraseAllData() {
            const pass = prompt("Enter admin password to erase all data:");
            if (!pass) return;

            try {
                const res = await fetch('/api/admin/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pass })
                });
                const data = await res.json();

                if (data.valid && confirm("⚠️ WARNING: All stock data will be deleted! Continue?")) {
                    const deleteRes = await fetch('/api/reset-all-data', { method: 'DELETE' });
                    const result = await deleteRes.json();
                    if (window.showToast) window.showToast(result.message, deleteRes.ok ? 'success' : 'error');
                } else if (!data.valid) {
                    if (window.showToast) window.showToast("Incorrect Password!", 'error');
                }
            } catch (err) { console.error(err); }
        }

        function downloadTemplate() {
            window.open('/api/items/download-template', '_blank');
        }

        function escapeHtml(text) {
            if (!text) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
