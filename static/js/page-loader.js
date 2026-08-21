/**
 * 📦 Page Loader / Progress Bar Module
 * Store Management System
 *
 * Usage:
 *   PageLoader.show()          - Show full overlay + start/reset progress bar
 *   PageLoader.hide()          - Finish progress, then hide overlay
 *   PageLoader.start()         - Start progress bar only (for AJAX)
 *   PageLoader.complete()      - Complete progress bar only (for AJAX)
 *   PageLoader.setProgress(n)  - Set progress bar to n% (0-100)
 */

const PageLoader = (function () {
    let progressBar = null;
    let overlay = null;
    let isVisible = false;
    let progressInterval = null;
    let fallbackTimer = null;

    const FALLBACK_DELAY = 8000;

    function init() {
        progressBar = document.getElementById('page-progress-bar');
        overlay = document.getElementById('page-loader-overlay');

        if (!progressBar && !overlay) {
            console.warn('[PageLoader] Elements not found. Ensure loader HTML is present.');
            return false;
        }
        return true;
    }

    function resetProgress() {
        clearInterval(progressInterval);
        progressInterval = null;
        clearTimeout(fallbackTimer);
        fallbackTimer = null;

        if (progressBar) {
            progressBar.classList.remove('complete');
            progressBar.style.width = '0%';
        }
    }

    function show() {
        if (!init()) return;

        resetProgress();

        if (overlay) {
            overlay.classList.add('active');
        }
        if (progressBar) {
            progressBar.classList.add('active');
            progressBar.classList.remove('complete');
            progressBar.style.width = '0%';
            simulateProgress();
        }

        isVisible = true;
        scheduleFallback();
    }

    function hide() {
        if (!progressBar && !overlay) init();

        clearTimeout(fallbackTimer);
        fallbackTimer = null;
        clearInterval(progressInterval);
        progressInterval = null;

        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.classList.add('complete');

            setTimeout(function () {
                if (progressBar) {
                    progressBar.classList.remove('active', 'complete');
                    progressBar.style.width = '0%';
                }
            }, 500);
        }

        if (overlay) {
            overlay.classList.remove('active');
        }

        isVisible = false;
    }

    function start() {
        if (!init()) return;

        if (progressBar && !progressBar.classList.contains('active')) {
            progressBar.classList.add('active');
            progressBar.classList.remove('complete');
            progressBar.style.width = '0%';
            simulateProgress();
        }
    }

    function complete() {
        if (!progressBar && !overlay) init();

        clearInterval(progressInterval);
        progressInterval = null;
        clearTimeout(fallbackTimer);
        fallbackTimer = null;

        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.classList.add('complete');

            setTimeout(function () {
                if (progressBar) {
                    progressBar.classList.remove('active', 'complete');
                    progressBar.style.width = '0%';
                }
            }, 500);
        }

        if (overlay) {
            overlay.classList.remove('active');
        }

        isVisible = false;
    }

    function setProgress(percent) {
        if (!progressBar) init();
        if (progressBar) {
            const p = Math.min(100, Math.max(0, percent));
            progressBar.style.width = p + '%';
        }
    }

    function simulateProgress() {
        clearInterval(progressInterval);
        let width = 5;
        progressInterval = setInterval(function () {
            if (width >= 88) {
                clearInterval(progressInterval);
                progressInterval = null;
                return;
            }
            width += Math.random() * 12;
            if (width > 88) width = 88;
            if (progressBar) {
                progressBar.style.width = width + '%';
            }
        }, 180);
    }

    function scheduleFallback() {
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(function () {
            if (isVisible) {
                console.warn('[PageLoader] Fallback auto-hide triggered.');
                hide();
            }
        }, FALLBACK_DELAY);
    }

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Show loader on page start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            show();
        });
    } else {
        show();
    }

    // Do NOT auto-hide on window.load.
    // Pages should call PageLoader.hide() when they are actually ready.

    // Expose public API
    return {
        show: show,
        hide: hide,
        start: start,
        complete: complete,
        setProgress: setProgress
    };
})();
