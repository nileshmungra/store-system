/**
 * ====================================================================
 * 🍞 Toast Notification System - Store Management
 * ====================================================================
 * Lightweight, zero-dependency, animated toast notification manager.
 * Supports Success, Error, Warning, and Info toasts with theme awareness.
 */

const Toast = (function () {
    let container = null;

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
        const c = getContainer();

        // Remove any existing toast immediately so only one toast is visible at a time
        const existing = c.querySelectorAll('.toast-card-custom');
        existing.forEach(el => {
            if (el._timer) clearTimeout(el._timer);
            if (el.parentNode) el.parentNode.removeChild(el);
        });

        const conf = typeConfig[type] || typeConfig.info;
        const toastTitle = title || conf.title;

        const toastEl = document.createElement('div');
        toastEl.className = `toast-card-custom ${conf.colorClass}`;

        toastEl.innerHTML = `
            <div class="toast-icon-wrap">
                <i class="bi ${conf.icon}"></i>
            </div>
            <div class="toast-body-wrap">
                <div class="toast-title">${toastTitle}</div>
                <div class="toast-msg">${message}</div>
            </div>
            <button type="button" class="toast-close-btn" aria-label="Close">&times;</button>
            <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
        `;

        const closeBtn = toastEl.querySelector('.toast-close-btn');
        closeBtn.addEventListener('click', () => removeToast(toastEl));

        c.appendChild(toastEl);

        requestAnimationFrame(() => {
            toastEl.classList.add('show');
        });

        const timer = setTimeout(() => {
            removeToast(toastEl);
        }, duration);

        toastEl._timer = timer;
    }

    function removeToast(el) {
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
