const API_URL = window.location.origin;
let legacyCurrentPage = 1;
let legacyTotalRecords = 0;
let legacyCurrentRecord = null;
let legacyScanner = null;
let legacyIsScanning = false;

document.addEventListener('DOMContentLoaded', async function () {
    if (window.PageLoader && typeof window.PageLoader.hide === 'function') {
        window.PageLoader.hide();
    }
    loadLegacyRecords();
});

async function importLegacyQR() {
    const boxId = document.getElementById('legacyBoxId').value.trim();
    const itemName = document.getElementById('legacyItemName').value.trim();
    const qty = parseInt(document.getElementById('legacyQty').value) || 0;
    const batchId = document.getElementById('legacyBatchId').value.trim() || null;
    const supplier = document.getElementById('legacySupplier').value.trim() || null;
    const rack = document.getElementById('legacyRack').value.trim() || null;
    const inwardDate = document.getElementById('legacyInwardDate').value || null;
    const notes = document.getElementById('legacyNotes').value.trim() || null;
    const originalDataStr = document.getElementById('legacyOriginalData').value.trim();

    if (!boxId) {
        if (window.showToast) window.showToast("⚠️ Box ID is required!", "warning");
        return;
    }
    if (!itemName) {
        if (window.showToast) window.showToast("⚠️ Item Name is required!", "warning");
        return;
    }

    let originalData = null;
    if (originalDataStr) {
        try {
            originalData = JSON.parse(originalDataStr);
        } catch (e) {
            if (window.showToast) window.showToast("⚠️ Invalid JSON in Original QR Data field!", "warning");
            return;
        }
    }

    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `<div class="text-center py-2"><span class="spinner-border spinner-border-sm text-primary"></span> Importing...</div>`;

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                box_id: boxId,
                item_name: itemName,
                qty_in_box: qty,
                batch_id: batchId,
                supplier_or_party: supplier,
                rack_location: rack,
                inward_date: inwardDate,
                notes: notes,
                original_data: originalData
            })
        });

        const data = await res.json();

        if (res.ok) {
            resultDiv.innerHTML = `<div class="alert alert-success m-0"><i class="bi bi-check-circle-fill me-1"></i> ${data.message}</div>`;
            if (window.showToast) window.showToast(data.message, "success");
            clearImportForm();
            loadLegacyRecords();
        } else {
            resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ ${data.detail || data.message || 'Import failed!'}</div>`;
            if (window.showToast) window.showToast(data.detail || 'Import failed!', "error");
        }
    } catch (e) {
        resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ Unable to connect to server.</div>`;
    }
}

function clearImportForm() {
    document.getElementById('legacyBoxId').value = '';
    document.getElementById('legacyItemName').value = '';
    document.getElementById('legacyQty').value = '0';
    document.getElementById('legacyBatchId').value = '';
    document.getElementById('legacySupplier').value = '';
    document.getElementById('legacyRack').value = '';
    document.getElementById('legacyInwardDate').value = '';
    document.getElementById('legacyNotes').value = '';
    document.getElementById('legacyOriginalData').value = '';
}

