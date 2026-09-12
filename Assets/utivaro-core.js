/* Utivaro correctness fixes — 2026-09-11. No network or storage access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UtivaroCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  function finite(value, name = 'Value') {
    if (String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error(name + ' must be a finite number.');
    return Number(value);
  }
  function integer(value, min, max, name = 'Quantity') {
    const n = finite(value, name);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
    return n;
  }
  function formatNumber(value) {
    if (!Number.isFinite(value)) throw new Error('The result is outside the supported numeric range. Use smaller values.');
    return String(Number(value.toPrecision(12)));
  }
  function daysInMonth(y, m) { return [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31][m - 1]; }
  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error('Enter a valid date from year 0001 to 9999.');
    const [y,m,d] = match.slice(1).map(Number);
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y,m)) throw new Error('Enter a valid calendar date.');
    return {y,m,d};
  }
  function stamp(a) { const date = new Date(0); date.setUTCFullYear(a.y,a.m - 1,a.d); date.setUTCHours(0,0,0,0); return date.getTime(); }
  function between(a,b) { return Math.round((stamp(b) - stamp(a)) / DAY); }
  function addMonthsClamped(a, count) {
    const month = a.y * 12 + a.m - 1 + count, y = Math.floor(month / 12), m = month % 12 + 1;
    return {y,m,d:Math.min(a.d, daysInMonth(y,m))};
  }
  function age(birth, target) {
    const b = typeof birth === 'string' ? parseDate(birth) : birth;
    const t = typeof target === 'string' ? parseDate(target) : target;
    if (stamp(t) < stamp(b)) throw new Error('The calculation date must be on or after the date of birth.');
    let wholeMonths = (t.y - b.y) * 12 + t.m - b.m;
    if (stamp(addMonthsClamped(b,wholeMonths)) > stamp(t)) wholeMonths--;
    const days = between(addMonthsClamped(b,wholeMonths),t);
    let birthday = {y:t.y,m:b.m,d:Math.min(b.d,daysInMonth(t.y,b.m))};
    if (stamp(birthday) < stamp(t)) birthday = {y:t.y + 1,m:b.m,d:Math.min(b.d,daysInMonth(t.y + 1,b.m))};
    return {years:Math.floor(wholeMonths / 12),months:wholeMonths % 12,days,totalDays:between(b,t),nextBirthday:between(t,birthday)};
  }

  // Validate syntax, then format the ORIGINAL tokens. Never serialize parsed Numbers.
  // This preserves large numbers, exponent spelling, -0, duplicate keys and string escapes.
  function jsonTokens(raw) {
    if (!raw.trim()) throw new Error('Enter JSON to continue.');
    if (raw.length > 5 * 1024 * 1024) throw new Error('Use JSON text smaller than 5 million characters.');
    JSON.parse(raw);
    return raw.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  }
  function formatJSON(raw, indent = '  ') {
    const tokens = jsonTokens(raw);
    if (!indent) return tokens.join('');
    if (!['  ','    ','\t'].includes(indent)) throw new Error('Choose a supported indentation.');
    const output = []; let level = 0, outputLength = 0;
    function push(...pieces) {
      for (const piece of pieces) {
        outputLength += piece.length;
        if (outputLength > 20 * 1024 * 1024) throw new Error('Formatted output would exceed 20 million characters. Use Minify or a smaller input.');
        output.push(piece);
      }
    }
    const line = () => '\n' + indent.repeat(level);
    tokens.forEach((token, i) => {
      if (token === '{' || token === '[') {
        push(token); level++;
        if (level > 200) throw new Error('Formatting supports up to 200 nesting levels. Use Minify or a less deeply nested input.');
        if (tokens[i + 1] !== (token === '{' ? '}' : ']')) push(line());
      } else if (token === '}' || token === ']') {
        level--;
        if (tokens[i - 1] !== (token === '}' ? '{' : '[')) push(line());
        push(token);
      } else if (token === ',') push(',',line());
      else if (token === ':') push(': ');
      else push(token);
    });
    return output.join('');
  }

  function decimalParts(raw) {
    const text = String(raw).trim();
    if (text.length > 100 || !Number.isFinite(Number(text))) throw new Error('Enter a finite decimal number.');
    const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
    if (!m) throw new Error('Enter a valid decimal number.');
    const fraction = m[3] || m[4] || '', exponent = Number(m[5] || 0);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 324) throw new Error('The decimal exponent is outside the supported range.');
    return {value:BigInt((m[2] || '0') + fraction) * (m[1] === '-' ? -1n : 1n),power:exponent - fraction.length};
  }
  function floorDiv(a,b) { const q = a / b; return a < 0n && a % b !== 0n ? q - 1n : q; }
  function ceilDiv(a,b) { return -floorDiv(-a,b); }
  function scaledBound(raw, decimals, upper) {
    const p = decimalParts(raw), power = p.power + decimals;
    return power >= 0 ? p.value * 10n ** BigInt(power) : (upper ? floorDiv : ceilDiv)(p.value,10n ** BigInt(-power));
  }
  function compareDecimal(a,b) {
    const x = decimalParts(a), y = decimalParts(b), p = Math.min(x.power,y.power);
    const left = x.value * 10n ** BigInt(x.power - p), right = y.value * 10n ** BigInt(y.power - p);
    return left < right ? -1 : left > right ? 1 : 0;
  }
  function randomBelow(limit, fill) {
    if (limit < 1n) throw new Error('Random range must be positive.');
    if (limit === 1n) return 0n;
    const bits = (limit - 1n).toString(2).length, bytes = new Uint8Array(Math.ceil(bits / 8));
    for (let attempt = 0; attempt < 1024; attempt++) {
      fill(bytes); bytes[0] &= 255 >>> (bytes.length * 8 - bits);
      let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
      if (n < limit) return n;
    }
    throw new Error('Random generation failed. Please try again.');
  }
  function scaledText(n, decimals) {
    const sign = n < 0n ? '-' : '', s = (n < 0n ? -n : n).toString().padStart(decimals + 1,'0');
    return sign + (decimals ? s.slice(0,-decimals) + '.' + s.slice(-decimals) : s);
  }
  function randomNumbers(min, max, quantity, decimals, unique, fill) {
    const qty = integer(quantity,1,100), dec = integer(decimals,0,8,'Decimal places');
    if (compareDecimal(min,max) > 0) throw new Error('Maximum must be at least the minimum.');
    const low = scaledBound(min,dec,false), high = scaledBound(max,dec,true), count = high - low + 1n;
    if (count <= 0n) throw new Error('This range contains no values at the selected decimal precision. Widen the range or increase decimal places.');
    if (unique && BigInt(qty) > count) throw new Error(`This range has only ${count} distinct values at the selected precision.`);
    const swaps = new Map(), results = [];
    for (let i = 0; i < qty; i++) {
      const remaining = unique ? count - BigInt(i) : count, pick = randomBelow(remaining,fill);
      const selected = unique ? (swaps.get(pick) ?? pick) : pick;
      if (unique) { const last = remaining - 1n; swaps.set(pick,swaps.get(last) ?? last); swaps.delete(last); }
      results.push(scaledText(low + selected,dec));
    }
    return results;
  }
  function graphemes(text) {
    return typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),s => s.segment) : Array.from(text);
  }
  // New files, Clear and settings changes invalidate work already in flight.
  class RequestState {
    constructor() { this.version = 0; this.file = null; this.image = null; }
    reset(file = null) { this.version++; this.file = file; this.image = null; return this.version; }
    invalidate() { return ++this.version; }
    current(token) { return this.version === token; }
    loaded(token,image) { if (!this.current(token)) return false; this.image = image; return true; }
    snapshot() { if (!this.file || !this.image) throw new Error('Choose a valid image and wait for it to load.'); return {token:++this.version,file:this.file,image:this.image}; }
  }
  return {finite,integer,formatNumber,daysInMonth,parseDate,stamp,between,addMonthsClamped,age,jsonTokens,formatJSON,randomNumbers,scaledBound,scaledText,randomBelow,graphemes,RequestState};
});
