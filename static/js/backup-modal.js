/**
 * Database Backup & Migration Modal Handler
 * Bhumi Factory & Dispatch Manager
 */

(function () {
    // Inject the Modal HTML dynamically into the document if not present
    function injectBackupModal() {
        if (document.getElementById('databaseBackupModal')) return;

        const modalHtml = `
        <div class="modal fade" id="databaseBackupModal" tabindex="-1" aria-labelledby="databaseBackupModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 16px; overflow: hidden; background: var(--bg-card, #ffffff); color: var(--text-main, #0f172a);">
                    <!-- Modal Header -->
                    <div class="modal-header border-0 pb-0" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(16, 185, 129, 0.1));">
                        <div class="d-flex align-items-center gap-3">
                            <div class="p-2 rounded-3 bg-primary bg-opacity-20 text-primary fs-3">
                                <i class="bi bi-database-check"></i>
                            </div>
                            <div>
                                <h5 class="modal-title fw-bold m-0 text-white" id="databaseBackupModalLabel" style="color: #0f172a;">Database Backup & Migration</h5>
                                <p class="text-muted small m-0">Download full backup for safety or migrating to a new database.</p>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>

                    <!-- Modal Body -->
                    <div class="modal-body p-4">
                        <!-- Live Status Banner -->
                        <div class="p-3 mb-4 rounded-3 border border-secondary border-opacity-25" style="background: rgba(255, 255, 255, 0.03);">
                            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <div>
                                    <span class="text-muted small text-uppercase fw-bold">Active Database:</span>
                                    <span class="badge bg-primary ms-1" id="backupModalDbName">Loading...</span>
                                    <span class="badge bg-info text-dark ms-1" id="backupModalDbType">MySQL</span>
                                </div>
                                <div>
                                    <span class="text-muted small me-2"><i class="bi bi-table text-info"></i> <strong id="backupModalTableCount">0</strong> Tables</span>
                                    <span class="text-muted small"><i class="bi bi-layers text-success"></i> <strong id="backupModalRecordCount">0</strong> Total Rows</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3 Download Option Cards -->
                        <div class="row g-3 mb-4">
                            <!-- Option 1: SQL Dump -->
                            <div class="col-md-4">
                                <div class="card h-100 border border-primary border-opacity-25 p-3 rounded-3" style="background: rgba(59, 130, 246, 0.05);">
                                    <div class="d-flex align-items-center gap-2 mb-2 text-primary">
                                        <i class="bi bi-filetype-sql fs-4"></i>
                                        <strong class="text-dark">SQL Dump (.sql)</strong>
                                    </div>
                                    <p class="small text-muted flex-grow-1">
                                        Complete MySQL script with table structures and insert statements. Best for phpMyAdmin & Workbench.
                                    </p>
                                    <a href="/api/backup/download?format=sql" class="btn btn-outline-primary btn-sm rounded-pill fw-bold w-100 mt-2">
                                        <i class="bi bi-download me-1"></i> Download .sql
                                    </a>
                                </div>
                            </div>

                            <!-- Option 2: Universal JSON -->
                            <div class="col-md-4">
                                <div class="card h-100 border border-success border-opacity-25 p-3 rounded-3" style="background: rgba(16, 185, 129, 0.05);">
                                    <div class="d-flex align-items-center gap-2 mb-2 text-success">
                                        <i class="bi bi-filetype-json fs-4"></i>
                                        <strong class="text-dark">Universal JSON (.json)</strong>
                                    </div>
                                    <p class="small text-muted flex-grow-1">
                                        Pure structured data. 100% portable for changing databases (PostgreSQL, SQLite, Cloud SQL, Oracle).
                                    </p>
                                    <a href="/api/backup/download?format=json" class="btn btn-outline-success btn-sm rounded-pill fw-bold w-100 mt-2">
                                        <i class="bi bi-download me-1"></i> Download .json
                                    </a>
                                </div>
                            </div>

                            <!-- Option 3: Full ZIP Archive -->
                            <div class="col-md-4">
                                <div class="card h-100 border border-warning border-opacity-25 p-3 rounded-3" style="background: rgba(245, 158, 11, 0.05);">
                                    <div class="d-flex align-items-center gap-2 mb-2 text-warning">
                                        <i class="bi bi-file-earmark-zip fs-4"></i>
                                        <strong class="text-dark">Full Bundle (.zip)</strong>
                                    </div>
                                    <p class="small text-muted flex-grow-1">
                                        All-in-one compressed package containing both .sql, .json, and detailed metadata file.
                                    </p>
                                    <a href="/api/backup/download?format=zip" class="btn btn-warning btn-sm rounded-pill fw-bold w-100 mt-2 text-dark">
                                        <i class="bi bi-download me-1"></i> Download .zip
                                    </a>
                                </div>
                            </div>
                        </div>

                        <!-- Database Tables Preview Collapse -->
                        <div class="mb-4">
                            <button class="btn btn-sm btn-outline-secondary w-100 text-start d-flex justify-content-between align-items-center" type="button" data-bs-toggle="collapse" data-bs-target="#backupTableListCollapse" aria-expanded="false">
                                <span><i class="bi bi-list-columns me-1"></i> View Tables Included in Backup</span>
                                <i class="bi bi-chevron-down"></i>
                            </button>
                            <div class="collapse mt-2" id="backupTableListCollapse">
                                <div class="card card-body p-2 border border-secondary border-opacity-25 rounded-3" style="background: rgba(0,0,0,0.2); max-height: 180px; overflow-y: auto;">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-dark table-hover mb-0 small">
                                            <thead>
                                                <tr>
                                                    <th>Table Name</th>
                                                    <th class="text-end">Rows</th>
                                                    <th class="text-end">Columns</th>
                                                </tr>
                                            </thead>
                                            <tbody id="backupModalTableTbody">
                                                <tr><td colspan="3" class="text-center text-muted">Loading table info...</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Restore / Migration Accordion -->
                        <div class="accordion" id="backupRestoreAccordion">
                            <div class="accordion-item border border-secondary border-opacity-25 rounded-3" style="background: rgba(255,255,255,0.02); overflow: hidden;">
                                <h2 class="accordion-header" id="headingRestore">
                                    <button class="accordion-button collapsed py-2 text-dark" type="button" data-bs-toggle="collapse" data-bs-target="#collapseRestore" aria-expanded="false" aria-controls="collapseRestore" style="background: rgba(239, 68, 68, 0.05);">
                                        <i class="bi bi-arrow-counterclockwise text-danger me-2"></i>
                                        <span class="fw-semibold">Restore / Import Database from Backup</span>
                                    </button>
                                </h2>
                                <div id="collapseRestore" class="accordion-collapse collapse" aria-labelledby="headingRestore" data-bs-parent="#backupRestoreAccordion">
                                    <div class="accordion-body p-3">
                                        <div class="alert alert-warning py-2 small mb-3">
                                            <i class="bi bi-exclamation-triangle-fill me-1"></i>
                                            <strong>Warning:</strong> Restoring will overwrite matching existing records. Please ensure you have downloaded a fresh backup first!
                                        </div>
                                        <form id="backupRestoreForm">
                                            <div class="row g-2">
                                                <div class="col-md-6">
                                                    <label class="form-label small text-muted">Select Backup File (.json or .sql)</label>
                                                    <input type="file" id="backupRestoreFileInput" class="form-control form-control-sm bg-light text-dark border-secondary" accept=".json,.sql" required>
                                                </div>
                                                <div class="col-md-6">
                                                    <label class="form-label small text-muted">Admin Password</label>
                                                    <input type="password" id="backupRestorePasswordInput" class="form-control form-control-sm bg-light text-dark border-secondary" placeholder="Enter admin password" required>
                                                </div>
                                                <div class="col-12 text-end mt-3">
                                                    <button type="submit" id="backupRestoreSubmitBtn" class="btn btn-danger btn-sm rounded-pill px-4 fw-bold">
                                                        <i class="bi bi-upload me-1"></i> Start Database Restore
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                        <div id="backupRestoreStatus" class="mt-2 text-center small fw-semibold" style="display: none;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Modal Footer -->
                    <div class="modal-footer border-0 pt-0">
                        <button type="button" class="btn btn-secondary btn-sm rounded-pill px-4" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        attachRestoreHandler();
    }

    // Load DB Info from API
    async function refreshBackupInfo() {
        try {
            const res = await fetch('/api/backup/info');
            if (!res.ok) throw new Error('Failed to load database status');
            const data = await res.json();

            const dbNameEl = document.getElementById('backupModalDbName');
            const dbTypeEl = document.getElementById('backupModalDbType');
            const tableCntEl = document.getElementById('backupModalTableCount');
            const recCntEl = document.getElementById('backupModalRecordCount');
            const tbodyEl = document.getElementById('backupModalTableTbody');

            if (dbNameEl) dbNameEl.textContent = data.database_name || 'inventory_db';
            if (dbTypeEl) dbTypeEl.textContent = (data.db_type || 'MySQL').toUpperCase();
            if (tableCntEl) tableCntEl.textContent = data.total_tables || 0;
            if (recCntEl) recCntEl.textContent = Number(data.total_records || 0).toLocaleString();

            if (tbodyEl && data.tables) {
                tbodyEl.innerHTML = data.tables.map(t => `
                    <tr>
                        <td class="font-monospace text-info">${t.table_name}</td>
                        <td class="text-end fw-semibold">${Number(t.row_count).toLocaleString()}</td>
                        <td class="text-end text-muted">${t.column_count}</td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            console.warn('Backup modal info error:', err);
        }
    }

    // Attach form submit handler for restore
    function attachRestoreHandler() {
        const form = document.getElementById('backupRestoreForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('backupRestoreFileInput');
            const passInput = document.getElementById('backupRestorePasswordInput');
            const statusEl = document.getElementById('backupRestoreStatus');
            const btn = document.getElementById('backupRestoreSubmitBtn');

            if (!fileInput.files || !fileInput.files[0]) {
                alert('Please select a .json or .sql backup file');
                return;
            }

            if (!confirm('Are you ABSOLUTELY sure you want to restore the database? Existing table records will be replaced.')) {
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Restoring...';
            statusEl.style.display = 'block';
            statusEl.className = 'mt-2 text-center small text-info';
            statusEl.textContent = 'Uploading and processing backup... Please wait.';

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('password', passInput.value);

            try {
                const res = await fetch('/api/backup/restore', {
                    method: 'POST',
                    body: formData
                });
                const resData = await res.json();

                if (!res.ok) {
                    throw new Error(resData.detail || 'Restore failed');
                }

                statusEl.className = 'mt-2 text-center small text-success fw-bold';
                statusEl.textContent = '✓ ' + (resData.message || 'Database restored successfully!');
                refreshBackupInfo();
                if (window.showToast) {
                    window.showToast('Database Restored Successfully!', 'success');
                }
            } catch (err) {
                statusEl.className = 'mt-2 text-center small text-danger fw-bold';
                statusEl.textContent = '✗ ' + err.message;
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-upload me-1"></i> Start Database Restore';
            }
        });
    }

    // Global helper to open the modal
    window.openDatabaseBackupModal = function () {
        injectBackupModal();
        refreshBackupInfo();
        const modalEl = document.getElementById('databaseBackupModal');
        if (modalEl && window.bootstrap) {
            const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
            bsModal.show();
        }
    };

    // Auto initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        injectBackupModal();
        document.querySelectorAll('.btn-open-backup-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                window.openDatabaseBackupModal();
            });
        });
    });
})();