async function loadLegacyRecords() {
    const search = document.getElementById('legacySearch')?.value || '';
    const resultDiv = document.getElementById('result');

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/list?search=${encodeURIComponent(search)}&page=${legacyCurrentPage}&limit=20`);
        const data = await res.json();

        if (res.ok && data.records) {
            legacyTotalRecords = data.total || 0;
            renderLegacyTable(data.records);
            updateLegacyPagination();
        } else {
            if (resultDiv) {
                resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ Failed to load records.</div>`;
            }
        }
    } catch (e) {
        if (resultDiv) {
            resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ Unable to connect to server.</div>`;
        }
    }
}

function renderLegacyTable(records) {
    const tbody = document.getElementById('legacyTableBody');
    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted p-4">No records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(r => {
        const statusBadge = r.status === 'ARCHIVED'
            ? '<span class="badge bg-secondary">' + (r.status || 'ARCHIVED') + '</span>'
            : r.status === 'ACTIVE'
                ? '<span class="badge bg-success">' + (r.status || 'ACTIVE') + '</span>'
                : '<span class="badge bg-warning text-dark">' + (r.status || 'ARCHIVED') + '</span>';

        return `
            <tr onclick="viewLegacyRecord('${r.box_id}')" style="cursor:pointer;">
                <td class="fw-bold font-monospace">${r.box_id}</td>
                <td>${r.item_name || '-'}</td>
                <td>${r.qty_in_box || 0}</td>
                <td>${r.batch_id || '-'}</td>
                <td>${r.supplier_or_party || '-'}</td>
                <td>${statusBadge}</td>
                <td class="small text-muted">${r.imported_at ? new Date(r.imported_at).toLocaleDateString('en-IN') : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary btn-sm" onclick="event.stopPropagation(); viewLegacyRecord('${r.box_id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-info btn-sm" onclick="event.stopPropagation(); editLegacyRecordDirect('${r.box_id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning btn-sm" onclick="event.stopPropagation(); generateLegacyQR('${r.box_id}')">
                        <i class="bi bi-qr-code"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-sm" onclick="event.stopPropagation(); confirmDeleteLegacyDirect('${r.box_id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateLegacyPagination() {
    const totalPages = Math.ceil(legacyTotalRecords / 20);
    document.getElementById('legacyPrevBtn').disabled = legacyCurrentPage <= 1;
    document.getElementById('legacyNextBtn').disabled = legacyCurrentPage >= totalPages;
    document.getElementById('legacyTotalInfo').textContent = `Showing ${(legacyCurrentPage - 1) * 20 + 1}-${Math.min(legacyCurrentPage * 20, legacyTotalRecords)} of ${legacyTotalRecords} records`;
}

function legacyPage(direction) {
    legacyCurrentPage += direction;
    loadLegacyRecords();
}

async function viewLegacyRecord(boxId) {
    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/${boxId}`);
        const data = await res.json();

        if (res.ok && data.record) {
            legacyCurrentRecord = data.record;
            const r = data.record;
            const content = document.getElementById('legacyDetailContent');
            content.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Box ID</label>
                            <div class="fw-bold fs-5 font-monospace">${r.box_id}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Item Name</label>
                            <div class="fw-bold fs-5">${r.item_name || '-'}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Qty in Box</label>
                            <div class="fw-bold fs-5">${r.qty_in_box || 0}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Batch ID</label>
                            <div class="fw-bold fs-5">${r.batch_id || '-'}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Status</label>
                            <div class="fw-bold fs-5">${r.status || 'ARCHIVED'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Supplier / Party</label>
                            <div class="fw-bold">${r.supplier_or_party || '-'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Rack Location</label>
                            <div class="fw-bold">${r.rack_location || '-'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Inward Date</label>
                            <div class="fw-bold">${r.inward_date ? new Date(r.inward_date).toLocaleString('en-IN') : '-'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Imported At</label>
                            <div class="fw-bold">${r.imported_at ? new Date(r.imported_at).toLocaleString('en-IN') : '-'}</div>
                        </div>
                    </div>
                    ${r.notes ? `<div class="col-12">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Notes</label>
                            <div class="fw-bold">${r.notes}</div>
                        </div>
                    </div>` : ''}
                    ${r.original_data ? `<div class="col-12">
                        <div class="p-3 rounded-3 bg-light border">
                            <label class="text-muted small">Original QR Data</label>
                            <pre class="mb-0 small">${JSON.stringify(JSON.parse(r.original_data), null, 2)}</pre>
                        </div>
                    </div>` : ''}
                </div>
            `;
            document.getElementById('legacyDetailModal').show();
        } else {
            if (window.showToast) window.showToast("Record not found", "error");
        }
    } catch (e) {
        if (window.showToast) window.showToast("Unable to load record details", "error");
    }
}

function editLegacyRecordDirect(boxId) {
    viewLegacyRecord(boxId).then(() => {
        if (legacyCurrentRecord) {
            document.getElementById('editBoxId').value = legacyCurrentRecord.box_id;
            document.getElementById('editItemName').value = legacyCurrentRecord.item_name || '';
            document.getElementById('editQty').value = legacyCurrentRecord.qty_in_box || 0;
            document.getElementById('editSupplier').value = legacyCurrentRecord.supplier_or_party || '';
            document.getElementById('editRack').value = legacyCurrentRecord.rack_location || '';
            document.getElementById('editNotes').value = legacyCurrentRecord.notes || '';
            document.getElementById('editStatus').value = legacyCurrentRecord.status || 'ARCHIVED';
            document.getElementById('legacyEditModal').show();
        }
    });
}

function editLegacyRecord() {
    if (legacyCurrentRecord) {
        editLegacyRecordDirect(legacyCurrentRecord.box_id);
    }
}

async function saveLegacyEdit() {
    const boxId = document.getElementById('editBoxId').value;
    const itemName = document.getElementById('editItemName').value.trim();
    const qty = parseInt(document.getElementById('editQty').value) || 0;
    const supplier = document.getElementById('editSupplier').value.trim() || null;
    const rack = document.getElementById('editRack').value.trim() || null;
    const notes = document.getElementById('editNotes').value.trim() || null;
    const status = document.getElementById('editStatus').value;

    if (!itemName) {
        if (window.showToast) window.showToast("⚠️ Item Name is required!", "warning");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/${boxId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item_name: itemName,
                qty_in_box: qty,
                supplier_or_party: supplier,
                rack_location: rack,
                notes: notes,
                status: status
            })
        });

        const data = await res.json();
        if (res.ok) {
            document.getElementById('legacyEditModal').hide();
            if (window.showToast) window.showToast(data.message, "success");
            loadLegacyRecords();
        } else {
            if (window.showToast) window.showToast(data.detail || 'Update failed!', "error");
        }
    } catch (e) {
        if (window.showToast) window.showToast("Unable to update record", "error");
    }
}

