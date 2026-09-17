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
        return 'light';
    }

    function updateThemeBtnUI(theme) {
        const btn = document.getElementById('globalThemeBtn');
        if (btn) {
            btn.style.display = 'none';
        }
    }

    function applyTheme(theme) {
        const targetTheme = 'light';
        document.documentElement.setAttribute('data-theme', targetTheme);
        localStorage.setItem(STORAGE_KEY_1, targetTheme);
        localStorage.setItem(STORAGE_KEY_2, targetTheme);
        updateThemeBtnUI(targetTheme);
    }

    function toggleTheme() {
        // Enforce light theme only
        applyTheme('light');
    }

    function bindEvents() {
        applyTheme('light');
        document.querySelectorAll('#globalThemeBtn, [data-action="toggle-theme"], #themeIcon, #themeText').forEach(el => {
            el.style.display = 'none';
        });
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
