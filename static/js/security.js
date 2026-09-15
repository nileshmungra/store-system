/**
 * ====================================================================
 * 🛡️ Security & Data Validation Utilities - Inventory Management System
 * ====================================================================
 * Provides:
 * 1. HTML Injection (XSS) prevention via escapeHtml().
 * 2. Debounce function for smooth, performance-optimized searching.
 * 3. Token-based Authentication Manager (AuthManager) and authFetch().
 */

(function () {
    // -------------------------------------------------------------
    // 1. HTML Injection (XSS) Sanitization
    // -------------------------------------------------------------
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '`': '&#x60;'
    };

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"'`]/g, tag => htmlEscapes[tag] || tag);
    }

    // -------------------------------------------------------------
    // 2. Debounce Function
    // -------------------------------------------------------------
    function debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // -------------------------------------------------------------
    // 3. Token-Based Authentication Manager (JWT / API Key)
    // -------------------------------------------------------------
    const TOKEN_STORAGE_KEY = 'store_auth_token';
    const DEFAULT_DEV_TOKEN = 'STORE_SECURE_TOKEN_V1';

    const AuthManager = {
        getToken: function () {
            let token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                // Initialize with default session token if none present
                token = DEFAULT_DEV_TOKEN;
                localStorage.setItem(TOKEN_STORAGE_KEY, token);
            }
            return token;
        },
        setToken: function (token) {
            if (token) {
                localStorage.setItem(TOKEN_STORAGE_KEY, token);
            } else {
                localStorage.removeItem(TOKEN_STORAGE_KEY);
            }
        },
        clearToken: function () {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
        },
        isAuthenticated: function () {
            return !!this.getToken();
        }
    };

    // -------------------------------------------------------------
    // 4. Secure authFetch Wrapper
    // -------------------------------------------------------------
    async function authFetch(url, options = {}) {
        const token = AuthManager.getToken();

        // Merge headers safely
        const defaultHeaders = {
            'Bypass-Tunnel-Reminder': 'true'
        };

        if (token) {
            defaultHeaders['Authorization'] = `Bearer ${token}`;
            defaultHeaders['X-API-Key'] = token;
        }

        const customHeaders = options.headers || {};
        const mergedHeaders = { ...defaultHeaders, ...customHeaders };

        const fetchOptions = {
            ...options,
            headers: mergedHeaders
        };

        try {
            const response = await fetch(url, fetchOptions);

            // Handle unauthorized status gracefully
            if (response.status === 401 || response.status === 403) {
                console.warn(`[Security] Unauthorized access to ${url} (Status ${response.status})`);
            }

            return response;
        } catch (error) {
            console.error(`[Security] Network request failed for ${url}:`, error);
            throw error;
        }
    }

    // -------------------------------------------------------------
    // Global Export
    // -------------------------------------------------------------
    window.Security = {
        escapeHtml: escapeHtml,
        debounce: debounce,
        AuthManager: AuthManager,
        authFetch: authFetch
    };

    // Top-level shortcuts for easy inline usage
    window.escapeHtml = escapeHtml;
    window.debounce = debounce;
    window.authFetch = authFetch;
    window.AuthManager = AuthManager;
})();