async function confirmDeleteLegacy() {
    if (!legacyCurrentRecord) return;
    await deleteLegacyRecord(legacyCurrentRecord.box_id);
    document.getElementById('legacyDetailModal').hide();
}

async function confirmDeleteLegacyDirect(boxId) {
    await deleteLegacyRecord(boxId);
    loadLegacyRecords();
}

async function deleteLegacyRecord(boxId) {
    if (!confirm(`Are you sure you want to delete legacy QR record: ${boxId}?`)) return;

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/${boxId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            if (window.showToast) window.showToast(data.message, "success");
            loadLegacyRecords();
        } else {
            if (window.showToast) window.showToast(data.detail || 'Delete failed!', "error");
        }
    } catch (e) {
        if (window.showToast) window.showToast("Unable to delete record", "error");
    }
}

function exportLegacyData() {
    window.open(`${API_URL}/api/legacy-qr/list?limit=10000`, '_blank');
}

async function startLegacyScanner() {
    const placeholder = document.getElementById('legacyScannerPlaceholder');
    const readerWrapper = document.getElementById('legacyReaderWrapper');

    if (!placeholder || !readerWrapper) return;

    placeholder.style.display = 'none';
    readerWrapper.style.display = 'block';

    if (typeof Html5QrcodeScanner === 'undefined') {
        readerWrapper.innerHTML = `
            <div class="text-center p-4">
                <div class="text-danger fw-bold fs-5 mb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i>Library Not Loaded</div>
                <div class="small text-muted mb-3">QR scanner library failed to load. Please refresh the page.</div>
                <button class="btn btn-primary px-4" onclick="startLegacyScanner()">
                    <i class="bi bi-arrow-clockwise me-1"></i> Retry
                </button>
            </div>
        `;
        return;
    }

    if (legacyScanner) {
        try {
            legacyScanner.clear();
        } catch (e) { }
    }

    try {
        legacyScanner = new Html5QrcodeScanner("legacyReader", {
            fps: 15,
            qrbox: { width: 240, height: 240 },
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true
        });

        legacyScanner.render(
            async (decodedText) => {
                if (legacyIsScanning) return;
                legacyIsScanning = true;
                await scanLegacyQR(decodedText);
                setTimeout(() => { legacyIsScanning = false; }, 2000);
            },
            () => { }
        );

        if (window.showToast) window.showToast("Camera scanner started. Point at QR code.", "success");
    } catch (e) {
        console.error("Legacy scanner init failed:", e);
        readerWrapper.innerHTML = `
            <div class="text-center p-4">
                <div class="text-danger fw-bold fs-5 mb-2"><i class="bi bi-camera-video-off me-2"></i>Camera Error</div>
                <div class="small text-muted mb-3">${e.message || 'Unable to access camera. Please ensure camera permissions are enabled.'}</div>
                <button class="btn btn-primary px-4" onclick="startLegacyScanner()">
                    <i class="bi bi-arrow-clockwise me-1"></i> Retry
                </button>
            </div>
        `;
    }
}

