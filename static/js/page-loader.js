const PageLoader = (function () {
    let progressBar = null;
    let overlay = null;
    let isVisible = false;
    let progressInterval = null;
    let fallbackTimer = null;
    let windowLoadHandled = false;

    const FALLBACK_DELAY = 15000; // 15 seconds safe ceiling

    function init() {
        progressBar = document.getElementById('page-progress-bar');
        overlay = document.getElementById('page-loader-overlay');

        if (!progressBar) {
            // Auto create top progress bar if not present yet
            progressBar = document.createElement('div');
            progressBar.id = 'page-progress-bar';
            const target = document.body || document.documentElement;
            if (target) {
                target.insertBefore(progressBar, target.firstChild);
            }
        }
        return !!progressBar;
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
            progressBar.style.width = '10%';
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
        show();
    }

    function complete() {
        hide();
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
        let width = 12;
        if (progressBar) progressBar.style.width = width + '%';
        progressInterval = setInterval(function () {
            if (width >= 85) {
                if (width < 93) {
                    width += 0.5;
                    if (progressBar) progressBar.style.width = width + '%';
                }
                return;
            }
            width += Math.random() * 12 + 4;
            if (width > 85) width = 85;
            if (progressBar) {
                progressBar.style.width = width + '%';
            }
        }, 160);
    }

    function scheduleFallback() {
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(function () {
            if (isVisible) {
                console.warn('[PageLoader] Safety fallback auto-hide triggered after 15s.');
                hide();
            }
        }, FALLBACK_DELAY);
    }

    // On window load, don't immediately hide if page has async data to fetch; provide grace period
    function handleWindowLoad() {
        if (windowLoadHandled) return;
        windowLoadHandled = true;
        setTimeout(function () {
            if (isVisible) {
                hide();
            }
        }, 7000);
    }

    window.addEventListener('load', handleWindowLoad);

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            init();
            show();
        });
    } else {
        init();
        show();
    }

    return {
        show: show,
        hide: hide,
        start: start,
        complete: complete,
        setProgress: setProgress
    };
})();