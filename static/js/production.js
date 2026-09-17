console.log('Production page script loaded');
        const API_URL = window.location.origin;
        console.log('API_URL:', API_URL);

        async function safeApiCall(url) {
            try {
                console.log('Calling API:', url);
                const res = await fetch(url, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                console.log('API response status:', res.status);
                const data = await res.json();
                console.log('API response data:', data);
                return data;
            } catch (err) {
                console.error('API call failed:', err);
                return null;
            }
        }

        const PIPE_SPECS = {
            "Emitting Pipe": [
                "16x2x30 Cl-2 Round",
                "16x2x40 Cl-2 Round",
                "16x2x50 Cl-2 Round",
                "16x2x20 Cl-2 Round",
                "12x2x30 Cl-2 Round",
                "16mm / 30cm / 2 LPH",
                "16mm / 40cm / 2 LPH",
                "Other / Custom"
            ],
            "HDPE Pipe": [
                "20mm PN6",
                "25mm PN6",
                "32mm PN6",
                "40mm PN6",
                "50mm PN6",
                "63mm PN6",
                "75mm PN6",
                "90mm PN6",
                "110mm PN6",
                "63mm PN10",
                "75mm PN10",
                "90mm PN10",
                "110mm PN10",
                "Other / Custom"
            ],
            "PVC Pipe": [
                "40mm x 4 kg/cm²",
                "50mm x 4 kg/cm²",
                "63mm x 4 kg/cm²",
                "75mm x 4 kg/cm²",
                "90mm x 4 kg/cm²",
                "90mm x 6 kg/cm²",
                "90mm x 8 kg/cm²",
                "90mm x 10 kg/cm²",
                "110mm x 4 kg/cm²",
                "110mm x 6 kg/cm²",
                "110mm x 8 kg/cm²",
                "110mm x 10 kg/cm²",
                "140mm x 6 kg/cm²",
                "160mm x 6 kg/cm²",
                "Other / Custom"
            ],
            "Lateral Pipe": [
                "12mm Plain Lateral",
                "16mm Plain Lateral",
                "20mm Plain Lateral",
                "25mm Plain Lateral",
                "32mm Plain Lateral",
                "Other / Custom"
            ],
            "Column Pipe": [
                "1 inch (32mm) Column",
                "1.25 inch (40mm) Column",
                "1.5 inch (50mm) Column",
                "2 inch (63mm) Column",
                "2.5 inch (75mm) Column",
                "3 inch (90mm) Column",
                "Other / Custom"
            ]
        };

        const PIPE_PRESETS = {
            "Emitting Pipe": { unit: "MTR", presets: [500, 400, 300, 100], defaultVal: 500 },
            "HDPE Pipe": { unit: "MTR", presets: [500, 100, 50], defaultVal: 100 },
            "PVC Pipe": { unit: "MTR", presets: [6, 3, 20], defaultVal: 6 },
            "Column Pipe": { unit: "PCS", presets: [8, 10, 25, 3], defaultVal: 8 },
            "Lateral Pipe": { unit: "MTR", presets: [500, 400, 250, 100], defaultVal: 400 }
        };

        function selectPreset(val) {
            const plannedInput = document.getElementById('planned_qty_input');
            if (plannedInput) plannedInput.value = val;
        }

        // ─── Block accidental Enter key submission on prodForm ──────────────
        function preventEnterSubmit(e) {
            // Only intercept Enter key
            if (e.key !== 'Enter') return;

            const tag = e.target.tagName;
            // Allow Enter inside <textarea> (if any)
            if (tag === 'TEXTAREA') return;

            e.preventDefault(); // stop form submit

            // Move focus to the next focusable element inside the form
            const form = document.getElementById('prodForm');
            const focusable = Array.from(
                form.querySelectorAll('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
            );
            const currentIdx = focusable.indexOf(document.activeElement);
            if (currentIdx !== -1 && currentIdx < focusable.length - 1) {
                focusable[currentIdx + 1].focus();
            } else if (currentIdx === focusable.length - 1) {
                // Last field — blur so user sees the Save button clearly
                document.activeElement.blur();
            }
        }

        function toggleBundleFields() {
            const packagingType = document.getElementById('packaging_type').value;
            const bundleFields = document.getElementById('bundle_fields_container');

            if (packagingType === 'bundle') {
                bundleFields.classList.remove('d-none');
                calculateProductionBundleTotal('bundles');
            } else {
                bundleFields.classList.add('d-none');
            }
        }

        function calculateProductionBundleTotal(source) {
            const itemsPerBundleEl = document.getElementById('items_per_bundle');
            const numBundlesEl = document.getElementById('num_bundles');
            const totalEl = document.getElementById('bundle_production_total');
            const unitTextEl = document.getElementById('bundle_total_unit_text');
            const bundleUnit = document.getElementById('bundle_unit');

            if (!itemsPerBundleEl || !numBundlesEl || !totalEl) return;

            const unit = bundleUnit ? bundleUnit.value : 'PCS';
            if (unitTextEl) unitTextEl.innerText = unit === 'MTR' ? 'Total Meters' : 'Total Pieces';

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

            const plannedQtyInput = document.getElementById('planned_qty_input');
            if (plannedQtyInput && totalEl.value > 0) {
                plannedQtyInput.value = totalEl.value;
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const prodDateInput = document.getElementById('production_date');
            if (prodDateInput) {
                prodDateInput.valueAsDate = new Date();
            }

            const itemsPerBundleEl = document.getElementById('items_per_bundle');
            const numBundlesEl = document.getElementById('num_bundles');
            const totalEl = document.getElementById('bundle_production_total');

            if (itemsPerBundleEl) itemsPerBundleEl.addEventListener('input', () => calculateProductionBundleTotal('items'));
            if (numBundlesEl) numBundlesEl.addEventListener('input', () => calculateProductionBundleTotal('bundles'));
            if (totalEl) totalEl.addEventListener('input', () => calculateProductionBundleTotal('total'));

            const generateBtn = document.getElementById('generateStickersBtn');
            if (generateBtn) {
                generateBtn.addEventListener('click', generatePreProductionStickers);
            }

            // Fire on initial load so the default Pipe Type ("Emitting Pipe") populates
            // the Pipe Size / Full Item Name dropdown with master items immediately.
            updatePipeSizesAndPresets();
        });

        async function updatePipeSizesAndPresets() {
            const pipeTypeElem = document.getElementById('pipe_type');
            const datalist = document.getElementById('pipe_size_datalist');
            const pipeInput = document.getElementById('pipe_size_input');
            const plannedInput = document.getElementById('planned_qty_input');
            const unitSelect = document.getElementById('bundle_unit');
            const presetContainer = document.getElementById('preset_buttons_container');
            if (!pipeTypeElem) return;

            const pipeType = pipeTypeElem.value;
            if (datalist) datalist.innerHTML = '';
            if (pipeInput) pipeInput.value = '';

            // Update Default Unit & Dynamic Presets
            const config = PIPE_PRESETS[pipeType] || { unit: "MTR", presets: [500, 100, 8, 6], defaultVal: 100 };
            if (unitSelect) unitSelect.value = config.unit;
            if (plannedInput) plannedInput.value = config.defaultVal;

            if (presetContainer) {
                presetContainer.innerHTML = '<span class="text-muted small me-1 fw-bold">Presets:</span>' + config.presets.map(p => `
                    <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 rounded-pill fw-bold" onclick="selectPreset(${p})">
                        ${p} ${config.unit}
                    </button>
                `).join(' ');
            }

            if (pipeType) {
                window._pipeTypeItems = [];
                try {
                    if (!window._allMasterItems || window._allMasterItems.length === 0) {
                        const allRes = await fetch(`${API_URL}/api/items/list?limit=1000&only_own=true`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
                        const allData = await allRes.json();
                        if (allData.items) {
                            window._allMasterItems = allData.items;
                        }
                    }
                    // Match master items whose `item_group` OR `item_name` starts with
                    // the selected Pipe Type (case-insensitive, trimmed). This handles
                    // items whose group is stored as "Pipes" / "Emitting Pipe" / etc.
                    // Fitting items (e.g. "HDPE Fitting") are excluded because their
                    // name does not start with the selected pipe type.
                    const selectedType = pipeType.toLowerCase().trim();
                    window._pipeTypeItems = (window._allMasterItems || []).filter(item => {
                        const itemGroup = (item.item_group || item.category || '').toLowerCase().trim();
                        const itemName = (item.item_name || '').toLowerCase().trim();
                        return itemGroup === selectedType ||
                               itemGroup.startsWith(selectedType + ' ') ||
                               itemName.startsWith(selectedType + ' ');
                    });
                    if (datalist) {
                        datalist.innerHTML = '';
                        window._pipeTypeItems.forEach(item => {
                            datalist.innerHTML += `<option value="${item.item_name}">`;
                        });
                    }
                    console.log('Filtered items for', pipeType, ':', window._pipeTypeItems.length);
                } catch (e) { console.error("Error fetching items for pipe specs:", e); }
            } else {
                window._pipeTypeItems = [];
                if (datalist) datalist.innerHTML = '';
            }

            // Fallback: keep the hardcoded PIPE_SPECS in the datalist so the dropdown
            // always shows the standard specs even when no master items match.
            const specs = PIPE_SPECS[pipeType] || [];
            specs.forEach(spec => {
                if (spec !== "Other / Custom" && datalist) {
                    datalist.innerHTML += `<option value="${spec}">`;
                }
            });

            filterPipeSizeSuggestions();
        }

        let _pipeSuggestIndex = -1;

        function filterPipeSizeSuggestions() {
            const pipeInput = document.getElementById('pipe_size_input');
            const container = document.getElementById('pipe_size_autocomplete');
            if (!pipeInput || !container) return;

            const typed = pipeInput.value.trim().toLowerCase();

            let suggestions = [];

            if (window._pipeTypeItems && window._pipeTypeItems.length > 0) {
                suggestions = window._pipeTypeItems.filter(item => {
                    const name = (item.item_name || '').toLowerCase();
                    return typed === '' || name.includes(typed);
                }).slice(0, 15);
            }

            _pipeSuggestIndex = -1;
            pipeInput.removeAttribute('aria-activedescendant');

            if (suggestions.length === 0) {
                container.innerHTML = '';
                container.classList.remove('show');
                return;
            }

            const list = document.createElement('div');
            list.className = 'suggestion-list';
            list.setAttribute('role', 'listbox');

            suggestions.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.setAttribute('role', 'option');
                div.setAttribute('id', `pipe-suggest-${idx}`);
                div.setAttribute('data-item-name', item.item_name);
                div.setAttribute('data-item-group', item.item_group || '');
                div.innerHTML = `<span class="item-name">${item.item_name}</span>${item.item_group ? `<span class="item-group">(${item.item_group})</span>` : ''}`;
                div.addEventListener('click', () => selectPipeSizeSuggestion(item.item_name));
                div.addEventListener('mouseenter', () => {
                    _pipeSuggestIndex = idx;
                    updateActiveSuggestion(list);
                });
                list.appendChild(div);
            });

            container.innerHTML = '';
            container.appendChild(list);
            container.classList.add('show');
        }

        function updateActiveSuggestion(list) {
            if (!list) return;
            const items = list.querySelectorAll('.suggestion-item');
            items.forEach((el, idx) => {
                el.classList.toggle('active', idx === _pipeSuggestIndex);
            });
            if (_pipeSuggestIndex >= 0 && items[_pipeSuggestIndex]) {
                const pipeInput = document.getElementById('pipe_size_input');
                if (pipeInput) pipeInput.setAttribute('aria-activedescendant', `pipe-suggest-${_pipeSuggestIndex}`);
            }
        }

        function selectPipeSizeSuggestion(value) {
            const pipeInput = document.getElementById('pipe_size_input');
            const container = document.getElementById('pipe_size_autocomplete');
            if (pipeInput) {
                pipeInput.value = value;
                pipeInput.focus();
            }
            if (container) {
                container.innerHTML = '';
                container.classList.remove('show');
            }
        }

        document.addEventListener('keydown', (e) => {
            const container = document.getElementById('pipe_size_autocomplete');
            const pipeInput = document.getElementById('pipe_size_input');
            if (!container || !container.classList.contains('show')) return;

            const list = container.querySelector('.suggestion-list');
            if (!list) return;
            const items = list.querySelectorAll('.suggestion-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                _pipeSuggestIndex = Math.min(_pipeSuggestIndex + 1, items.length - 1);
                updateActiveSuggestion(list);
                if (items[_pipeSuggestIndex]) {
                    const value = items[_pipeSuggestIndex].getAttribute('data-item-name');
                    if (pipeInput) pipeInput.value = value;
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                _pipeSuggestIndex = Math.max(_pipeSuggestIndex - 1, 0);
                updateActiveSuggestion(list);
                if (items[_pipeSuggestIndex]) {
                    const value = items[_pipeSuggestIndex].getAttribute('data-item-name');
                    if (pipeInput) pipeInput.value = value;
                }
            } else if (e.key === 'Enter') {
                if (_pipeSuggestIndex >= 0 && items[_pipeSuggestIndex]) {
                    e.preventDefault();
                    selectPipeSizeSuggestion(items[_pipeSuggestIndex].getAttribute('data-item-name'));
                }
            } else if (e.key === 'Escape') {
                container.innerHTML = '';
                container.classList.remove('show');
            }
        });

        document.addEventListener('click', (e) => {
            const container = document.getElementById('pipe_size_autocomplete');
            const pipeContainer = document.getElementById('pipe_size_container');
            if (container && container.classList.contains('show') && pipeContainer && !pipeContainer.contains(e.target)) {
                container.innerHTML = '';
                container.classList.remove('show');
            }
        });

        async function submitProduction(e) {
            e.preventDefault();

            const packagingType = document.getElementById('packaging_type').value;
            let plannedQty;
            let bundleInfo = '';

            // ── Confirm before saving ────────────────────────────────────────
            const machineName = document.getElementById('machine_name').value.trim();
            const pipeSize = document.getElementById('pipe_size_input').value.trim();
            const unit = document.getElementById('bundle_unit').value;
            const confirmMsg =
                `✅ Entry confirm karo:\n\n` +
                `🔧 Machine : ${machineName || '(not set)'}\n` +
                `📦 Pipe    : ${pipeSize || '(not set)'}\n` +
                bundleInfo +
                `📊 Qty     : ${plannedQty} ${unit}\n\n` +
                `Save karvanu chhe? (Enter key thi nahi, OK thi j save thase)`;
            if (!window.confirm(confirmMsg)) return;

            const selectedSize = document.getElementById('pipe_size_input').value.trim();
            if (!selectedSize) {
                if (window.showToast) window.showToast("⚠️ Please select or type a Pipe Size / Spec!", "warning");
                return;
            }

            if (packagingType === 'bundle') {
                const itemsPerBundle = parseFloat(document.getElementById('items_per_bundle').value) || 1;
                const numBundles = parseFloat(document.getElementById('num_bundles').value) || 1;
                plannedQty = itemsPerBundle * numBundles;
                bundleInfo = `📦 Bundle : ${numBundles} bundles × ${itemsPerBundle} items/bundle = ${plannedQty} total\n`;
            } else {
                plannedQty = parseFloat(document.getElementById('planned_qty_input').value);
                if (!plannedQty || plannedQty <= 0) {
                    if (window.showToast) window.showToast("⚠️ Please enter a valid Planned Target Quantity!", "warning");
                    return;
                }
            }

            const bundleUnit = document.getElementById('bundle_unit').value;

            const saveBtn = document.getElementById('saveBtn');
            saveBtn.disabled = true;
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving to Queue...`;

            const data = {
                production_date: document.getElementById('production_date').value,
                machine_name: document.getElementById('machine_name').value,
                pipe_type: document.getElementById('pipe_type').value,
                pipe_size: selectedSize,
                planned_qty: plannedQty,
                coil_length_meters: plannedQty,
                coil_weight_kg: parseFloat(document.getElementById('coil_weight_kg').value || 0),
                raw_material_used_kg: parseFloat(document.getElementById('raw_material_used_kg').value || 0),
                shift_operator: document.getElementById('shift_operator').value || "Operator",
                bundle_unit: bundleUnit,
                status: "PENDING_APPROVAL",
                items_per_bundle: packagingType === 'bundle' ? parseFloat(document.getElementById('items_per_bundle').value) || 1 : 1,
                num_bundles: packagingType === 'bundle' ? parseInt(document.getElementById('num_bundles').value) || 1 : 1
            };

            try {
                const res = await fetch(`${API_URL}/api/production/add`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Bypass-Tunnel-Reminder': 'true'
                    },
                    body: JSON.stringify(data)
                });

                const result = await res.json();
                if (res.ok) {
                    if (result.is_approved && result.qr_code) {
                        triggerLabelPrint(data, result.qr_code);
                        if (window.showToast) window.showToast("✅ Production approved and added to Store Inventory!", "success");
                    } else {
                        if (window.showToast) window.showToast("✅ " + (result.message || "Production entry logged in Pending Approval Queue!"), "success");
                    }
                    document.getElementById('prodForm').reset();
                    updatePipeSizesAndPresets();
                    refreshAllProductionData();
                } else {
                    if (window.showToast) window.showToast("❌ Error: " + (result.detail || "Could not save production entry."), "error");
                }
            } catch (err) {
                console.error("Production save error:", err);
                if (window.showToast) window.showToast("❌ Network/Server Error: " + (err.message || "Unable to connect to server."), "error");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }

        function triggerLabelPrint(data, qrCodeText) {
            const plannedBundles = parseInt(data.planned_bundles || 1);
            const itemsPerBundle = parseFloat(data.items_per_bundle || 1);
            const pipeType = data.pipe_type || '';
            const pipeSize = data.pipe_size || '';
            const machineName = data.machine_name || '';
            const bundleUnit = data.bundle_unit || 'MTR';
            const shiftOperator = data.shift_operator || 'Operator';
            const actualQty = data.actual_qty || data.coil_length_meters || data.planned_qty || 0;

            const now = new Date();
            const dateStr = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const stickers = [];
            if (plannedBundles > 1) {
                for (let i = 1; i <= plannedBundles; i++) {
                    stickers.push({
                        qrCodeText: `${qrCodeText}-B${i}-OF-${plannedBundles}`,
                        machineName: machineName,
                        pipeType: pipeType,
                        pipeSize: pipeSize,
                        bundleQty: itemsPerBundle,
                        bundleUnit: bundleUnit,
                        packageType: `Bundle ${i} of ${plannedBundles}`,
                        shiftOperator: shiftOperator,
                        dateTime: dateStr,
                        qrLabel: `BUNDLE ${i} OF ${plannedBundles} | QR:`
                    });
                }
            } else {
                stickers.push({
                    qrCodeText: qrCodeText,
                    machineName: machineName,
                    pipeType: pipeType,
                    pipeSize: pipeSize,
                    bundleQty: actualQty,
                    bundleUnit: bundleUnit,
                    packageType: `1 ${bundleUnit === 'PCS' ? 'Bundle' : 'Coil'}`,
                    shiftOperator: shiftOperator,
                    dateTime: dateStr,
                    qrLabel: 'COIL SERIAL / QR NO:'
                });
            }

            printProductionStickers(stickers, "Approved Production Sticker");
        }

        function printThermalLabel(boxId, itemName, qty, batchId, supplier, rack, inwardDate, isLandscape) {
            const printArea = document.getElementById('thermal-label-print-area');
            if (!printArea) return;

            const formattedDate = inwardDate ? new Date(inwardDate).toLocaleDateString('en-IN') + ' ' + new Date(inwardDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

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

            document.body.classList.add('print-thermal-label');
            printArea.style.display = 'block';
            setTimeout(() => {
                window.print();
            }, 300);
        }

        // 🖨️ Production-Ready 100x150 MM (4x6 Inch) TSC Label Print Engine for BOTH Approved & Pre-Production
        function printProductionStickers(stickers, docTitle) {
            if (!stickers || stickers.length === 0) {
                if (window.showToast) window.showToast("⚠️ No stickers to print!", "warning");
                return;
            }

            const title = docTitle || "Production Label Sticker";
            const printWindow = window.open('', '_blank', 'width=900,height=750');
            if (!printWindow) {
                if (window.showToast) window.showToast("⚠️ Please allow popups for this site to print stickers!", "warning");
                return;
            }

            let stickersHtml = '';
            stickers.forEach((s, idx) => {
                stickersHtml += `
                    <div class="sticker-box">
                        <div class="sticker-header">
                            <div class="company-title">BHUMI POLYMERS</div>
                            <div class="company-sub">QUALITY EXTRUSION PIPING SYSTEM</div>
                        </div>

                        <div class="sticker-details">
                            <div class="detail-row">
                                <span class="detail-label">Machine No:</span>
                                <span class="detail-value">${s.machineName || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Pipe Type:</span>
                                <span class="detail-value">${s.pipeType || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Pipe Size / Spec:</span>
                                <span class="detail-value">${s.pipeSize || 'N/A'}</span>
                            </div>

                            <div class="detail-grid-2">
                                <div class="detail-box">
                                    <span class="box-label">Bundle Size / Qty</span>
                                    <span class="box-value">${s.bundleQty} ${s.bundleUnit}</span>
                                </div>
                                <div class="detail-box">
                                    <span class="box-label">Package Type</span>
                                    <span class="box-value">${s.packageType}</span>
                                </div>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Operator:</span>
                                <span class="detail-value">${s.shiftOperator || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Date & Time:</span>
                                <span class="detail-value">${s.dateTime || ''}</span>
                            </div>
                        </div>

                        <div class="sticker-footer">
                            <div class="qr-info">
                                <span class="qr-label">${s.qrLabel || 'SCAN QR CODE:'}</span>
                                <span class="qr-code-text">${s.qrCodeText || ''}</span>
                            </div>
                            <div class="qr-container" id="print-qr-${idx}"></div>
                        </div>
                    </div>
                `;
            });

            const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800;900&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        @page {
            size: 100mm 150mm;
            margin: 0;
        }

        html, body {
            width: 100mm;
            background: #ffffff;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #000000;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .sticker-box {
            width: 94mm;
            height: 144mm;
            border: 3px solid #000000;
            padding: 3.5mm;
            margin: 3mm auto;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
        }

        .sticker-box:last-child {
            page-break-after: avoid;
            break-after: avoid;
        }

        .sticker-header {
            text-align: center;
            border-bottom: 3px solid #000000;
            padding-bottom: 2mm;
        }

        .company-title {
            font-size: 20pt;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #000000;
            line-height: 1.1;
            margin: 0;
        }

        .company-sub {
            font-size: 8.5pt;
            font-weight: 700;
            color: #333333;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            margin-top: 1.5mm;
        }

        .sticker-details {
            display: flex;
            flex-direction: column;
            justify-content: space-around;
            flex-grow: 1;
            margin: 2mm 0;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px dashed #888888;
            padding-bottom: 1.5mm;
            margin-bottom: 1mm;
        }

        .detail-label {
            font-weight: 700;
            color: #222222;
            text-transform: uppercase;
            flex-shrink: 0;
            margin-right: 8px;
            font-size: 10pt;
        }

        .detail-value {
            font-weight: 800;
            color: #000000;
            text-align: right;
            font-size: 11pt;
            word-break: break-word;
        }

        .detail-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            margin: 2mm 0;
        }

        .detail-box {
            border: 2px solid #000000;
            border-radius: 6px;
            padding: 2mm 1mm;
            text-align: center;
            background: #f8fafc;
        }

        .box-label {
            display: block;
            font-size: 8.5pt;
            font-weight: 800;
            color: #333333;
            text-transform: uppercase;
            margin-bottom: 1mm;
        }

        .box-value {
            display: block;
            font-size: 15pt;
            font-weight: 900;
            color: #000000;
            line-height: 1.1;
        }

        .sticker-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 3px solid #000000;
            padding-top: 2mm;
            margin-top: auto;
            height: 36mm;
            box-sizing: border-box;
        }

        .qr-info {
            display: flex;
            flex-direction: column;
            justify-content: center;
            max-width: 56mm;
            overflow: hidden;
        }

        .qr-label {
            font-size: 8pt;
            font-weight: 800;
            color: #333333;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 1.5mm;
        }

        .qr-code-text {
            font-size: 10.5pt;
            font-weight: 900;
            color: #000000;
            letter-spacing: 0.5px;
            font-family: 'Courier New', Courier, monospace;
            word-break: break-all;
            line-height: 1.2;
        }

        .qr-container {
            width: 32mm;
            height: 32mm;
            box-sizing: border-box;
            flex: 0 0 32mm;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1mm;
            background: #ffffff;
        }

        .qr-container canvas,
        .qr-container img {
            display: block !important;
            width: 30mm !important;
            height: 30mm !important;
        }

        @media print {
            body {
                background: transparent;
            }
        }
    </style>
</head>
<body>
    ${stickersHtml}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>
        const stickersData = ${JSON.stringify(stickers)};
        window.onload = function() {
            stickersData.forEach((s, idx) => {
                const el = document.getElementById('print-qr-' + idx);
                if (el) {
                    new QRCode(el, {
                        text: s.qrCodeText || '',
                        width: 140,
                        height: 140,
                        correctLevel: QRCode.CorrectLevel.H
                    });
                }
            });
            setTimeout(function() {
                window.print();
            }, 600);
        };
    </script>
</body>
</html>`;

            printWindow.document.open();
            printWindow.document.write(fullHtml);
            printWindow.document.close();
        }

        function printAllApprovalStickers(data, mainQrCode) {
            triggerLabelPrint(data, mainQrCode);
        }

        function generatePreProductionStickers() {
            const packagingType = document.getElementById('packaging_type').value;
            if (packagingType !== 'bundle') {
                if (window.showToast) window.showToast("⚠️ Please select 'Bundle / Pack of Items' packaging type first!", "warning");
                return;
            }

            const itemsPerBundle = parseFloat(document.getElementById('items_per_bundle').value) || 1;
            const numBundles = parseFloat(document.getElementById('num_bundles').value) || 1;
            const pipeType = document.getElementById('pipe_type').value;
            const pipeSize = document.getElementById('pipe_size_input').value.trim();
            const machineName = document.getElementById('machine_name').value.trim();
            const bundleUnit = document.getElementById('bundle_unit').value;
            const shiftOperator = document.getElementById('shift_operator').value || 'Operator';

            if (!pipeSize) {
                if (window.showToast) window.showToast("⚠️ Please enter Pipe Size / Spec first!", "warning");
                return;
            }

            if (numBundles <= 0 || itemsPerBundle <= 0) {
                if (window.showToast) window.showToast("⚠️ Please enter valid bundle configuration!", "warning");
                return;
            }

            const now = new Date();
            const dateStr = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const timestamp = now.getTime();

            window.preProductionStickersData = [];
            for (let i = 1; i <= numBundles; i++) {
                window.preProductionStickersData.push({
                    qrCodeText: `PLAN-${timestamp}-B${i}-OF-${numBundles}`,
                    machineName: machineName || '(not set)',
                    pipeType: pipeType,
                    pipeSize: pipeSize,
                    bundleQty: itemsPerBundle,
                    bundleUnit: bundleUnit,
                    packageType: `Bundle ${i} of ${numBundles}`,
                    shiftOperator: shiftOperator,
                    dateTime: dateStr,
                    qrLabel: `BUNDLE ${i} OF ${numBundles} | QR:`
                });
            }

            const container = document.getElementById('pre-production-stickers-container');
            container.innerHTML = '';

            const header = document.createElement('div');
            header.className = 'card glass-card mb-3';
            header.innerHTML = `
                <div class="card-header bg-warning text-dark py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h5 class="m-0 fw-bold"><i class="bi bi-printer-fill me-2"></i> Pre-Production Bundle Stickers (${numBundles} Stickers - Same 100x150 MM Size)</h5>
                    <div class="d-flex gap-2">
                        <button onclick="printAllPreProductionStickers()" class="btn btn-dark fw-bold">
                            <i class="bi bi-printer me-1"></i> Print All (${numBundles} Stickers)
                        </button>
                        <button onclick="document.getElementById('pre-production-stickers-container').innerHTML=''" class="btn btn-outline-danger fw-bold">
                            <i class="bi bi-x-lg me-1"></i> Clear
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(header);

            const row = document.createElement('div');
            row.className = 'row g-3';

            window.preProductionStickersData.forEach((s, idx) => {
                const bundleNumber = idx + 1;
                const col = document.createElement('div');
                col.className = 'col-md-4 col-sm-6';
                col.innerHTML = `
                    <div class="card glass-card p-3 border-warning sticker-preview" data-bundle="${bundleNumber}">
                        <div class="sticker-box">
                            <div class="sticker-header">
                                <div class="company-title">BHUMI POLYMERS</div>
                                <div class="company-sub">QUALITY EXTRUSION PIPING SYSTEM</div>
                            </div>
                            <div class="sticker-details">
                                <div class="detail-row">
                                    <span class="detail-label">Machine No:</span>
                                    <span class="detail-value">${s.machineName}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Pipe Type:</span>
                                    <span class="detail-value">${s.pipeType}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Pipe Size / Spec:</span>
                                    <span class="detail-value">${s.pipeSize}</span>
                                </div>
                                <div class="detail-grid-2">
                                    <div class="detail-box">
                                        <span class="box-label">Bundle Size / Qty</span>
                                        <span class="box-value">${s.bundleQty} ${s.bundleUnit}</span>
                                    </div>
                                    <div class="detail-box">
                                        <span class="box-label">Package Type</span>
                                        <span class="box-value">${s.packageType}</span>
                                    </div>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Operator:</span>
                                    <span class="detail-value">${s.shiftOperator}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Date & Time:</span>
                                    <span class="detail-value">${s.dateTime}</span>
                                </div>
                            </div>
                            <div class="sticker-footer">
                                <div class="qr-info">
                                    <span class="qr-label">${s.qrLabel}</span>
                                    <span class="qr-code-text">${s.qrCodeText}</span>
                                </div>
                                <div class="qr-container" id="qr-preview-${idx}"></div>
                            </div>
                        </div>
                        <div class="mt-2 text-center">
                            <button onclick="printSinglePreProductionSticker(${idx})" class="btn btn-sm btn-outline-primary fw-bold w-100">
                                <i class="bi bi-printer-fill me-1"></i> Print Sticker ${bundleNumber}
                            </button>
                        </div>
                    </div>
                `;
                row.appendChild(col);
            });

            container.appendChild(row);

            setTimeout(() => {
                window.preProductionStickersData.forEach((s, idx) => {
                    const el = document.getElementById(`qr-preview-${idx}`);
                    if (el) {
                        el.innerHTML = '';
                        new QRCode(el, {
                            text: s.qrCodeText,
                            width: 100,
                            height: 100,
                            correctLevel: QRCode.CorrectLevel.H
                        });
                    }
                });
            }, 100);

            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function printSinglePreProductionSticker(index) {
            if (!window.preProductionStickersData || !window.preProductionStickersData[index]) return;
            printProductionStickers([window.preProductionStickersData[index]], `Pre-Production Bundle Sticker ${index + 1}`);
        }

        function printAllPreProductionStickers() {
            if (!window.preProductionStickersData || window.preProductionStickersData.length === 0) return;
            printProductionStickers(window.preProductionStickersData, "Pre-Production Bundle Stickers");
        }

        window.addEventListener('afterprint', () => {
            document.getElementById('label-print-area').style.display = 'none';
        });

        // 🔄 Refresh All Dashboard Data
        function refreshAllProductionData() {
            loadPlanVsActualSummary();
            loadPendingProduction();
            loadProductionLogs();
        }

        // 📊 Load Plan vs Actual KPIs
        async function loadPlanVsActualSummary() {
            try {
                const res = await fetch(`${API_URL}/api/production/plan-vs-actual-summary?_t=${Date.now()}`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true', 'Cache-Control': 'no-cache' }
                });
                const data = await res.json();
                if (data.summary) {
                    const s = data.summary;
                    const plannedEl = document.getElementById('kpi_planned');
                    const actualEl = document.getElementById('kpi_actual');
                    const pendingEl = document.getElementById('kpi_pending');
                    const badgeEl = document.getElementById('pendingBadge');
                    const achEl = document.getElementById('kpi_achievement');

                    if (plannedEl) plannedEl.innerText = Number(s.total_planned_qty || 0).toLocaleString();
                    if (actualEl) actualEl.innerText = Number(s.total_actual_qty || 0).toLocaleString();
                    if (pendingEl) pendingEl.innerText = Number(s.pending_count || 0).toLocaleString();
                    if (badgeEl) badgeEl.innerText = Number(s.pending_count || 0).toString();
                    if (achEl) achEl.innerText = (s.achievement_rate !== undefined ? s.achievement_rate : 100) + '%';
                }
            } catch (err) {
                console.error("Error loading summary KPIs:", err);
            }
        }

        // ⏳ Load Pending Production Queue (Plan vs Actual)
        async function loadPendingProduction() {
            try {
                const res = await fetch(`${API_URL}/api/production/pending?_t=${Date.now()}`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true', 'Cache-Control': 'no-cache' }
                });
                const data = await res.json();
                const tbody = document.getElementById('pendingApprovalTable');

                if (!data.pending || data.pending.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="10" class="text-muted py-4"><i class="bi bi-check-circle-fill text-success me-2"></i> No pending approvals. All production entries are up to date!</td></tr>`;
                    document.getElementById('pendingBadge').innerText = '0';
                    return;
                }

                document.getElementById('pendingBadge').innerText = data.pending.length;

                tbody.innerHTML = data.pending.map(item => {
                    const planned = parseFloat(item.planned_qty || item.coil_length_meters || 0);
                    const actual = parseFloat(item.actual_qty || planned);
                    const diff = actual - planned;
                    const diffBadge = diff === 0 ? `<span class="badge bg-secondary">0 Exact</span>` :
                        diff > 0 ? `<span class="badge bg-success">+${diff}</span>` :
                            `<span class="badge bg-danger">${diff}</span>`;
                    const unit = item.bundle_unit || 'MTR';

                    return `
                        <tr>
                            <td><span class="badge bg-secondary font-monospace">#${item.id}</span></td>
                            <td><span class="text-dark fw-bold">${item.machine_name}</span></td>
                            <td><small class="text-dark fw-bold">${new Date(item.production_date || item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</small></td>
                            <td><span class="fw-semibold">${item.pipe_type}</span><br><small class="text-muted">${item.pipe_size}</small></td>
                            <td><span class="badge bg-primary fs-6">${planned} ${unit}</span></td>
                            <td style="max-width: 140px;">
                                <div class="input-group input-group-sm">
                                    <input type="number" step="any" class="form-control fw-bold text-success text-center" id="actual_inline_${item.id}" value="${actual}">
                                    <span class="input-group-text bg-light text-dark">${unit}</span>
                                </div>
                            </td>
                            <td>${diffBadge}</td>
                            <td><small class="text-muted">${item.shift_operator || 'N/A'}</small></td>
                            <td><small class="text-muted">${new Date(item.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</small></td>
                            <td>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-success fw-bold px-3" onclick="approvePendingProduction(${item.id})">
                                        <i class="bi bi-check-lg me-1"></i> Approve & Store
                                    </button>
                                    <button class="btn btn-outline-danger" title="Delete / Reject Entry" onclick="deleteProductionEntry(${item.id})">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (err) {
                console.error("Error loading pending production:", err);
                const tbody = document.getElementById('pendingApprovalTable');
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="10" class="text-muted py-4"><i class="bi bi-exclamation-triangle text-warning me-2"></i> Unable to load pending queue. Check server connection.</td></tr>`;
                }
            }
        }

        // ✅ Approve Pending Production Entry
        async function approvePendingProduction(logId) {
            const actualInput = document.getElementById(`actual_inline_${logId}`);
            const finalActualQty = actualInput ? parseFloat(actualInput.value) : null;

            if (!confirm(`Are you sure you want to approve Production Entry #${logId} (Actual: ${finalActualQty}) and add it into Store Inventory?`)) {
                return;
            }

            try {
                const res = await fetch(`${API_URL}/api/production/approve/${logId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Bypass-Tunnel-Reminder': 'true'
                    },
                    body: JSON.stringify({
                        actual_qty: finalActualQty,
                        approved_by: "Production Incharge"
                    })
                });

                const result = await res.json();
                if (res.ok) {
                    if (window.showToast) window.showToast("✅ " + result.message, "success");
                    if (result.qr_code && result.log) {
                        triggerLabelPrint(result.log, result.qr_code);
                    }
                    refreshAllProductionData();
                } else {
                    if (window.showToast) window.showToast("❌ Error: " + (result.detail || "Approval failed."), "error");
                }
            } catch (err) {
                console.error("Approval error:", err);
                if (window.showToast) window.showToast("❌ Server Error: Unable to approve production.", "error");
            }
        }

        // 🗑️ Delete Production Entry (Instant Refresh & Anti-Cache)
        async function deleteProductionEntry(logId) {
            if (!confirm(`Are you sure you want to permanently delete Production Entry #${logId}?`)) return;

            try {
                const res = await fetch(`${API_URL}/api/production/delete/${logId}`, {
                    method: 'DELETE',
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                });
                const result = await res.json();
                if (res.ok) {
                    if (window.showToast) window.showToast("✅ " + (result.message || "Entry deleted successfully."), "success");
                    refreshAllProductionData();
                } else {
                    if (window.showToast) window.showToast("❌ " + (result.detail || "Error deleting production entry."), "error");
                    refreshAllProductionData();
                }
            } catch (err) {
                if (window.showToast) window.showToast("❌ Error deleting production entry.", "error");
            }
        }

        // 📦 Load Approved Production History
        async function loadProductionLogs() {
            try {
                const res = await fetch(`${API_URL}/api/production/logs?status=APPROVED&_t=${Date.now()}`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true', 'Cache-Control': 'no-cache' }
                });
                const data = await res.json();
                const tbody = document.getElementById('prodHistoryTable');

                if (!data.logs || data.logs.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="9" class="text-muted py-4"><i class="bi bi-info-circle me-1"></i> No approved production entries found yet.</td></tr>`;
                    return;
                }

                tbody.innerHTML = data.logs.map(log => `
                    <tr>
                        <td><span class="badge font-monospace">${log.qr_code || 'N/A'}</span></td>
                        <td><small class="text-muted fw-bold">${new Date(log.production_date || log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</small></td>
                        <td><span class="fw-bold">${log.machine_name}</span></td>
                        <td>${log.pipe_type} (${log.pipe_size})</td>
                        <td><small class="text-muted">${log.planned_qty || log.coil_length_meters || '-'} ${log.bundle_unit || 'MTR'}</small></td>
                        <td><span class="badge bg-success fs-6">${log.actual_qty || log.coil_length_meters || 0} ${log.bundle_unit || 'MTR'}</span></td>
                        <td><small class="text-muted">${log.shift_operator || 'N/A'}</small></td>
                        <td><small class="text-muted">${log.approved_at ? new Date(log.approved_at).toLocaleString() : new Date(log.created_at).toLocaleString()}</small></td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button onclick='reprintLogLabel(${JSON.stringify(log)})' class="btn btn-outline-primary fw-bold" title="Print TSC Label">
                                    <i class="bi bi-printer-fill me-1 text-muted"></i> Print
                                </button>
                                
                                <button onclick="deleteProductionEntry(${log.id})" class="btn btn-outline-danger" title="Delete Entry">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } catch (err) {
                console.error("Error loading production logs:", err);
                const tbody = document.getElementById('prodHistoryTable');
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="9" class="text-muted py-4"><i class="bi bi-exclamation-triangle text-warning me-2"></i> Unable to load approved history. Check server connection.</td></tr>`;
                }
            }
        }

        function reprintLogLabel(log) {
            triggerLabelPrint({
                pipe_type: log.pipe_type,
                machine_name: log.machine_name,
                pipe_size: log.pipe_size,
                shift_operator: log.shift_operator,
                actual_qty: log.actual_qty || log.coil_length_meters,
                bundle_unit: log.bundle_unit || 'MTR'
            }, log.qr_code);
        }

        // Initialize on load
        (async function () {
            await loadMachineSelect();
            await refreshAllProductionData();

            if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
                window.PageLoader.hide();
            }
        })();

        // Populate only the production form's "Select Machine" dropdown.
        // The Machine Master Management table / modal / count badge have been removed.
        async function loadMachineSelect() {
            let machines = [];
            try {
                const cached = localStorage.getItem('machines_list');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        machines = parsed;
                    }
                }
            } catch (e) {
                console.warn('loadMachineSelect: localStorage parse error', e);
            }

            if (machines.length === 0) {
                const data = await safeApiCall(`${API_URL}/api/machines/list`);
                if (data && Array.isArray(data.machines)) {
                    machines = data.machines;
                    localStorage.setItem('machines_list', JSON.stringify(machines));
                }
            }

            const select = document.getElementById('machine_name');
            if (select) {
                select.innerHTML = '<option value="" selected disabled>Select Machine *</option>';
                machines.forEach(m => {
                    select.innerHTML += `<option value="${m.machine_name}">${m.machine_name}</option>`;
                });
            }
        }

        // Explicitly attach inline event handlers to window
        window.preventEnterSubmit = preventEnterSubmit;
        window.updatePipeSizesAndPresets = updatePipeSizesAndPresets;
        window.filterPipeSizeSuggestions = filterPipeSizeSuggestions;
        window.selectPreset = selectPreset;
        window.toggleBundleFields = toggleBundleFields;
        window.submitProduction = submitProduction;
        window.generatePreProductionStickers = generatePreProductionStickers;
        window.printSinglePreProductionSticker = printSinglePreProductionSticker;
        window.printAllPreProductionStickers = printAllPreProductionStickers;
        window.triggerLabelPrint = triggerLabelPrint;
        window.triggerLabelPrintMulti = triggerLabelPrint;
        window.printProductionStickers = printProductionStickers;
        window.reprintLogLabel = reprintLogLabel;
        window.approvePendingProduction = approvePendingProduction;
        window.approveProductionRecord = approvePendingProduction;
        window.deleteProductionEntry = deleteProductionEntry;
        window.refreshAllProductionData = refreshAllProductionData;