function stopLegacyScanner() {
    if (legacyScanner) {
        try {
            legacyScanner.clear();
        } catch (e) { }
        legacyScanner = null;
    }
    const readerWrapper = document.getElementById('legacyReaderWrapper');
    const placeholder = document.getElementById('legacyScannerPlaceholder');
    if (readerWrapper) readerWrapper.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    const resultDiv = document.getElementById('legacyScanResult');
    if (resultDiv) resultDiv.innerHTML = '';
    if (window.showToast) window.showToast("Scanner stopped", "info");
}

async function scanLegacyQR(decodedText) {
    const resultDiv = document.getElementById('legacyScanResult');
    if (!resultDiv) return;

    resultDiv.innerHTML = `<div class="text-center py-2"><span class="spinner-border spinner-border-sm text-primary"></span> Scanning & saving legacy QR...</div>`;

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/scan-save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scanned_text: decodedText.trim() })
        });

        const data = await res.json();

        if (res.ok) {
            const r = data.record;
            const isNew = data.is_new;
            resultDiv.innerHTML = `
                <div class="alert ${isNew ? 'alert-success' : 'alert-info'} m-0 p-3">
                    <h6 class="fw-bold ${isNew ? 'text-success' : 'text-info'} mb-2">
                        <i class="bi bi-${isNew ? 'check-circle-fill' : 'info-circle-fill'} me-2"></i>${isNew ? 'New Legacy QR Saved!' : 'Legacy QR Found!'}
                    </h6>
                    <div class="row g-2 small">
                        <div class="col-6"><strong>Box ID:</strong> ${r.box_id}</div>
                        <div class="col-6"><strong>Item:</strong> ${r.item_name || '-'}</div>
                        <div class="col-6"><strong>Qty:</strong> ${r.qty_in_box || 0}</div>
                        <div class="col-6"><strong>Batch:</strong> ${r.batch_id || '-'}</div>
                        <div class="col-6"><strong>Supplier:</strong> ${r.supplier_or_party || '-'}</div>
                        <div class="col-6"><strong>Status:</strong> ${r.status || 'ARCHIVED'}</div>
                    </div>
                    ${isNew ? '<div class="mt-2 p-2 rounded bg-success bg-opacity-10 border border-success"><small class="text-success"><i class="bi bi-info-circle me-1"></i>New record saved to database with scanned details.</small></div>' : ''}
                    <div class="mt-2 d-flex gap-2 justify-content-center">
                        <button class="btn btn-warning btn-sm fw-bold" onclick="generateLegacyQR('${r.box_id}')">
                            <i class="bi bi-qr-code me-1"></i> Generate QR
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="viewLegacyRecord('${r.box_id}')">
                            <i class="bi bi-eye me-1"></i> View Details
                        </button>
                    </div>
                </div>
            `;
            if (window.showToast) window.showToast(`${isNew ? 'Saved' : 'Found'}: ${r.item_name} (${r.box_id})`, isNew ? "success" : "info");
        } else {
            resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ ${data.detail || 'No data could be extracted from QR.'}</div>`;
        }
    } catch (e) {
        resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ Unable to process QR code.</div>`;
    }
}

