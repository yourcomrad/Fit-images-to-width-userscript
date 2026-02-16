// ==UserScript==
// @name         Fit Images to Width
// @description  Resize zoomed images to fit screen width without horizontal scroll
// @namespace    http://tampermonkey.net/
// @version      0.8
// @license      MIT
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SAFE_MARGIN = 32;    // buffer to prevent horizontal scroll from appearing
  const DEBOUNCE_MS = 250;   // debounce delay to avoid "jumps"
  const PROPS = ['maxWidth', 'width', 'height', 'boxSizing', 'transition'];

  function getVW() {
    return document.documentElement.clientWidth;
  }

  function saveOriginalProps(img) {
    if (!img || img.dataset._ctf_saved === '1') return;
    PROPS.forEach(p => {
      const key = `_ctf_orig_${p}`;
      const val = img.style[p] || null;
      if (val === null || val === '') {
        // store explicit marker for "not set"
        img.dataset[key] = '__CTF_NULL__';
      } else {
        img.dataset[key] = val;
      }
    });
    img.dataset._ctf_saved = '1';
  }

  function restoreSavedProps(img) {
    if (!img || img.dataset._ctf_saved !== '1') return;
    PROPS.forEach(p => {
      const key = `_ctf_orig_${p}`;
      const stored = img.dataset[key];
      if (stored === undefined) return;
      if (stored === '__CTF_NULL__') {
        try { img.style[p] = ''; } catch (e) {}
      } else {
        try { img.style[p] = stored; } catch (e) {}
      }
      delete img.dataset[key];
    });
    delete img.dataset._ctf_saved;
    delete img.dataset._ctf_adjusted;
  }

  function applyResize(img, targetPx) {
    if (!img) return;
    saveOriginalProps(img);

    // Avoid unnecessary reflows if already set to desired value
    const rect = img.getBoundingClientRect();
    if (Math.abs(rect.width - targetPx) <= 1 && img.dataset._ctf_adjusted === '1') {
      return;
    }

    // Temporarily disable transitions to prevent jump animation
    const prevTransition = img.style.transition || '';
    try { img.style.transition = 'none'; } catch (e) {}

    try {
      img.style.boxSizing = 'border-box';
      img.style.maxWidth = targetPx + 'px'; // primary constraint
      // do not set fixed height; only ensure auto to preserve proportions
      img.style.height = 'auto';
      // do not set style.width (let browser scale proportionally via max-width)
    } catch (e) { /* ignore */ }

    // force reflow once
    img.getBoundingClientRect();

    // restore transition back to previous value shortly after
    setTimeout(() => {
      try { img.style.transition = prevTransition; } catch (e) {}
    }, 30);

    img.dataset._ctf_adjusted = '1';
  }

  function adjustOrRestore(img) {
    if (!img || img.tagName !== 'IMG') return;
    const vw = getVW();
    const allowed = Math.max(32, vw - SAFE_MARGIN);

    // measure current visual rect
    const rect = img.getBoundingClientRect();

    if (rect.width > allowed) {
      // need to reduce proportionally — use maxWidth only so height stays correct
      applyResize(img, allowed);
      return;
    }

    // if we previously adjusted this img, and now it's within allowed width — restore only what we changed
    if (img.dataset._ctf_saved === '1' && img.dataset._ctf_adjusted === '1') {
      restoreSavedProps(img);
    }
  }

  function scheduleAdjust(img) {
    if (!img || img.tagName !== 'IMG') return;
    if (img._ctf_timer) clearTimeout(img._ctf_timer);
    img._ctf_timer = setTimeout(() => {
      try { adjustOrRestore(img); } catch (e) { /* silent */ }
      if (img._ctf_timer) { clearTimeout(img._ctf_timer); delete img._ctf_timer; }
    }, DEBOUNCE_MS);
  }

  // Click handler — do not block default behavior; just schedule checks
  document.addEventListener('click', function (e) {
    const img = e.target && e.target.closest ? e.target.closest('img') : null;
    if (!img) return;
    scheduleAdjust(img);
  }, true);

  // MutationObserver: when overlays/lightboxes are added, schedule checks for their images
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes || []) {
        if (!n || n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') {
          scheduleAdjust(n);
        } else {
          const imgs = n.querySelectorAll && n.querySelectorAll('img');
          if (imgs && imgs.length) imgs.forEach(im => scheduleAdjust(im));
        }
      }
    }
  });

  try {
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }

  // dblclick manual restore (keeps behavior non-invasive)
  document.addEventListener('dblclick', function (e) {
    const img = e.target && e.target.closest ? e.target.closest('img') : null;
    if (!img) return;
    restoreSavedProps(img);
  }, true);

})();
