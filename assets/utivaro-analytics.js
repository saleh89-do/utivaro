/* Utivaro usage measurement 2026-09-14.1. Uses the existing Google tag.
   Only fixed identifiers, bounded counts and fixed categories are forwarded.
   Inputs, search terms, filenames, result values and raw errors stay local. */
(function () {
  'use strict';
  if (window.UtivaroAnalytics) return;
  const VERSION = '2026-09-14.1', ID = 'G-QEJKW6BQMH';
  const groups = {
    'age-calculator':'calculators', 'percentage-calculator':'calculators',
    'days-between-dates':'calculators', 'tip-calculator':'calculators',
    'base64':'developer', 'json-formatter':'developer', 'uuid-generator':'developer',
    'password-generator':'generators', 'random-number-generator':'generators',
    'word-counter':'text', 'character-counter':'text', 'unit-converter':'converters',
    'color-picker':'images', 'heic-to-jpg':'images', 'image-resizer':'images',
    'jpg-to-webp':'images', 'webp-to-jpg':'images'
  };
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const slug = path.startsWith('/tools/') ? path.slice(7) : '';
  const tool = Object.prototype.hasOwnProperty.call(groups, slug) ? slug : '';
  const home = path === '/' || path === '/index';
  const names = new Set(['tool_start','tool_success','tool_error','tool_cancel']);
  const categories = new Set(['validation','file_validation','image_decode','image_processing','processing']);
  const reasons = new Set(['cleared','file_changed','settings_changed','superseded']);
  const continuous = new Set(['tip-calculator','unit-converter','word-counter','character-counter','color-picker']);
  const debug = new URLSearchParams(location.search).get('utivaro_debug') === '1';
  let queued = [], timer = null;

  // The owner requested activation. A pre-existing false value remains an opt-out.
  if (window.UTIVARO_ENABLE_TOOL_ANALYTICS === undefined) window.UTIVARO_ENABLE_TOOL_ANALYTICS = true;
  function enabled() {
    return window.UTIVARO_ENABLE_TOOL_ANALYTICS === true &&
      /^(www\.)?utivaro\.com$/.test(location.hostname) &&
      window['ga-disable-' + ID] !== true && navigator.globalPrivacyControl !== true &&
      typeof window.gtag === 'function';
  }
  function cleanReferrer() {
    try { const u = new URL(document.referrer); return /^https?:$/.test(u.protocol) ? u.origin + '/' : ''; }
    catch (_) { return ''; }
  }
  function send(name, parameters) {
    if (!enabled()) return;
    const params = Object.assign({
      send_to: ID, measurement_version: VERSION,
      page_location: location.origin + (home ? '/' : path),
      page_referrer: cleanReferrer()
    }, parameters);
    if (debug) params.debug_mode = true;
    // Analytics failures must never interrupt a calculation, image export or click.
    try { window.gtag('event', name, params); } catch (_) {}
  }
  function reset() { if (timer !== null) clearTimeout(timer); timer = null; queued = []; }
  function flush() {
    const batch = queued; reset();
    // An unfinished edit is not reported as a completed attempt.
    if (batch.length === 2) batch.forEach(item => send(item.name, item.params));
  }
  function track(name, detail) {
    if (!tool) return;
    if (name === 'tool_reset') { reset(); return; }
    if (!names.has(name)) return;
    detail = detail && typeof detail === 'object' ? detail : {};
    if (!enabled()) { reset(); return; }
    const phase = detail.phase === 'file_selection' ? 'file_selection' : 'operation';
    const mode = ['button','input','sample'].includes(detail.interaction) ? detail.interaction :
      (continuous.has(tool) ? 'input' : 'button');
    const params = {tool_name:tool, tool_group:groups[tool], interaction_mode:mode, operation_phase:phase};
    if (name === 'tool_error') params.error_category = categories.has(detail.category) ? detail.category : 'processing';
    if (name === 'tool_cancel') params.cancel_reason = reasons.has(detail.category) ? detail.category : 'superseded';
    if (mode === 'input' && phase === 'operation' && name !== 'tool_cancel') {
      if (timer !== null) clearTimeout(timer);
      if (name === 'tool_start') queued = [{name:name,params:params}];
      else if (queued.length) queued = [queued[0], {name:name,params:params}];
      timer = setTimeout(flush, 650);
      return;
    }
    flush(); send(name, params);
  }
  window.UtivaroAnalytics = Object.freeze({version:VERSION, track:track, reset:reset, enabled:enabled});
  document.addEventListener('utivaro:tool', e => {
    const d = e.detail;
    // Derive the tool from an allowlisted route; never forward detail.tool or arbitrary fields.
    if (d && typeof d === 'object') track(d.event, d);
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function ready() {
    // Word Counter's existing listener updates the UI before this listener runs.
    const text = document.getElementById('textInput');
    if (tool === 'word-counter' && text) text.addEventListener('input', () => {
      if (!text.value.length) { reset(); return; }
      track('tool_start', {interaction:'input'});
      const count = document.getElementById('wordCount');
      track(count && Number.isFinite(Number(count.textContent)) ? 'tool_success' : 'tool_error',
        {interaction:'input',category:'processing'});
    });

    const input = document.getElementById('toolSearch') || document.querySelector('input[type="search"]');
    const area = document.getElementById('all-tools') || document.getElementById('toolsGrid');
    if (home && input && area) {
      let searchTimer = null, last = '';
      const clearSearchTimer = () => { if (searchTimer !== null) clearTimeout(searchTimer); searchTimer = null; };
      const search = () => {
        clearSearchTimer();
        const q = input.value.trim().toLowerCase();
        if (!q) { last = ''; return; }
        if (q === last || !enabled()) return;
        last = q; // In-memory deduplication only. The query is never sent or persisted.
        const items = Array.from(area.querySelectorAll('[data-utivaro-search-item]'));
        const count = Math.min(17, items.filter(item => !item.hidden).length);
        send('tool_search', {tool_name:'tool-directory',tool_group:'directory',
          search_result_count:count,search_has_results:count > 0});
      };
      input.addEventListener('input', () => {
        clearSearchTimer();
        if (!input.value.trim()) { last = ''; return; }
        searchTimer = setTimeout(search, 650);
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
      if (input.form) input.form.addEventListener('submit', search);
      area.addEventListener('click', e => { if (e.target.closest('a[href]')) search(); });
      window.addEventListener('pagehide', () => { if (searchTimer !== null) search(); });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && searchTimer !== null) search();
      });
    }
    const downloads = {'image-resizer':'resizeDownload','jpg-to-webp':'jpgWebpDownload',
      'heic-to-jpg':'heicDownload','webp-to-jpg':'downloadJPG'};
    const download = tool && document.getElementById(downloads[tool]);
    if (download) document.addEventListener('click', e => {
      if (e.defaultPrevented || (e.button !== undefined && e.button !== 0)) return;
      if (!(e.target instanceof Element) || e.target.closest('a[download]') !== download) return;
      if (!/^blob:/.test(download.getAttribute('href') || '')) return;
      for (let el = download; el; el = el.parentElement) {
        if (el.hidden || el.getAttribute('aria-disabled') === 'true' ||
          getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return;
      }
      const match = /\.(jpg|jpeg|png|webp)$/i.exec(download.getAttribute('download') || '');
      if (!match) return;
      send('result_download_click', {tool_name:tool,tool_group:groups[tool],
        download_format:match[1].toLowerCase().replace('jpeg','jpg')});
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