function preprocessImageForScan(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            const MAX_DIM = 1600;
            let w = img.width;
            let h = img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
                if (blob) {
                    const processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.png', { type: 'image/png' });
                    resolve({ file: processedFile, canvas: canvas });
                } else {
                    reject(new Error('Failed to convert image to canvas blob.'));
                }
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image file. The file may be corrupted or in an unsupported format.'));
        };
        img.src = url;
    });
}

async function decodeQrFromCanvas(canvas) {
    if (typeof jsQR !== 'function') {
        console.warn("jsQR library not loaded");
        return null;
    }
    try {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        return result ? result.data : null;
    } catch (e) {
        console.error("jsQR canvas decode error:", e);
        return null;
    }
}

async function decodeQrFromFile(file) {
    if (typeof jsQR !== 'function') {
        console.warn("jsQR library not loaded in decodeQrFromFile");
        return null;
    }
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            console.log("Image loaded for jsQR:", img.width, "x", img.height);
            if (img.width === 0 || img.height === 0) {
                console.error("Image has zero dimensions");
                resolve(null);
                return;
            }
            const canvas = document.createElement('canvas');
            const MAX_DIM = 2000;
            let w = img.width;
            let h = img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            console.log("jsQR canvas:", w, "x", h, "pixels");
            try {
                const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                if (result) {
                    console.log("jsQR decoded:", result.data);
                    resolve(result.data);
                } else {
                    console.warn("jsQR: no QR detected in image data");
                    resolve(null);
                }
            } catch (e) {
                console.error("jsQR file decode error:", e);
                resolve(null);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            console.error("Failed to load image for jsQR");
            resolve(null);
        };
        img.src = url;
    });
}

