const API_URL = window.location.origin;
        const supplierForm = document.getElementById('supplier-inward-form');
        const PIPE_SPECS = {
            "Emitting Pipe": ["16x2x30 Cl-2 Round", "16x2x40 Cl-2 Round", "16x2x50 Cl-2 Round", "16x2x20 Cl-2 Round", "12x2x30 Cl-2 Round", "16mm / 30cm / 2 LPH", "16mm / 40cm / 2 LPH", "Other / Custom"],
            "HDPE Pipe": ["20mm PN6", "25mm PN6", "32mm PN6", "40mm PN6", "50mm PN6", "63mm PN6", "75mm PN6", "90mm PN6", "110mm PN6", "63mm PN10", "75mm PN10", "90mm PN10", "110mm PN10", "Other / Custom"],
            "PVC Pipe": ["40mm x 4 kg/cm²", "50mm x 4 kg/cm²", "63mm x 4 kg/cm²", "75mm x 4 kg/cm²", "90mm x 4 kg/cm²", "90mm x 6 kg/cm²", "90mm x 8 kg/cm²", "90mm x 10 kg/cm²", "110mm x 4 kg/cm²", "110mm x 6 kg/cm²", "110mm x 8 kg/cm²", "110mm x 10 kg/cm²", "140mm x 6 kg/cm²", "160mm x 6 kg/cm²", "Other / Custom"],
            "Lateral Pipe": ["12mm Plain Lateral", "16mm Plain Lateral", "20mm Plain Lateral", "25mm Plain Lateral", "32mm Plain Lateral", "Other / Custom"],
            "Column Pipe": ["1 inch (32mm) Column", "1.25 inch (40mm) Column", "1.5 inch (50mm) Column", "2 inch (63mm) Column", "2.5 inch (75mm) Column", "3 inch (90mm) Column", "Other / Custom"]
        };

        let itemsPage = 1;
        const ITEMS_PER_PAGE = 50;
        let hasMoreItems = true;
        let isLoadingItems = false;

        function showItemSkeletons(count = 3) {
            const datalist = document.getElementById('item_list');
            if (datalist) {
                datalist.innerHTML = '';
                for (let i = 0; i < count; i++) {
                    datalist.innerHTML += '<option value="Loading...">';
                }
            }
        }

        function showSearchSkeletons() {
            const resultsArea = document.getElementById('search-results-area');
            if (!resultsArea) return;
            resultsArea.innerHTML = `
                <div class="row g-3">
                    ${Array.from({ length: 6 }, (_, i) => `
                        <div class="col-md-4">
                            <div class="p-3 border rounded-3 glass-card h-100">
                                <div class="placeholder-glow">
                                    <div class="placeholder col-12" style="height: 20px;"></div>
                                    <div class="placeholder col-8 mt-2" style="height: 15px;"></div>
                                    <div class="placeholder col-6 mt-2" style="height: 60px;"></div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        async function loadItems() {
            if (isLoadingItems) return;
            isLoadingItems = true;
            let url = `${API_URL}/api/items/list?limit=${ITEMS_PER_PAGE}&exclude_own=true`;
            try {
                const res = await fetch(url, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                const datalist = document.getElementById('item_list');
                datalist.innerHTML = '';
                if (data.items) data.items.forEach(item => datalist.innerHTML += `<option value="${item.item_name}">${item.item_code || ''}</option>`);
                hasMoreItems = data.items && data.items.length >= ITEMS_PER_PAGE;
            } catch (err) { console.error("Error loading items:", err); } finally {
                isLoadingItems = false;
            }
        }

        async function loadMoreItems() {
            if (!hasMoreItems || isLoadingItems) return;
            itemsPage++;
            let url = `${API_URL}/api/items/list?limit=${ITEMS_PER_PAGE}&page=${itemsPage}&exclude_own=true`;
            try {
                const res = await fetch(url, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    const datalist = document.getElementById('item_list');
                    data.items.forEach(item => datalist.innerHTML += `<option value="${item.item_name}">${item.item_code || ''}</option>`);
                    hasMoreItems = data.items.length >= ITEMS_PER_PAGE;
                } else {
                    hasMoreItems = false;
                }
            } catch (err) { console.error("Error loading more items:", err); }
        }

        async function submitSupplierInward(e) {
            e.preventDefault();
            const itemNameInput = document.getElementById('item_name').value.trim();
            if (!itemNameInput) { if (window.showToast) window.showToast("⚠️ Please enter or select an item name!", "warning"); return; }
            const saveBtn = document.getElementById('saveBtn');
            saveBtn.disabled = true;

            const numBundles = parseInt(document.getElementById('num_bundles').value) || 0;
            const itemsPerBundle = parseInt(document.getElementById('items_per_bundle').value) || 0;

            const data = {
                item_name: itemNameInput,
                total_boxes: numBundles,
                qty_per_box: itemsPerBundle,
                items_per_bundle: itemsPerBundle,
                num_bundles: numBundles,
                total_qty: parseFloat(document.getElementById('bundle_total_qty').value) || 0,
                supplier_or_party: document.getElementById('supplier_or_party').value,
                remark: document.getElementById('remark').value,
                location: document.getElementById('location').value
            };
            try {
                const res = await fetch(`${API_URL}/api/inward`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' }, body: JSON.stringify(data) });
                const result = await res.json();
                if (res.ok) {
                    displayQrCodes(result.boxes || []);
                    if (window.showToast) window.showToast(`✅ Batch #${result.batch_id} added successfully!`, "success");
                    supplierForm.reset();
                    calculateInwardBundleTotal('items');
                } else {
                    if (window.showToast) window.showToast(`❌ Error: ${result.detail || result.message || "Failed to save"}`, "error");
                }
            } catch (err) { if (window.showToast) window.showToast("❌ Connection Error", "error"); } finally { saveBtn.disabled = false; }
        }

        function calculateInwardBundleTotal(source) {
            const itemsPerBundleEl = document.getElementById('items_per_bundle');
            const numBundlesEl = document.getElementById('num_bundles');
            const totalEl = document.getElementById('bundle_total_qty');

            if (!itemsPerBundleEl || !numBundlesEl || !totalEl) return;

            const itemsPerBundle = parseFloat(itemsPerBundleEl.value) || 0;
            const numBundles = parseFloat(numBundlesEl.value) || 0;
            const total = parseFloat(totalEl.value) || 0;

            if (source === 'total') {
                if (itemsPerBundle > 0) {
                    const calculatedBundles = total / itemsPerBundle;
                    numBundlesEl.value = Math.round(calculatedBundles * 100) / 100;
                }
            } else {
                if (itemsPerBundle > 0 && numBundles > 0) {
                    totalEl.value = Math.round(itemsPerBundle * numBundles * 100) / 100;
                }
            }
        }

        document.addEventListener('DOMContentLoaded', function () {
            const itemsPerBundleEl = document.getElementById('items_per_bundle');
            const numBundlesEl = document.getElementById('num_bundles');
            const totalEl = document.getElementById('bundle_total_qty');

            if (itemsPerBundleEl) itemsPerBundleEl.addEventListener('input', () => calculateInwardBundleTotal('items'));
            if (numBundlesEl) numBundlesEl.addEventListener('input', () => calculateInwardBundleTotal('bundles'));
            if (totalEl) totalEl.addEventListener('input', () => calculateInwardBundleTotal('total'));

            calculateInwardBundleTotal('items');
        });

        function formatInwardDate(dateStr) {
            if (!dateStr) return 'N/A';
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    return `${day}/${month}/${year}`;
                }
                const parts = String(dateStr).split(' ')[0].split('T')[0].split('-');
                if (parts.length === 3) {
                    return `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
                return String(dateStr);
            } catch (e) {
                return String(dateStr);
            }
        }

        function extractSpecsFromName(itemName) {
            if (!itemName) return "STD";
            const m = itemName.match(/(\d+(?:\.\d+)?(?:mm|cm|kg|g|l|ml|w|kw|μm|um|psi|bar|pn|mpa)?)/i);
            if (m) return m[1].toUpperCase().replace(/UM$/, 'μM');
            const words = itemName.split(/\s+/);
            for (const w of words) {
                if (/^\d/.test(w) && w.length <= 6) return w.toUpperCase();
            }
            return words.length > 1 ? words[1].substring(0, 4).toUpperCase() : "STD";
        }

        function getShortSKU(itemGroup, itemId, itemName) {
            const groupMap = {
                "Filters": "FLT",
                "Solar": "SLR",
                "PVC": "PVC",
                "HDPE": "HDP",
                "Machine Parts": "MCH"
            };
            const prefix = groupMap[itemGroup] || (itemGroup || "GEN").substring(0, 3).toUpperCase();
            const id = itemId || "000";
            const specs = extractSpecsFromName(itemName);
            return `${prefix}-${id}-${specs}`;
        }

        function displayQrCodes(boxes) {
            const qrArea = document.getElementById('qr-container');
            qrArea.innerHTML = `
            <div class="card glass-card">
                <div class="card-header bg-success text-white">
                    <h5 class="m-0 fw-bold"><i class="bi bi-check-circle-fill me-2"></i> QR Codes Generated Successfully!</h5>
                </div>
                <div class="card-body">
                    <div class="row g-4">
                        ${boxes.map(box => `
                            <div class="col-md-3 col-sm-6">
                                <div class="qr-card-custom p-3 text-center h-100 d-flex flex-column justify-content-between">
                                    <div class="qr-code-wrapper p-2 bg-white rounded shadow-sm mx-auto">
                                        <div id="qr-${box.box_id}"></div>
                                    </div>
                                    <div class="mt-3">
                                        <div class="fw-bold text-dark small text-truncate" title="${getShortSKU(box.item_name ? box.item_name.split(' ')[0] : 'GEN', box.box_id.split('-').pop() || box.box_id, box.item_name)}">${getShortSKU(box.item_name ? box.item_name.split(' ')[0] : 'GEN', box.box_id.split('-').pop() || box.box_id, box.item_name)}</div>
                                        <div class="text-muted small mt-1">${box.item_name}</div>
                                        <span class="badge bg-light text-dark border mt-2">Qty: ${box.qty || box.qty_in_box || 0} Pcs</span>
                                        <small class="text-secondary d-block mt-1 fw-semibold">📅 Inward Date: ${formatInwardDate(box.inward_date || new Date())}</small>
                                    </div>
                                    <button data-box-id="${box.box_id}" data-item-name="${box.item_name.replace(/"/g, '&quot;')}" data-qty="${box.qty || box.qty_in_box || 0}" data-batch-id="${box.batch_id || ''}" data-supplier="${(box.supplier_or_party || '').replace(/"/g, '&quot;')}" data-rack="${(box.location || '').replace(/"/g, '&quot;')}" data-inward-date="${box.inward_date || new Date().toISOString()}" onclick="printSingleBoxQr('${box.box_id}', '${box.item_name.replace(/'/g, "\\'")}', '${box.qty || box.qty_in_box || 0}', '${box.inward_date || new Date().toISOString()}')" class="btn btn-sm btn-outline-primary mt-2 w-100">
                                        <i class="bi bi-printer-fill me-1"></i> Print
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;

            boxes.forEach(box => {
                new QRCode(document.getElementById(`qr-${box.box_id}`), {
                    text: getShortSKU(box.item_name ? box.item_name.split(' ')[0] : 'GEN', box.box_id.split('-').pop() || box.box_id, box.item_name),
                    width: 140,
                    height: 140,
                    correctLevel: QRCode.CorrectLevel.H
                });
            });

            setTimeout(() => {
                document.querySelectorAll('.qr-card-custom').forEach(card => {
                    if (!card.querySelector('.btn-thermal-print')) {
                        const existingBtn = card.querySelector('.btn-outline-primary');
                        if (existingBtn) {
                            const thermalBtn = document.createElement('button');
                            thermalBtn.className = 'btn btn-sm btn-outline-dark mt-2 w-100 btn-thermal-print fw-bold';
                            thermalBtn.innerHTML = '<i class="bi bi-printer-fill me-1"></i> Print Thermal Label';
                            thermalBtn.onclick = function () {
                                const src = existingBtn;
                                const boxId = src.getAttribute('data-box-id');
                                const itemName = src.getAttribute('data-item-name');
                                const qty = src.getAttribute('data-qty');
                                const batchId = src.getAttribute('data-batch-id');
                                const supplier = src.getAttribute('data-supplier');
                                const rack = src.getAttribute('data-rack');
                                const inwardDate = src.getAttribute('data-inward-date');
                                printThermalLabel(boxId, itemName, qty, batchId, supplier, rack, inwardDate, false);
                            };
                            existingBtn.parentNode.insertBefore(thermalBtn, existingBtn.nextSibling);
                        }
                    }
                });
            }, 500);
        }

        function triggerLabelPrint(data, qrCodeText) {
            document.getElementById('lbl_type').innerText = data.pipe_type;
            document.getElementById('lbl_machine').innerText = data.machine_name;
            document.getElementById('lbl_size').innerText = data.pipe_size;
            document.getElementById('lbl_operator').innerText = data.shift_operator;
            document.getElementById('lbl_length').innerText = data.coil_length_meters;
            document.getElementById('lbl_weight').innerText = data.coil_weight_kg;
            document.getElementById('lbl_qr_text').innerText = qrCodeText;

            const qrContainer = document.getElementById('qrcode-sticker');
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, {
                text: qrCodeText,
                width: 180,
                height: 180,
                correctLevel: QRCode.CorrectLevel.H
            });

            document.body.classList.add('print-sticker-75');
            document.getElementById('label-print-area').style.display = "block";

            setTimeout(() => {
                window.print();
            }, 400);
        }

        let lastSearchQ = '';
        let lastSearchItemName = '';
        let currentPage = 1;
        let totalPages = 1;
        let totalCount = 0;
        let currentPageSize = 25;
        let isSearching = false;

        function getPageSize() {
            const select = document.getElementById('pageSizeSelect');
            return select ? parseInt(select.value) || 25 : 25;
        }

        function getPageParams() {
            const pageSize = getPageSize();
            return {
                limit: pageSize === 0 ? 0 : pageSize,
                page: currentPage,
                showAll: pageSize === 0
            };
        }

        async function searchOldQrs(showSpinner = true) {
            if (isSearching) return;
            isSearching = true;

            const q = document.getElementById('search_batch_input').value.trim();
            const item_name = document.getElementById('search_item_input').value.trim();
            const fromDate = document.getElementById('filterFromDate').value;
            const toDate = document.getElementById('filterToDate').value;
            const resultsArea = document.getElementById('search-results-area');

            lastSearchQ = q;
            lastSearchItemName = item_name;

            if (showSpinner) {
                resultsArea.innerHTML = `<div class="text-center py-3"><span class="spinner-border text-primary"></span> Searching...</div>`;
            } else {
                showSearchSkeletons();
            }

            try {
                const pageParams = getPageParams();
                let url = `${API_URL}/api/search-qrs?supplier_only=true&limit=${pageParams.limit}&page=${pageParams.page}&`;
                if (q) url += `q=${encodeURIComponent(q)}&`;
                if (item_name) url += `item_name=${encodeURIComponent(item_name)}&`;
                if (fromDate) url += `from_date=${encodeURIComponent(fromDate)}&`;
                if (toDate) url += `to_date=${encodeURIComponent(toDate)}&`;

                const res = await fetch(url, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                const data = await res.json();

                if (!data.boxes || data.boxes.length === 0) {
                    resultsArea.innerHTML = `<div class="alert alert-warning text-center m-0">No QR codes or batches found matching filter.</div>`;
                    totalPages = 1;
                    totalCount = 0;
                    updatePaginationControls();
                    return;
                }

                totalCount = data.total_count || data.boxes.length;
                if (pageParams.showAll) {
                    totalPages = 1;
                    currentPage = 1;
                } else {
                    totalPages = Math.max(1, Math.ceil(totalCount / (pageParams.limit || 1)));
                }

                renderSearchResults(data.boxes);
                updatePaginationControls();
            } catch (err) {
                resultsArea.innerHTML = `<div class="alert alert-danger text-center m-0">Error searching QR codes.</div>`;
            } finally {
                isSearching = false;
            }
        }

        function changePageSize() {
            currentPage = 1;
            searchOldQrs(true);
        }

        function prevPage() {
            if (currentPage > 1 && !isSearching) {
                currentPage--;
                searchOldQrs(true);
            }
        }

        function nextPage() {
            if (currentPage < totalPages && !isSearching) {
                currentPage++;
                searchOldQrs(true);
            }
        }

        function clearDateFilters() {
            document.getElementById('filterFromDate').value = '';
            document.getElementById('filterToDate').value = '';
            searchOldQrs(true);
        }

        function updatePaginationControls() {
            const prevBtn = document.getElementById('prevPageBtn');
            const nextBtn = document.getElementById('nextPageBtn');
            const pageIndicator = document.getElementById('pageIndicator');

            if (prevBtn) prevBtn.disabled = currentPage <= 1 || isSearching;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages || isSearching;
            if (pageIndicator) {
                pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
            }
        }

        function buildSearchResultHtml(boxes) {
            const fromDate = document.getElementById('filterFromDate').value;
            const toDate = document.getElementById('filterToDate').value;

            const activeBoxes = (boxes || []).filter(box => {
                const qty = parseFloat(box.qty_in_box) || 0;
                const coilWeight = parseFloat(box.coil_weight_kg) || 0;
                const coilLength = parseFloat(box.coil_length_meters) || 0;
                const isProduction = box.box_id.startsWith('COIL-') || box.machine_name;
                if (isProduction) {
                    if (!(coilWeight > 0 || coilLength > 0)) return false;
                } else {
                    if (!(qty > 0)) return false;
                }

                const boxDateStr = box.inward_date || box.created_at;
                if (boxDateStr && (fromDate || toDate)) {
                    const boxDate = new Date(boxDateStr);
                    if (fromDate) {
                        const from = new Date(fromDate);
                        if (boxDate < from) return false;
                    }
                    if (toDate) {
                        const to = new Date(toDate);
                        to.setHours(23, 59, 59, 999);
                        if (boxDate > to) return false;
                    }
                }

                return true;
            });

            if (activeBoxes.length === 0) return '';

            return `
            <div class="row g-3 search-results-append">
                ${activeBoxes.map(box => {
                const isProduction = box.box_id.startsWith('COIL-') || box.machine_name;
                return `
                    <div class="col-md-4 qr-card-printable">
                        <div class="p-3 border rounded-3 glass-card text-center h-100 d-flex flex-column justify-content-between">
                            <div>
                                <span class="badge ${isProduction ? 'bg-primary' : 'bg-success'} mb-2">
                                    ${isProduction ? '🏭 Own Coil' : '📦 Supplier Box'}
                                </span>
                                <div id="search-qr-${box.box_id}" class="d-flex justify-content-center my-2"></div>
                                <strong class="d-block font-monospace fs-6 text-slate-800">${getShortSKU(box.item_name ? box.item_name.split(' ')[0] : 'GEN', box.box_id.split('-').pop() || box.box_id, box.item_name)}</strong>
                                <div class="fw-bold text-indigo small mt-1">${box.item_name}</div>
                                <small class="text-muted d-block mt-1">
                                    ${isProduction ? `Weight: ${box.coil_weight_kg || '-'} KG | Length: ${box.coil_length_meters || box.qty_in_box || '-'} ${box.unit || 'MTR'}` : `Qty: ${box.qty_in_box} ${box.unit || 'Pcs'} | Party: ${box.supplier_or_party || 'N/A'}`}
                                </small>
                                <small class="text-secondary d-block mt-1 fw-semibold">
                                    <i class="bi bi-calendar-event me-1"></i> Inward Date: ${formatInwardDate(box.inward_date || box.created_at)}
                                </small>
                            </div>
                            <div class="mt-3">
                                ${isProduction ? `
                                    <button onclick='reprintSticker(${JSON.stringify(box).replace(/'/g, "&apos;")})' class="btn btn-sm btn-primary w-100 fw-bold">
                                        <i class="bi bi-printer-fill me-1"></i> Print Sticker
                                    </button>
                                    <button onclick='printThermalLabel("${box.box_id}", "${(box.item_name || '').replace(/"/g, '&quot;')}", "${box.qty_in_box || 0}", "${box.batch_id || ''}", "${(box.supplier_or_party || '').replace(/"/g, '&quot;')}", "${(box.location || '').replace(/"/g, '&quot;')}", "${box.inward_date || box.created_at || ""}", false)' class="btn btn-sm btn-outline-dark w-100 fw-bold mt-1">
                                        <i class="bi bi-printer-fill me-1"></i> Print Thermal Label
                                    </button>
                                ` : ` 
                                    <button onclick='printSingleBoxQr(${JSON.stringify(box.box_id)}, ${JSON.stringify(box.item_name)}, ${JSON.stringify(box.qty_in_box)}, ${JSON.stringify(box.inward_date || box.created_at || "")})' class="btn btn-sm btn-dark w-100 fw-bold">
                                        <i class="bi bi-qr-code me-1"></i> Print QR
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                    `;
            }).join('')}
            </div>
            `;
        }

        function renderSearchResults(boxes) {
            const resultsArea = document.getElementById('search-results-area');

            const fromDate = document.getElementById('filterFromDate').value;
            const toDate = document.getElementById('filterToDate').value;

            const activeBoxes = (boxes || []).filter(box => {
                const qty = parseFloat(box.qty_in_box) || 0;
                const coilWeight = parseFloat(box.coil_weight_kg) || 0;
                const coilLength = parseFloat(box.coil_length_meters) || 0;
                const isProduction = box.box_id.startsWith('COIL-') || box.machine_name;
                if (isProduction) {
                    if (!(coilWeight > 0 || coilLength > 0)) return false;
                } else {
                    if (!(qty > 0)) return false;
                }

                const boxDateStr = box.inward_date || box.created_at;
                if (boxDateStr && (fromDate || toDate)) {
                    const boxDate = new Date(boxDateStr);
                    if (fromDate) {
                        const from = new Date(fromDate);
                        if (boxDate < from) return false;
                    }
                    if (toDate) {
                        const to = new Date(toDate);
                        to.setHours(23, 59, 59, 999);
                        if (boxDate > to) return false;
                    }
                }

                return true;
            });

            if (activeBoxes.length === 0) {
                resultsArea.innerHTML = `<div class="alert alert-info text-center m-0">
                <i class="bi bi-info-circle me-1"></i>
                No active QR codes found.
            </div>`;
                return;
            }

            resultsArea.innerHTML = buildSearchResultHtml(activeBoxes);

            updatePaginationControls();

            activeBoxes.forEach(box => {
                const container = document.getElementById(`search-qr-${box.box_id}`);
                if (container) {
                    new QRCode(container, {
                        text: getShortSKU(box.item_name ? box.item_name.split(' ')[0] : 'GEN', box.box_id.split('-').pop() || box.box_id, box.item_name),
                        width: 90,
                        height: 90
                    });
                }
            });
        }

        function reprintSticker(box) {
            const data = {
                pipe_type: box.pipe_type || box.item_name.split(' ')[0] || "Pipe",
                machine_name: box.machine_name || "Machine",
                pipe_size: box.pipe_size || box.item_name,
                shift_operator: box.shift_operator || "Operator",
                coil_length_meters: box.coil_length_meters || box.qty_in_box || 0,
                coil_weight_kg: box.coil_weight_kg || 0
            };
            triggerLabelPrint(data, getShortSKU(box.item_name ? box.item_name.split(' ')[0] : 'GEN', box.box_id.split('-').pop() || box.box_id, box.item_name));
        }

        function printSingleBoxQr(boxId, itemName, qty, inwardDate) {
            const printArea = document.getElementById('single-qr-print-area');
            if (!printArea) return;

            const formattedDate = formatInwardDate(inwardDate);

            document.getElementById('single-qr-item-name').innerText = itemName;
            document.getElementById('single-qr-qty').innerText = `Qty: ${qty}`;
            document.getElementById('single-qr-box-id').innerText = getShortSKU(itemName ? itemName.split(' ')[0] : 'GEN', boxId.split('-').pop() || boxId, itemName);
            document.getElementById('single-qr-date').innerText = `Inward Date: ${formattedDate}`;

            const qrCanvas = document.getElementById('single-qrcode-canvas');
            qrCanvas.innerHTML = '';
            new QRCode(qrCanvas, {
                text: getShortSKU(itemName ? itemName.split(' ')[0] : 'GEN', boxId.split('-').pop() || boxId, itemName),
                width: 128,
                height: 128,
                correctLevel: QRCode.CorrectLevel.H
            });

            document.body.classList.add('print-single');
            printArea.style.display = 'block';
            setTimeout(() => {
                window.print();
            }, 300);
        }

        function printThermalLabel(boxId, itemName, qty, batchId, supplier, rack, inwardDate, isLandscape) {
            const printArea = document.getElementById('thermal-label-print-area');
            if (!printArea) return;

            const formattedDate = formatInwardDate(inwardDate);

            document.getElementById('thermal-item-name').innerText = itemName || 'N/A';
            document.getElementById('thermal-box-id').innerText = boxId || 'N/A';
            document.getElementById('thermal-batch-no').innerText = batchId || 'N/A';
            document.getElementById('thermal-qty').innerText = `${qty || 0} PCS`;
            document.getElementById('thermal-supplier').innerText = supplier || 'N/A';
            document.getElementById('thermal-rack').innerText = rack || 'N/A';
            document.getElementById('thermal-date').innerText = formattedDate;

            const qrPayload = JSON.stringify({
                boxId: boxId,
                batchId: batchId,
                item: itemName,
                qty: qty,
                supplier: supplier,
                rack: rack,
                date: inwardDate
            });

            const qrContainer = document.getElementById('thermal-qrcode');
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: qrPayload,
                width: 140,
                height: 140,
                correctLevel: QRCode.CorrectLevel.H
            });

            const labelBox = printArea.querySelector('.thermal-label-box');
            let layout = 'square';
            if (typeof isLandscape === 'string') {
                layout = isLandscape;
            } else if (isLandscape === true || isLandscape === 'landscape') {
                layout = 'landscape';
            } else {
                layout = 'square';
            }

            labelBox.classList.remove('landscape', 'landscape-75');
            document.body.classList.remove('landscape-label', 'landscape-75-label');

            if (layout === 'landscape-75') {
                labelBox.classList.add('landscape-75');
                document.body.classList.add('landscape-75-label');
            } else if (layout === 'landscape' || isLandscape === true) {
                labelBox.classList.add('landscape');
                document.body.classList.add('landscape-label');
            }

            document.body.classList.add('print-thermal-label');
            printArea.style.display = 'block';
            setTimeout(() => {
                window.print();
            }, 300);
        }

        function printAllQRCodes() {
            const qrCards = document.querySelectorAll('.qr-card-printable');
            if (qrCards.length === 0) {
                if (window.showToast) window.showToast("⚠️ No QR codes found to print! Please search first.", "warning");
                return;
            }

            const grid = document.querySelector('#qr-bulk-print-area .qr-bulk-grid');
            grid.innerHTML = '';

            const cardsHTML = Array.from(qrCards).map(card => {
                const clone = card.cloneNode(true);
                clone.querySelectorAll('.btn').forEach(btn => btn.remove());
                clone.querySelectorAll('canvas').forEach(canvas => {
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL('image/png');
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    img.alt = 'QR Code';
                    canvas.parentNode.replaceChild(img, canvas);
                });
                return clone.outerHTML;
            }).join('');

            grid.innerHTML = cardsHTML;
            document.body.classList.add('print-bulk-qr');
            document.getElementById('qr-bulk-print-area').style.display = 'block';

            window.print();
        }

        window.onafterprint = () => {
            document.body.classList.remove('print-bulk', 'print-single', 'print-bulk-qr');
            document.body.classList.remove('print-sticker', 'print-sticker-75');
            document.body.classList.remove('print-thermal-label', 'landscape-label', 'landscape-75-label');
            const thermalBox = document.querySelector('#thermal-label-print-area .thermal-label-box');
            if (thermalBox) {
                thermalBox.classList.remove('landscape', 'landscape-75');
            }
            document.getElementById('label-print-area').style.display = 'none';
            document.getElementById('single-qr-print-area').style.display = 'none';
            const qrBulkArea = document.getElementById('qr-bulk-print-area');
            if (qrBulkArea) {
                qrBulkArea.style.display = 'none';
                const grid = qrBulkArea.querySelector('.qr-bulk-grid');
                if (grid) grid.innerHTML = '';
            }
            const thermalArea = document.getElementById('thermal-label-print-area');
            if (thermalArea) {
                thermalArea.style.display = 'none';
            }
        };

        if (window.ThemeManager && typeof window.ThemeManager.applyTheme === 'function') {
            window.ThemeManager.applyTheme();
        }

        document.addEventListener('DOMContentLoaded', function () {
            const searchInputs = ['search_batch_input', 'search_item_input', 'filterFromDate', 'filterToDate'];
            searchInputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('keypress', function (e) {
                        if (e.key === 'Enter') {
                            searchOldQrs(true);
                        }
                    });
                }
            });
        });

        if (window.PageLoader && typeof window.PageLoader.show === 'function') {
            window.PageLoader.show();
        }

        (async function () {
            try {
                await Promise.allSettled([
                    loadItems(),
                    searchOldQrs(true)
                ]);
            } catch (err) {
                console.error("Initial data load error:", err);
            } finally {
                if (window.PageLoader && typeof window.PageLoader.complete === 'function') {
                    window.PageLoader.complete();
                } else if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
                    window.PageLoader.hide();
                }
            }
        })();

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

            ws.onopen = function () {
                console.log("Inward/Prod WebSocket: Connected for live updates.");
            };

            ws.onmessage = function (event) {
                if (event.data === "STOCK_UPDATED") {
                    if (typeof searchOldQrs === 'function') searchOldQrs(false);
                }
            };

            ws.onclose = function () {
                setTimeout(connectWebSocket, 5000);
            };
        }
        connectWebSocket();
