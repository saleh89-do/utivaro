/* Safe file switching and cancellation for Utivaro image tools. */
(function () {
  'use strict';
  const C = window.UtivaroCore, $ = id => document.getElementById(id);
  if (!C) return;
  const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const config = $('resizeInput') ? {p:'resize',run:'resizeImage',clear:'clearResize',stats:'resizeResults',heic:false} : $('jpgWebpInput') ? {p:'jpgWebp',run:'convertJPGToWebP',clear:'clearJPGWebP',stats:'jpgWebpStats',heic:false} : $('heicInput') ? {p:'heic',run:'convertHEIC',clear:'clearHEIC',stats:'heicStats',heic:true} : null;
  if (!config) return;
  const {p} = config, state = new C.RequestState(); let sourceURL = '', outputURL = '';
  const button = document.querySelector(`button[onclick="${config.run}()"]`);
  const report = (message,error = false) => { $(p+'Status').textContent = message; $(p+'Status').className = 'status ' + (error ? 'error' : ''); $(p+'Status').setAttribute('role','status'); };
  const track = (name,category = '') => document.dispatchEvent(new CustomEvent('utivaro:tool',{detail:{event:name,tool:location.pathname.split('/').pop().replace(/\.html$/,''),category}}));
  function clearOutput() {
    if (outputURL) URL.revokeObjectURL(outputURL); outputURL = '';
    $(p+'PreviewWrap').hidden = true; $(config.stats).hidden = true; $(p+'Download').hidden = true;
    $(p+'Download').removeAttribute('href'); $(p+'Preview').removeAttribute('src');
  }
  function reset(file = null) {
    const token = state.reset(file); clearOutput();
    if (sourceURL) URL.revokeObjectURL(sourceURL); sourceURL = '';
    if ($(p+'Controls')) $(p+'Controls').hidden = true;
    if (button) button.disabled = !config.heic || !file;
    return token;
  }
  function limits(file) {
    if (!file || file.size === 0) throw new Error('Choose a non-empty image file.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
    const permitted = p === 'resize' ? /\.(jpe?g|png|webp)$/i : p === 'jpgWebp' ? /\.jpe?g$/i : /\.(heic|heif)$/i;
    const types = p === 'resize' ? ['image/jpeg','image/png','image/webp'] : p === 'jpgWebp' ? ['image/jpeg'] : ['image/heic','image/heif'];
    if (!types.includes(file.type) && !permitted.test(file.name)) throw new Error('Choose a file in one of the supported image formats.');
  }
  $(p+'Input').addEventListener('change',e => {
    const file = e.target.files[0] || null, token = reset(file);
    if (!file) { report('Choose an image to begin.'); return; }
    try { limits(file); } catch(err) { reset(); report(err.message,true); return; }
    if (config.heic) { report(`Ready: ${bytes(file.size)}. Select Convert.`); return; }
    report('Opening image...'); sourceURL = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      if (!state.current(token)) return;
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40000000) { reset(); report('Use an image with no more than 40 million pixels.',true); return; }
      state.loaded(token,img);
      if (p === 'resize') { $('resizeWidth').value = img.naturalWidth; $('resizeHeight').value = img.naturalHeight; }
      $(p+'Controls').hidden = false; if (button) button.disabled = false;
      report(`Ready: ${img.naturalWidth} × ${img.naturalHeight} · ${bytes(file.size)}`);
    };
    img.onerror = () => { if (state.current(token)) { reset(); report('This image could not be opened. Choose another file.',true); } };
    img.src = sourceURL;
  });
  const quality = $(p+'Quality');
  quality.addEventListener('input',() => { $(p+'QualityValue').textContent = quality.value; invalidateSettings(); });
  function invalidateSettings() { state.invalidate(); clearOutput(); if (button) button.disabled = config.heic ? !state.file : !state.image; report('Settings changed. Convert again to update the result.'); }
  if (p === 'resize') {
    ['resizeWidth','resizeHeight'].forEach(id => $(id).addEventListener('input',() => {
      if (state.image && $('resizeLock').checked) {
        const ratio = state.image.naturalWidth / state.image.naturalHeight, n = Number($(id).value);
        if (Number.isFinite(n) && n > 0) $(id === 'resizeWidth' ? 'resizeHeight' : 'resizeWidth').value = Math.max(1,Math.round(id === 'resizeWidth' ? n / ratio : n * ratio));
      }
      invalidateSettings();
    }));
    ['resizeFormat','resizeLock'].forEach(id => $(id).addEventListener('change',invalidateSettings));
  }
  function canvasBlob(canvas,type,quality) {
    return new Promise((resolve,reject) => {
      try { canvas.toBlob(blob => { if (!blob || blob.type !== type) reject(new Error('Your browser cannot export this format. Choose a different format or browser.')); else resolve(blob); },type,quality); }
      catch(e) { reject(e); }
    });
  }
  window[config.run] = async function () {
    let request; clearOutput(); track('tool_start');
    try {
      if (config.heic) {
        if (!state.file) throw new Error('Choose a HEIC or HEIF file first.');
        request = {token:state.invalidate(),file:state.file};
      } else request = state.snapshot();
      const q = C.finite(quality.value,'Quality') / 100;
      if (q < 0 || q > 1) throw new Error('Choose a valid image quality.');
      if (button) button.disabled = true; report('Converting on your device...');
      let blob, type, width, height;
      if (config.heic) {
        if (typeof window.heic2any !== 'function') throw new Error('The HEIC converter could not load. Check your connection and try again.');
        const result = await window.heic2any({blob:request.file,toType:'image/jpeg',quality:q}); blob = Array.isArray(result) ? result[0] : result; type = 'image/jpeg';
        if (!blob || blob.type !== type) throw new Error('This file could not be converted to JPG.');
      } else {
        const original = request.image;
        width = p === 'resize' ? C.integer($('resizeWidth').value,1,10000,'Width') : original.naturalWidth;
        height = p === 'resize' ? C.integer($('resizeHeight').value,1,10000,'Height') : original.naturalHeight;
        if (width * height > 40000000) throw new Error('Use no more than 40 million output pixels.');
        type = p === 'resize' ? $('resizeFormat').value : 'image/webp';
        if (type === 'original') type = ['image/jpeg','image/png','image/webp'].includes(request.file.type) ? request.file.type : 'image/png';
        if (!['image/jpeg','image/png','image/webp'].includes(type)) throw new Error('Choose a supported output format.');
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image processing is not available in this browser.');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height); }
        ctx.drawImage(original,0,0,width,height); blob = await canvasBlob(canvas,type,q);
        canvas.width = 0; canvas.height = 0;
      }
      if (!state.current(request.token)) return;
      outputURL = URL.createObjectURL(blob); $(p+'Preview').src = outputURL; $(p+'PreviewWrap').hidden = false;
      if (p === 'resize') {
        $('resizeOriginal').textContent = `${request.image.naturalWidth} × ${request.image.naturalHeight} · ${bytes(request.file.size)}`;
        $('resizeNew').textContent = `${width} × ${height} · ${bytes(blob.size)}`;
      } else { $(p+'Original').textContent = bytes(request.file.size); $(p+'Converted').textContent = bytes(blob.size); }
      $(config.stats).hidden = false;
      const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png', link = $(p+'Download');
      link.href = outputURL; link.download = `utivaro-${p === 'resize' ? 'resized' : 'converted'}.${ext}`; link.hidden = false;
      report('Image ready. Download your result.'); track('tool_success');
    } catch(e) {
      if (!request || state.current(request.token)) { clearOutput(); report(e.message || 'The image could not be processed. Try a smaller file.',true); track('tool_error','image_processing'); }
    } finally { if (!request || state.current(request.token)) { if (button) button.disabled = config.heic ? !state.file : !state.image; } }
  };
  window[config.clear] = () => { reset(); $(p+'Input').value = ''; report(''); };
  if (button) button.disabled = true;
})();
