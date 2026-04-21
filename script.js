/* ========================================================
   VidGrab — JavaScript Controller (yt-dlp API)
   ======================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = window.location.origin;

    // DOM Elements
    const urlInput = document.getElementById('url-input');
    const btnStart = document.getElementById('btn-start');
    const btnClear = document.getElementById('btn-clear');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const nav = document.querySelector('.nav');
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    const processingSection = document.getElementById('processing-section');
    const resultSection = document.getElementById('result-section');
    const thumbImg = document.getElementById('thumb-img');
    const resultTitle = document.getElementById('result-title');
    const resultMeta = document.getElementById('result-meta');
    const resultDuration = document.getElementById('result-duration');
    const downloadTableBody = document.getElementById('download-table-body');
    const formatTabs = document.querySelectorAll('.format-tab');
    const faqItems = document.querySelectorAll('.faq-item');
    const navLinks = document.querySelectorAll('.nav-link');

    let currentVideoData = null;

    // ======== URL validation ========
    function isValidYouTubeURL(url) {
        const patterns = [
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\//,
            /^(https?:\/\/)?youtu\.be\//,
            /^(https?:\/\/)?(www\.)?youtube\.com\/embed\//,
            /^(https?:\/\/)?m\.youtube\.com\/watch\?/,
        ];
        return patterns.some(p => p.test(url.trim()));
    }

    // ======== Input handling ========
    urlInput.addEventListener('input', () => {
        btnClear.style.display = urlInput.value.length > 0 ? 'block' : 'none';
    });

    btnClear.addEventListener('click', () => {
        urlInput.value = '';
        btnClear.style.display = 'none';
        urlInput.focus();
        hideResults();
    });

    urlInput.addEventListener('paste', () => {
        setTimeout(() => {
            if (urlInput.value.trim() && isValidYouTubeURL(urlInput.value.trim())) {
                processURL();
            }
        }, 150);
    });

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') processURL();
    });

    btnStart.addEventListener('click', processURL);

    // ======== Process URL ========
    async function processURL() {
        const url = urlInput.value.trim();

        if (!url) {
            showToast('Please paste a YouTube URL', 'error');
            urlInput.focus();
            return;
        }

        if (!isValidYouTubeURL(url)) {
            showToast('Please enter a valid YouTube URL', 'error');
            return;
        }

        hideResults();
        processingSection.style.display = 'block';
        processingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btnStart.disabled = true;
        btnStart.innerHTML = `<span>Processing...</span>`;

        try {
            const response = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch video info');
            }

            currentVideoData = data;
            processingSection.style.display = 'none';
            displayResults(data);
            showToast('Video found! Choose a format to download.', 'success');
        } catch (err) {
            processingSection.style.display = 'none';
            showToast(err.message || 'Something went wrong. Try again.', 'error');
            console.error(err);
        } finally {
            btnStart.disabled = false;
            btnStart.innerHTML = `<span>Start</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        }
    }

    // ======== Display Results ========
    function displayResults(data) {
        thumbImg.src = data.thumbnail;
        thumbImg.alt = data.title;

        resultTitle.textContent = data.title;
        resultMeta.textContent = `Duration: ${data.duration} | Views: ${data.views} | By: ${data.author}`;
        resultDuration.textContent = data.duration;

        formatTabs.forEach(t => t.classList.remove('active'));
        document.getElementById('tab-video').classList.add('active');
        populateTable(data.videoFormats, 'video');

        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function populateTable(items, type) {
        downloadTableBody.innerHTML = '';

        if (!items || items.length === 0) {
            downloadTableBody.innerHTML = `
                <tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">
                    No ${type} formats available for this video.
                </td></tr>`;
            return;
        }

        items.forEach((item, index) => {
            const row = document.createElement('tr');
            row.classList.add('table-row-animate');
            row.style.animationDelay = `${index * 50}ms`;

            // Quality tags
            let tagHTML = '';
            const q = (item.quality || '').toLowerCase();
            if (q.includes('1080') || q.includes('320kbps')) {
                tagHTML = `<span class="quality-tag fhd">FHD</span>`;
            } else if (q.includes('720') || q.includes('256kbps')) {
                tagHTML = `<span class="quality-tag hd">HD</span>`;
            } else if (q.includes('1440')) {
                tagHTML = `<span class="quality-tag fhd">2K</span>`;
            } else if (q.includes('2160')) {
                tagHTML = `<span class="quality-tag fhd">4K</span>`;
            } else if (q.includes('4320')) {
                tagHTML = `<span class="quality-tag fhd">8K</span>`;
            }

            const audioNote = (type === 'video' && !item.hasAudio)
                ? ' <span style="color:var(--text-muted);font-size:0.72rem;">(video only — will merge audio)</span>'
                : '';

            const btnClass = type === 'audio' ? 'accent' : 'primary';

            row.innerHTML = `
                <td>
                    <span class="quality-label">
                        ${item.quality}${audioNote} ${tagHTML}
                    </span>
                </td>
                <td>${item.format || 'MP4'}</td>
                <td>${item.size || 'Unknown'}</td>
                <td>
                    <button class="btn-download ${btnClass}"
                        data-format-id="${item.formatId}"
                        data-has-audio="${item.hasAudio}"
                        data-ext="${item.ext || (type === 'audio' ? 'm4a' : 'mp4')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download
                    </button>
                </td>
            `;

            downloadTableBody.appendChild(row);
        });

        // Attach click handlers
        downloadTableBody.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => {
                const formatId = btn.getAttribute('data-format-id');
                const hasAudio = btn.getAttribute('data-has-audio') === 'true';
                const ext = btn.getAttribute('data-ext');
                handleDownload(formatId, hasAudio, ext);
            });
        });
    }

    function hideResults() {
        resultSection.style.display = 'none';
        processingSection.style.display = 'none';
    }

    // ======== Format Tabs ========
    formatTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            formatTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const format = tab.getAttribute('data-format');
            if (currentVideoData) {
                populateTable(
                    format === 'audio' ? currentVideoData.audioFormats : currentVideoData.videoFormats,
                    format
                );
            }
        });
    });

    // ======== Download ========
    function handleDownload(formatId, hasAudio, ext) {
        if (!currentVideoData) {
            showToast('No video data available', 'error');
            return;
        }

        showToast('Starting download...', 'success');

        const url = currentVideoData.originalUrl;
        const title = currentVideoData.title;

        // If video-only (no audio), use the merge endpoint to combine with best audio
        let downloadUrl;
        if (!hasAudio) {
            downloadUrl = `${API_BASE}/api/download-merge?url=${encodeURIComponent(url)}&formatId=${encodeURIComponent(formatId)}&title=${encodeURIComponent(title)}`;
        } else {
            downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&formatId=${encodeURIComponent(formatId)}&title=${encodeURIComponent(title)}&ext=${encodeURIComponent(ext)}`;
        }

        // Open in new tab to trigger browser download
        window.open(downloadUrl, '_blank');
    }

    // ======== FAQ Accordion ========
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isOpen = item.classList.contains('open');
            faqItems.forEach(i => i.classList.remove('open'));
            if (!isOpen) item.classList.add('open');
        });
    });

    // ======== Mobile Menu ========
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenuBtn.classList.toggle('active');
        nav.classList.toggle('open');
        document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenuBtn.classList.remove('active');
            nav.classList.remove('open');
            document.body.style.overflow = '';
        });
    });

    // ======== Nav link handling ========
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const id = link.id;
            if (id === 'nav-mp3') urlInput.placeholder = 'Paste YouTube link to convert to MP3...';
            else if (id === 'nav-mp4') urlInput.placeholder = 'Paste YouTube link to convert to MP4...';
            else urlInput.placeholder = 'Paste YouTube link here...';
            urlInput.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // ======== Scroll to Top ========
    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            scrollTopBtn.style.display = 'flex';
            setTimeout(() => scrollTopBtn.classList.add('visible'), 10);
        } else {
            scrollTopBtn.classList.remove('visible');
            setTimeout(() => { scrollTopBtn.style.display = 'none'; }, 300);
        }
    });

    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ======== Header scroll ========
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        header.style.background = window.scrollY > 50
            ? 'rgba(10, 10, 26, 0.95)'
            : 'rgba(10, 10, 26, 0.85)';
    });

    // ======== Toast ========
    let toastTimeout;
    function showToast(message, type = '') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    // ======== Scroll animations ========
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.feature-card, .step-card, .faq-item, .format-item, .tip-card').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${i % 6 * 0.1}s, transform 0.6s ease ${i % 6 * 0.1}s`;
        observer.observe(el);
    });

    const style = document.createElement('style');
    style.textContent = `.table-row-animate { animation: slide-in 0.3s ease forwards; opacity: 0; }`;
    document.head.appendChild(style);
});
