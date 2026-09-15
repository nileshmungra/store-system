/**
 * ====================================================================
 * 🍞 Toast Notification System - Store Management
 * ====================================================================
 * Lightweight, zero-dependency, animated toast notification manager.
 * Supports Success, Error, Warning, and Info toasts with theme awareness.
 */

const Toast = (function () {
    let container = null;
    const recentMessages = new Map(); // key -> timestamp

    function getContainer() {
        if (!container || !document.body.contains(container)) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container-custom';
            document.body.appendChild(container);
        }
        return container;
    }

    const typeConfig = {
        success: {
            icon: 'bi-check-circle-fill',
            colorClass: 'toast-success',
            title: 'Success'
        },
        error: {
            icon: 'bi-x-circle-fill',
            colorClass: 'toast-error',
            title: 'Error'
        },
        warning: {
            icon: 'bi-exclamation-triangle-fill',
            colorClass: 'toast-warning',
            title: 'Warning'
        },
        info: {
            icon: 'bi-info-circle-fill',
            colorClass: 'toast-info',
            title: 'Info'
        }
    };

    function showToast(message, type = 'info', title = null, duration = 3500) {
        if (!message) return;
        const msgStr = String(message).trim();
        const now = Date.now();

        // 🛡️ Deduplication & Spam Protection: Ignore identical toasts shown within 2 seconds
        const toastKey = `${type}:${msgStr}`;
        const lastShown = recentMessages.get(toastKey);
        if (lastShown && (now - lastShown) < 2000) {
            return;
        }
        recentMessages.set(toastKey, now);

        // Cleanup old keys in history
        if (recentMessages.size > 50) {
            for (const [k, time] of recentMessages.entries()) {
                if (now - time > 10000) recentMessages.delete(k);
            }
        }

        const c = getContainer();
        const conf = typeConfig[type] || typeConfig.info;
        const toastTitle = title || conf.title;

        // If an identical toast is already visible in DOM, don't duplicate it
        const existingToasts = c.querySelectorAll('.toast-card-custom');
        for (const existing of existingToasts) {
            const msgEl = existing.querySelector('.toast-msg');
            if (msgEl && msgEl.textContent.trim() === msgStr) {
                // Reset timer on existing toast instead of stacking a new one
                if (existing._timer) clearTimeout(existing._timer);
                existing._timer = setTimeout(() => removeToast(existing), duration);
                return;
            }
        }

        const toastEl = document.createElement('div');
        toastEl.className = `toast-card-custom ${conf.colorClass}`;

        toastEl.innerHTML = `
            <div class="toast-icon-wrap">
                <i class="bi ${conf.icon}"></i>
            </div>
            <div class="toast-body-wrap">
                <div class="toast-title">${toastTitle}</div>
                <div class="toast-msg">${msgStr}</div>
            </div>
            <button type="button" class="toast-close-btn" aria-label="Close">&times;</button>
            <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
        `;

        const closeBtn = toastEl.querySelector('.toast-close-btn');
        closeBtn.addEventListener('click', () => removeToast(toastEl));

        c.appendChild(toastEl);

        // Animate entrance
        requestAnimationFrame(() => {
            toastEl.classList.add('show');
        });

        // Auto dismiss
        const timer = setTimeout(() => {
            removeToast(toastEl);
        }, duration);

        toastEl._timer = timer;

        // Limit visible toasts to max 3 to prevent full screen clutter
        const visibleToasts = c.querySelectorAll('.toast-card-custom');
        const MAX_VISIBLE = 3;
        if (visibleToasts.length > MAX_VISIBLE) {
            const oldest = visibleToasts[0];
            if (oldest._timer) clearTimeout(oldest._timer);
            removeToast(oldest);
        }
    }

    function removeToast(el) {
        if (!el) return;
        if (el._timer) clearTimeout(el._timer);
        el.classList.remove('show');
        el.classList.add('hide');
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }

    return {
        show: showToast,
        success: (msg, title, duration) => showToast(msg, 'success', title, duration),
        error: (msg, title, duration) => showToast(msg, 'error', title, duration),
        warning: (msg, title, duration) => showToast(msg, 'warning', title, duration),
        info: (msg, title, duration) => showToast(msg, 'info', title, duration)
    };
})();

// Global accessibility
window.Toast = Toast;
window.showToast = (msg, type, title, duration) => Toast.show(msg, type, title, duration);
