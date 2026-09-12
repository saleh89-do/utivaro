/* UI adapters for the existing Utivaro tool pages. */
(function () {
  'use strict';
  const C = window.UtivaroCore, $ = id => document.getElementById(id);
  if (!C) return;
  const text = (id,value) => { if ($(id)) $(id).textContent = value; };
  const status = (id,message,error = false) => { const el = $(id); if (!el) return; el.textContent = message; el.className = 'status ' + (error ? 'error' : 'success'); el.setAttribute('role','status'); };
  const show = (id,display) => { if ($(id)) $(id).style.display = display; };
  const event = (name,category = '') => document.dispatchEvent(new CustomEvent('utivaro:tool',{detail:{event:name,tool:location.pathname.split('/').pop().replace(/\.html$/,''),category}}));
  const fill = array => { if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') throw new Error('Secure randomness is unavailable. Use a current browser over HTTPS.'); window.crypto.getRandomValues(array); };
  const today = () => { const d = new Date(); return `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const number = (id,name) => C.finite($(id).value,name);
  const failure = (id,e) => { status(id,e.message,true); event('tool_error','validation'); };

  if ($('jsonInput')) {
    function run(mode) {
      event('tool_start');
      try {
        const raw = $('jsonInput').value;
        if (mode === 'validate') { C.jsonTokens(raw); $('jsonOutput').value = ''; }
        else $('jsonOutput').value = C.formatJSON(raw,mode === 'minify' ? '' : $('jsonIndent').value === 'tab' ? '\t' : ' '.repeat(Number($('jsonIndent').value)));
        status('jsonStatus',mode === 'validate' ? 'Valid JSON. Values have not been changed.' : 'Valid JSON. Original values preserved.'); event('tool_success');
      } catch (e) { $('jsonOutput').value = ''; failure('jsonStatus',e); }
    }
    window.formatJSON = () => run('format'); window.minifyJSON = () => run('minify'); window.validateJSON = () => run('validate');
    window.clearJSON = () => { $('jsonInput').value = ''; $('jsonOutput').value = ''; status('jsonStatus',''); $('jsonInput').focus(); };
    $('jsonInput').addEventListener('input',() => { $('jsonOutput').value = ''; status('jsonStatus',''); });
  }
  if ($('birthDate')) {
    if (!$('ageDate').value) $('ageDate').value = today();
    const resetAge = () => { show('ageMessage','none'); show('ageResult','none'); show('ageStats','none'); };
    window.calculateAge = () => {
      resetAge(); event('tool_start');
      try {
        const a = C.age($('birthDate').value,$('ageDate').value);
        const plural = (n,word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        text('exactAge',[plural(a.years,'year'),plural(a.months,'month'),plural(a.days,'day')].join(', '));
        text('totalMonths',(a.totalDays / 30.436875).toLocaleString('en-US',{maximumFractionDigits:1}));
        text('totalWeeks',(a.totalDays / 7).toLocaleString('en-US',{maximumFractionDigits:1}));
        text('totalDays',a.totalDays.toLocaleString('en-US')); text('nextBirthday',a.nextBirthday === 0 ? 'Today' : plural(a.nextBirthday,'day'));
        show('ageResult','block'); show('ageStats','grid'); event('tool_success');
      } catch (e) { text('ageMessage',e.message); show('ageMessage','block'); event('tool_error','validation'); }
    };
    window.clearAgeCalculator = () => { $('birthDate').value = ''; $('ageDate').value = today(); resetAge(); };
    ['birthDate','ageDate'].forEach(id => $(id).addEventListener('input',resetAge));
  }
  if ($('dateMessage') && $('startDate')) {
    window.calculateDateDifference = () => {
      show('dateStats','none'); event('tool_start');
      try {
        const signed = C.between(C.parseDate($('startDate').value),C.parseDate($('endDate').value)), days = Math.abs(signed);
        [['daysResult',days],['weeksResult',days/7],['monthsResult',days/30.436875],['hoursResult',days*24]].forEach(([id,n]) => text(id,n.toLocaleString('en-US',{maximumFractionDigits:2})));
        text('dateMessage',signed === 0 ? 'The dates are the same.' : `${days} ${days === 1 ? 'day separates' : 'days separate'} these dates.${signed < 0 ? ' The end date is before the start date.' : ''}`);
        show('dateStats','grid'); event('tool_success');
      } catch (e) { text('dateMessage',e.message); event('tool_error','validation'); }
    };
    window.clearDates = () => { $('startDate').value = ''; $('endDate').value = ''; show('dateStats','none'); text('dateMessage','Select two dates.'); };
    ['startDate','endDate'].forEach(id => $(id).addEventListener('change',() => { if ($('startDate').value && $('endDate').value) window.calculateDateDifference(); else show('dateStats','none'); }));
  }
  if ($('rngMin')) {
    window.generateRandomNumbers = () => {
      text('rngOutput',''); event('tool_start');
      try {
        const results = C.randomNumbers($('rngMin').value,$('rngMax').value,$('rngQuantity').value,$('rngDecimals').value,$('rngUnique').checked,fill);
        text('rngOutput',results.join('\n')); status('rngStatus',`Generated ${results.length} ${results.length === 1 ? 'number' : 'numbers'}.`); event('tool_success');
      } catch (e) { failure('rngStatus',e); }
    };
    ['rngMin','rngMax','rngQuantity','rngDecimals','rngUnique'].forEach(id => $(id).addEventListener('input',() => { text('rngOutput',''); status('rngStatus','Settings changed. Select Generate Numbers.'); }));
    window.generateRandomNumbers();
  }
  if ($('percentageRate')) {
    const perform = (id,fn) => { event('tool_start'); try { text(id,fn()); event('tool_success'); } catch(e) { text(id,e.message); event('tool_error','validation'); } };
    window.calculatePercentage = () => perform('percentageResult',() => C.formatNumber((number('percentageRate','Percentage') / 100) * number('percentageValue','Value')));
    window.calculatePercentageRatio = () => perform('ratioResult',() => { const p = number('partValue','Part'), w = number('wholeValue','Whole'); if (w === 0) throw new Error('Whole must not be zero.'); return C.formatNumber((p / w) * 100) + '%'; });
    window.calculatePercentageChange = () => perform('changeResult',() => {
      const old = number('oldValue','Original value'), next = number('newValue','New value');
      if (old === 0) throw new Error('The original value must not be zero.');
      const n = ((next - old) / Math.abs(old)) * 100;
      const value = C.formatNumber(Math.abs(n)); return n === 0 ? 'No change' : value + (n > 0 ? '% increase' : '% decrease');
    });
  }
  if ($('tipBill')) {
    function errorBox() { if (!$('tipStatus')) { const el = document.createElement('div'); el.id = 'tipStatus'; el.className = 'status'; $('tipBill').closest('.tool-box').appendChild(el); } }
    errorBox();
    window.calculateTip = () => {
      event('tool_start');
      try {
        const bill = number('tipBill','Bill'), pct = number('tipPercent','Tip'), people = C.integer($('tipPeople').value,1,1000000,'People');
        if (bill < 0 || pct < 0) throw new Error('Bill and tip percentage must not be negative.');
        const tip = bill * (pct / 100), total = bill + tip;
        [tip,total,tip/people,total/people].forEach(C.formatNumber);
        const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
        [['tipAmount',tip],['tipTotal',total],['tipPerPerson',tip/people],['totalPerPerson',total/people]].forEach(([id,n]) => text(id,money(n)));
        status('tipStatus',''); event('tool_success');
      } catch(e) { ['tipAmount','tipTotal','tipPerPerson','totalPerPerson'].forEach(id => text(id,'—')); failure('tipStatus',e); }
    };
    window.setTip = n => { $('tipPercent').value = n; window.calculateTip(); };
    window.clearTip = () => { $('tipBill').value = ''; $('tipPercent').value = '20'; $('tipPeople').value = '1'; ['tipAmount','tipTotal','tipPerPerson','totalPerPerson'].forEach(id => text(id,'—')); status('tipStatus','Enter a bill to calculate.'); $('tipBill').focus(); };
    ['tipBill','tipPercent','tipPeople'].forEach(id => $(id).addEventListener('input',window.calculateTip));
  }
  if ($('uuidQuantity')) {
    if (!$('uuidStatus')) { const el = document.createElement('div'); el.id = 'uuidStatus'; $('uuidOutput').after(el); }
    window.generateUUIDs = () => {
      text('uuidOutput',''); event('tool_start');
      try {
        const qty = C.integer($('uuidQuantity').value,1,100), output = [];
        for (let i = 0; i < qty; i++) {
          const bytes = new Uint8Array(16); fill(bytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
          const h = Array.from(bytes,b => b.toString(16).padStart(2,'0')).join('');
          let id = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
          if ($('uuidNoHyphens').checked) id = id.replace(/-/g,''); if ($('uuidUppercase').checked) id = id.toUpperCase(); output.push(id);
        }
        text('uuidOutput',output.join('\n')); status('uuidStatus',`Generated ${qty} UUIDs.`); event('tool_success');
      } catch(e) { failure('uuidStatus',e); }
    }; window.generateUUIDs();
  }
  if ($('passwordLength')) {
    const sets = {lowercase:'abcdefghijklmnopqrstuvwxyz',uppercase:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',numbers:'0123456789',symbols:'!@#$%^&*()-_=+[]{};:,.?/'};
    const pick = max => Number(C.randomBelow(BigInt(max),fill));
    window.generatePassword = () => {
      text('passwordOutput',''); $('copyPassword').disabled = true; $('strengthFill').style.width = '0%'; event('tool_start');
      try {
        const length = C.integer($('passwordLength').value,6,64,'Length');
        const active = Object.keys(sets).filter(id => $(id).checked).map(id => $('excludeAmbiguous').checked ? sets[id].replace(/[Il1O0o|]/g,'') : sets[id]);
        if (!active.length) throw new Error('Select at least one character type.');
        const pool = active.join(''), chars = active.map(s => s[pick(s.length)]);
        while (chars.length < length) chars.push(pool[pick(pool.length)]);
        for (let i = chars.length - 1; i > 0; i--) { const j = pick(i + 1); [chars[i],chars[j]] = [chars[j],chars[i]]; }
        text('passwordOutput',chars.join('')); $('copyPassword').disabled = false;
        // A length-based guide avoids overstating exact entropy of constrained outputs.
        const label = length >= 20 ? 'Long' : length >= 14 ? 'Medium length' : 'Short';
        status('passwordStrength',`${label} · ${length} characters. Use a unique password for each account.`);
        $('strengthFill').style.width = Math.min(100,length / 24 * 100) + '%'; event('tool_success');
      } catch(e) { failure('passwordStrength',e); }
    };
    $('passwordLength').addEventListener('input',() => { text('passwordLengthValue',$('passwordLength').value); text('passwordLengthBadge',$('passwordLength').value); });
    ['passwordLength','lowercase','uppercase','numbers','symbols','excludeAmbiguous'].forEach(id => $(id).addEventListener('input',() => { text('passwordOutput',''); text('passwordStrength','Settings changed. Generate a new password.'); $('copyPassword').disabled = true; $('strengthFill').style.width = '0%'; }));
    window.generatePassword();
  }
})();
