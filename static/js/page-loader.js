/**
 * 📦 Page Loader / Progress Bar Module
 * Store Management System
 * 
 * Usage:
 *   PageLoader.show()          - Show full overlay + start progress bar
 *   PageLoader.hide()          - Hide full overlay + complete progress bar
 *   PageLoader.start()         - Start progress bar only (for AJAX)
 *   PageLoader.complete()      - Complete progress bar only (for AJAX)
 *   PageLoader.setProgress(n)  - Set progress bar to n% (0-100)
 */

const PageLoader = (function () {
    let progressBar = null;
    let overlay = null;
    let isVisible = false;
    let progressInterval = null;

    function init() {
        progressBar = document.getElementById('page-progress-bar');
        overlay = document.getElementById('page-loader-overlay');

        if (!progressBar && !overlay) {
            console.warn('[PageLoader] Elements not found. Ensure loader HTML is present.');
            return false;
        }
        return true;
    }

    function show() {
        if (!init()) return;

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
    }

    function hide() {
        if (!progressBar && !overlay) init();

        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.classList.add('complete');

            setTimeout(function () {
                if (progressBar) {
                    progressBar.classList.remove('active', 'complete');
                    progressBar.style.width = '0%';
                }
            }, 600);
        }

        if (overlay) {
            overlay.classList.remove('active');
        }

        clearInterval(progressInterval);
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

        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.classList.add('complete');

            setTimeout(function () {
                if (progressBar) {
                    progressBar.classList.remove('active', 'complete');
                    progressBar.style.width = '0%';
                }
            }, 600);
        }
        clearInterval(progressInterval);
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
        let width = 0;
        progressInterval = setInterval(function () {
            if (width >= 90) {
                clearInterval(progressInterval);
                return;
            }
            width += Math.random() * 15;
            if (width > 90) width = 90;
            if (progressBar) {
                progressBar.style.width = width + '%';
            }
        }, 200);
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
            window.addEventListener('load', function () {
                hide();
            });
        });
    } else {
        show();
        window.addEventListener('load', function () {
            hide();
        });
    }

    // Expose public API
    return {
        show: show,
        hide: hide,
        start: start,
        complete: complete,
        setProgress: setProgress
    };
})();
