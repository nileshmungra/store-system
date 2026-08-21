/**
 * ====================================================================
 * 🌓 Unified Global ThemeManager - Store Management System
 * ====================================================================
 * Manages Dark/Light themes across all pages with zero duplication.
 * Automatically binds event listeners to theme toggle buttons and
 * ensures immediate flicker-free application on page load.
 */

const ThemeManager = (function () {
    const STORAGE_KEY_1 = 'user-theme';
    const STORAGE_KEY_2 = 'theme_preference';

    function getSavedTheme() {
        return localStorage.getItem(STORAGE_KEY_1) || 
               localStorage.getItem(STORAGE_KEY_2) || 
               'dark';
    }

    function updateThemeBtnUI(theme) {
        const btn = document.getElementById('globalThemeBtn');
        const icon = document.getElementById('themeIcon');
        const text = document.getElementById('themeText');

        if (btn) {
            if (theme === 'light') {
                btn.className = 'btn btn-outline-dark btn-sm rounded-pill px-3 fw-bold d-flex align-items-center gap-1 shadow-sm ms-2';
            } else {
                btn.className = 'btn btn-outline-warning btn-sm rounded-pill px-3 fw-bold d-flex align-items-center gap-1 shadow-sm ms-2';
            }
        }

        if (icon) {
            if (theme === 'light') {
                icon.className = 'bi bi-sun-fill text-warning';
            } else {
                icon.className = 'bi bi-moon-stars-fill text-warning';
            }
        }

        if (text) {
            text.innerText = theme === 'light' ? 'Light Mode' : 'Dark Mode';
        }
    }

    function applyTheme(theme) {
        const targetTheme = theme || getSavedTheme();
        document.documentElement.setAttribute('data-theme', targetTheme);
        localStorage.setItem(STORAGE_KEY_1, targetTheme);
        localStorage.setItem(STORAGE_KEY_2, targetTheme);
        updateThemeBtnUI(targetTheme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || getSavedTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }

    function bindEvents() {
        const themeBtn = document.getElementById('globalThemeBtn');
        if (themeBtn) {
            themeBtn.removeEventListener('click', toggleTheme);
            themeBtn.addEventListener('click', toggleTheme);
        }

        // Also bind to any other elements with data-action="toggle-theme"
        document.querySelectorAll('[data-action="toggle-theme"]').forEach(el => {
            el.removeEventListener('click', toggleTheme);
            el.addEventListener('click', toggleTheme);
        });

        updateThemeBtnUI(getSavedTheme());
    }

    // Apply immediately to prevent FOUC (Flash of Unstyled Content)
    const initialTheme = getSavedTheme();
    document.documentElement.setAttribute('data-theme', initialTheme);

    // Setup DOM Listeners when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

    return {
        getTheme: getSavedTheme,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        init: bindEvents
    };
})();

// Global backwards compatibility functions
window.ThemeManager = ThemeManager;
window.toggleGlobalTheme = () => ThemeManager.toggleTheme();
window.toggleTheme = () => ThemeManager.toggleTheme();
window.applyGlobalTheme = () => ThemeManager.applyTheme();