async function scanLegacyImage() {
    const fileInput = document.getElementById('legacyImageUpload');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        if (window.showToast) window.showToast("⚠️ Please select an image file first!", "warning");
        return;
    }

    const file = fileInput.files[0];
    const previewDiv = document.getElementById('legacyImagePreview');
    const previewImg = document.getElementById('legacyImagePreviewImg');

    if (previewImg) {
        previewImg.src = URL.createObjectURL(file);
    }
    if (previewDiv) previewDiv.style.display = 'block';

    const resultDiv = document.getElementById('legacyScanResult');
    if (resultDiv) {
        resultDiv.innerHTML = `<div class="text-center py-2"><span class="spinner-border spinner-border-sm text-primary"></span> Scanning image...</div>`;
    }

    if (typeof Html5Qrcode === 'undefined') {
        if (resultDiv) resultDiv.innerHTML = `<div class="alert alert-danger m-0">❌ QR scanner library not loaded. Please refresh the page.</div>`;
        return;
    }

    if (typeof jsQR === 'undefined') {
        console.warn("jsQR library not loaded from CDN");
    } else {
        console.log("jsQR loaded successfully");
    }

    try {
        const readerWrapper = document.getElementById('legacyReaderWrapper');
        const placeholder = document.getElementById('legacyScannerPlaceholder');
        if (readerWrapper) readerWrapper.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';

        const readerEl = document.getElementById('legacyReader');
        if (readerEl) {
            readerEl.style.width = '400px';
            readerEl.style.height = '400px';
            readerEl.style.margin = '0 auto';
        }

        let processed = null;
        try {
            processed = await preprocessImageForScan(file);
        } catch (imgErr) {
            console.warn("Image preprocessing failed, trying raw file:", imgErr);
            processed = { file: file, canvas: null };
        }

        let decodedText = null;
        let html5QrCode = null;

        if (typeof Html5Qrcode === 'function') {
            await new Promise(resolve => requestAnimationFrame(resolve));

            html5QrCode = new Html5Qrcode("legacyReader");

            try {
                decodedText = await html5QrCode.scanFile(processed.file, false);
            } catch (primaryErr) {
                console.warn("scanFile(processed, showImage=false) failed:", primaryErr);
                if (typeof html5QrCode.scanFileV2 === 'function') {
                    try {
                        decodedText = await html5QrCode.scanFileV2({
                            imageFile: processed.file,
                            showImage: false,
                            rawImage: false
                        });
                    } catch (v2Err) {
                        console.warn("scanFileV2(rawImage:false) failed, trying rawImage:true:", v2Err);
                        try {
                            decodedText = await html5QrCode.scanFileV2({
                                imageFile: processed.file,
                                showImage: false,
                                rawImage: true
                            });
                        } catch (v2RawErr) {
                            console.error("scanFileV2(rawImage:true) also failed:", v2RawErr);
                        }
                    }
                }
            }

            try { html5QrCode.clear(); } catch (e) { }

        if (!decodedText && processed.canvas) {
            console.log("Trying jsQR fallback with canvas:", processed.canvas.width, "x", processed.canvas.height);
            decodedText = await decodeQrFromCanvas(processed.canvas);
            if (decodedText) {
                console.log("jsQR fallback success:", decodedText);
            } else {
                console.warn("jsQR fallback: no QR detected in canvas");
            }
        }

        if (!decodedText) {
            console.log("Trying jsQR fallback with original file");
            decodedText = await decodeQrFromFile(file);
            if (decodedText) {
                console.log("jsQR file fallback success:", decodedText);
            }
        }

        if (!decodedText) {
            const jsqrAvailable = typeof jsQR === 'function';
            console.error("All decode methods failed. jsQR available:", jsqrAvailable);
            if (processed && processed.canvas) {
                console.log("Canvas dimensions:", processed.canvas.width, "x", processed.canvas.height);
            }
            throw new Error(jsqrAvailable ? 'Unable to detect QR code in the image. The QR code may be damaged or in an unsupported format.' : 'QR decoder libraries not fully loaded. Please refresh the page and try again.');
        }

        await scanLegacyQR(decodedText);
    } catch (err) {
        console.error("scanLegacyImage error details:", err);
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger m-0 p-3">
                    <h6 class="fw-bold text-danger mb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i>Image Scan Failed</h6>
                    <div class="small">${err.message || 'Unable to detect QR code in the image.'}</div>
                    <hr>
                    <div class="small text-muted">
                        <strong>What was tried:</strong><br>
                        • html5-qrcode scanFile (ZXing decoder)<br>
                        • html5-qrcode scanFileV2 (alternative mode)<br>
                        • jsQR (canvas pixel decoder)<br>
                        <hr>
                        <strong>Tips:</strong><br>
                        • Ensure the QR code is clearly visible and not blurry<br>
                        • Try a different image format (PNG, JPG, JPEG, GIF, BMP)<br>
                        • Make sure the QR code is not too small or too large in the image<br>
                        • Ensure good lighting and avoid glare on the QR code<br>
                        • Try camera scanner instead if image scan fails<br>
                        • Check browser console for technical details
                    </div>
                </div>
            `;
        }
        if (window.showToast) window.showToast("Image scan failed: " + (err.message || 'Unknown error'), "error");
    }
}

async function generateLegacyQR(boxId) {
    if (!boxId) {
        if (window.showToast) window.showToast("⚠️ No Box ID selected!", "warning");
        return;
    }

    const qrModal = document.getElementById('legacyQRModal');
    const qrPreview = document.getElementById('legacyQRPreview');
    const qrBoxId = document.getElementById('legacyQRBoxId');
    const qrItemName = document.getElementById('legacyQRItemName');
    const qrPayload = document.getElementById('legacyQRPayload');

    if (qrPreview) qrPreview.innerHTML = `<div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span> Loading QR...</div>`;
    if (qrBoxId) qrBoxId.textContent = boxId;
    if (qrItemName) qrItemName.textContent = 'Loading...';
    if (qrPayload) qrPayload.textContent = '';

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/${encodeURIComponent(boxId)}`);
        const data = await res.json();

        if (res.ok && data.record) {
            const r = data.record;
            if (qrItemName) qrItemName.textContent = r.item_name || '-';

            const payload = JSON.stringify({
                box_id: r.box_id,
                item_name: r.item_name,
                qty: r.qty_in_box || 0,
                batch_id: r.batch_id || '',
                supplier: r.supplier_or_party || '',
                status: r.status || 'ARCHIVED'
            });

            if (qrPayload) qrPayload.textContent = payload;

            if (qrPreview) {
                qrPreview.innerHTML = '';
                if (typeof QRCode !== 'undefined') {
                    new QRCode(qrPreview, {
                        text: payload,
                        width: 180,
                        height: 180,
                        correctLevel: QRCode.CorrectLevel.H
                    });
                } else {
                    qrPreview.innerHTML = '<div class="text-danger">QR library not loaded</div>';
                }
            }

            if (qrModal && window.bootstrap) {
                const bsModal = bootstrap.Modal.getOrCreateInstance(qrModal);
                bsModal.show();
            }
        } else {
            if (window.showToast) window.showToast("Record not found", "error");
        }
    } catch (e) {
        if (window.showToast) window.showToast("Unable to generate QR", "error");
    }
}

