/* Search, consistent visible-character counting, and local event hooks. */
(function () {
  'use strict';
  function ready() {
    const input = document.querySelector('input[type="search"]') || document.getElementById('toolSearch');
    const area = document.getElementById('all-tools') || document.getElementById('toolsGrid');
    if (input && area) {
      const items = Array.from(area.querySelectorAll('a[href]')).filter(a => /(?:^|\/)tools\//.test(a.getAttribute('href') || ''));
      const existingNote = document.getElementById('noToolsFound');
      const note = existingNote || document.createElement('p'); note.className = 'utivaro-search-status'; note.setAttribute('role','status'); note.setAttribute('aria-live','polite');
      if (!existingNote) area.prepend(note);
      const style = document.createElement('style'); style.textContent = '[data-utivaro-search-item][hidden]{display:none!important}.utivaro-search-status{grid-column:1/-1;color:#4b5563}'; document.head.appendChild(style);
      items.forEach(a => a.setAttribute('data-utivaro-search-item',''));
      const filter = () => {
        const q = input.value.trim().toLowerCase(); let count = 0;
        items.forEach(a => { const match = !q || (a.textContent + ' ' + (a.getAttribute('data-search') || '') + ' ' + a.getAttribute('href').replace(/[-/]/g,' ')).toLowerCase().includes(q); a.hidden = !match; if (match) count++; });
        note.hidden = false;
        note.textContent = count ? `${count} ${count === 1 ? 'tool' : 'tools'}${q ? ' found.' : ' available.'}` : 'No tools found. Try a different search.';
      };
      input.addEventListener('input',filter);
      input.addEventListener('keydown',e => { if (e.key === 'Enter') { e.preventDefault(); filter(); area.scrollIntoView({block:'start',behavior:'smooth'}); } });
      if (input.form) input.form.addEventListener('submit',e => { e.preventDefault(); filter(); area.scrollIntoView({block:'start'}); });
      document.querySelectorAll('a[href="#all-tools"],a[href="#tools"]').forEach(a => { if (/search/i.test(a.textContent)) a.addEventListener('click',filter); });
      filter();
    }
    const textInput = document.getElementById('textInput');
    if (textInput && window.UtivaroCore) {
      const update = () => {
        const chunks = window.UtivaroCore.graphemes(textInput.value);
        const all = document.getElementById('characterCount'), noSpaces = document.getElementById('characterNoSpaces');
        if (all) all.textContent = chunks.length;
        if (noSpaces) noSpaces.textContent = chunks.filter(s => !/^\s+$/.test(s)).length;
      };
      // Registered after the original shared counter so the displayed counts agree.
      textInput.addEventListener('input',update); update();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready); else ready();
  // Disabled by default. Enable only after the site's analytics/consent configuration
  // is reviewed. No inputs, file names, output values or raw exception text are sent.
  document.addEventListener('utivaro:tool',e => {
    const allowed = ['tool_start','tool_success','tool_error'];
    if (window.UTIVARO_ENABLE_TOOL_ANALYTICS === true && typeof window.gtag === 'function' && allowed.includes(e.detail?.event)) {
      window.gtag('event',e.detail.event,{tool_name:e.detail.tool,error_category:e.detail.category || undefined});
    }
  });
})();