async function generateAllLegacyQR() {
    const search = document.getElementById('legacySearch')?.value || '';

    try {
        const res = await fetch(`${API_URL}/api/legacy-qr/qr-export?search=${encodeURIComponent(search)}`);
        const data = await res.json();

        if (!res.ok || !data.records || data.records.length === 0) {
            if (window.showToast) window.showToast("⚠️ No records found to generate QR codes", "warning");
            return;
        }

        const records = data.records;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Legacy QR Codes - ${records.length} Records</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
                    <style>
                        body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px; background: #f8f9fa; }
                        h2 { text-align: center; margin-bottom: 20px; }
                        .qr-card { border: 2px solid #dee2e6; border-radius: 8px; padding: 10px; background: white; text-align: center; page-break-inside: avoid; }
                        .qr-card .box-id { font-weight: bold; font-family: monospace; margin-top: 5px; }
                        .qr-card .item-name { color: #6c757d; font-size: 12px; }
                        .qr-card .qty { color: #6c757d; font-size: 11px; }
                        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                        @media print { body { padding: 5px; } .no-print { display: none; } }
                    </style>
                </head>
                <body>
                    <h2>Legacy QR Codes (${records.length} Records)</h2>
                    <div class="no-print" style="text-align:center;margin-bottom:15px;">
                        <button onclick="window.print()" style="padding:8px 20px;font-size:16px;font-weight:bold;">🖨️ Print All</button>
                    </div>
                    <div class="grid" id="qrGrid"></div>
                    <script>
                        var records = ${JSON.stringify(records)};
                        var grid = document.getElementById('qrGrid');
                        records.forEach(function(r) {
                            var payload = JSON.stringify({
                                box_id: r.box_id, item_name: r.item_name,
                                qty: r.qty_in_box || 0, batch_id: r.batch_id || '',
                                supplier: r.supplier_or_party || '', status: r.status || 'ARCHIVED'
                            });
                            var card = document.createElement('div');
                            card.className = 'qr-card';
                            card.innerHTML = '<div class="qr-gen-slot"></div><div class="box-id">' + r.box_id + '</div><div class="item-name">' + (r.item_name || '-') + '</div><div class="qty">Qty: ' + (r.qty_in_box || 0) + '</div>';
                            grid.appendChild(card);
                            new QRCode(card.querySelector('.qr-gen-slot'), { text: payload, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.H });
                        });
                    <\/script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }

        if (window.showToast) window.showToast(`Generated ${records.length} QR codes`, "success");
    } catch (e) {
        if (window.showToast) window.showToast("Unable to generate QR codes", "error");
    }
}

function printLegacyQR() {
    window.print();
}

document.addEventListener('DOMContentLoaded', function () {
    loadLegacyRecords();
});
