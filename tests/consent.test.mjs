import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridge = fs.readFileSync(path.join(root, 'assets/utivaro-consent.js'), 'utf8');
const analytics = fs.readFileSync(path.join(root, 'assets/utivaro-analytics.js'), 'utf8');
const ID = 'G-QEJKW6BQMH';
const values = (analyticsStatus, adsStatus = 2) => ({
  analyticsStoragePurposeConsentStatus: analyticsStatus,
  adStoragePurposeConsentStatus: adsStatus,
  adUserDataPurposeConsentStatus: adsStatus,
  adPersonalizationPurposeConsentStatus: adsStatus
});
class Events {
  listeners = new Map();
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); }
}
class Element extends Events {
  value = ''; textContent = ''; hidden = false;
  closest() { return null; }
}
function harness({url = 'https://utivaro.com/tools/word-counter', gpc = false, disabled = false} = {}) {
  const window = new Events(), document = new Events(), scripts = [], timers = new Map();
  const search = new Element(), status = new Element(), area = new Element();
  area.querySelectorAll = () => [{hidden: false}, {hidden: true}];
  let serial = 0, reloads = 0, revocations = 0, tcListener, currentValues = values(0);
  const ready = new Set(), pending = [];
  document.head = {appendChild: el => scripts.push(el)};
  document.createElement = () => new Element();
  document.referrer = 'https://example.org/private?email=SECRET';
  document.readyState = 'complete';
  document.getElementById = id => ({toolSearch:search, 'all-tools':area, 'utivaro-privacy-status':status}[id] || null);
  document.querySelector = () => null;
  const location = Object.assign(new URL(url), {reload: () => { reloads++; }});
  Object.assign(window, {window, document, location, navigator: {globalPrivacyControl: gpc},
    Element, URL, URLSearchParams, console, Date,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: fn => { const id = ++serial; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  });
  if (disabled) window['ga-disable-' + ID] = true;
  window.__tcfapi = (command, version, callback) => {
    assert.equal(command, 'addEventListener'); assert.equal(version, 0); tcListener = callback;
  };
  window.googlefc = {
    callbackQueue: {push(map) { for (const [key, fn] of Object.entries(map)) ready.has(key) ? fn() : pending.push([key, fn]); }},
    getGoogleConsentModeValues: () => currentValues,
    showRevocationMessage: () => { revocations++; }
  };
  vm.createContext(window); vm.runInContext(bridge, window);
  return {window, document, scripts, search, status, timers,
    fire(key) { ready.add(key); for (let i = 0; i < pending.length;) {
      if (pending[i][0] === key) { const [, fn] = pending.splice(i, 1)[0]; fn(); } else i++;
    }},
    choice(value) { currentValues = value; this.fire('CONSENT_MODE_DATA_READY'); },
    tcf(eventStatus, gdprApplies = true) { tcListener({eventStatus, gdprApplies}, true); },
    load() { scripts[0]?.onload(); },
    advance() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    useAnalytics() { vm.runInContext(analytics, window); },
    commands() { return Array.from(window.dataLayer || [], args => Array.from(args)); },
    events() { return this.commands().filter(args => args[0] === 'event').map(args => args[1]); },
    reloads: () => reloads, revocations: () => revocations
  };
}

test('A missing CMP leaves default consent denied with no GA script or events', () => {
  const h = harness();
  assert.equal(h.commands()[0][0], 'consent');
  assert.ok(Object.values(h.commands()[0][2]).every(value => value === 'denied'));
  assert.equal(h.scripts.length, 0); assert.equal(h.window.UtivaroConsent.canMeasure(), false);
  h.window.UtivaroConsent.openSettings(); assert.match(h.status.textContent, /unavailable/);
  assert.deepEqual(h.events(), []);
});
for (const state of [0, 2, 4, undefined, null, 42, '1']) {
  test('Analytics remains blocked for consent status ' + String(state), () => {
    const h = harness(); h.choice(values(state, 1));
    assert.equal(h.scripts.length, 0); assert.equal(h.window.UtivaroConsent.canMeasure(), false);
  });
}
for (const state of [1, 3]) {
  test('Analytics status ' + state + ' loads once; advertising stays independently denied', () => {
    const h = harness(); h.choice(values(state));
    assert.equal(h.scripts.length, 1); assert.match(h.scripts[0].src, /G-QEJKW6BQMH/);
    assert.equal(h.window.UtivaroConsent.canMeasure(), false);
    assert.deepEqual(h.events(), []); h.load(); assert.equal(h.window.UtivaroConsent.canMeasure(), true);
    assert.deepEqual(h.events(), ['page_view']);
    const update = h.commands().find(c => c[0] === 'consent' && c[1] === 'update')[2];
    assert.equal(update.analytics_storage, 'granted'); assert.equal(update.ad_storage, 'denied');
    assert.equal(update.ad_user_data, 'denied'); assert.equal(update.ad_personalization, 'denied');
    vm.runInContext(bridge, h.window); assert.equal(h.scripts.length, 1);
  });
}
test('GPC, external disable and test hosts block GA even with consent', () => {
  for (const options of [{gpc:true}, {disabled:true}, {url:'http://localhost/tools/word-counter'}]) {
    const h = harness(options); h.choice(values(1)); assert.equal(h.scripts.length, 0);
  }
});
test('The first CMP choice can grant analytics without requiring a refresh', () => {
  const h = harness(); h.fire('CONSENT_API_READY'); h.tcf('cmpuishown');
  h.tcf('useractioncomplete'); h.choice(values(1)); h.load();
  assert.equal(h.window.UtivaroConsent.canMeasure(), true); assert.equal(h.reloads(), 0);
});
test('Changing an existing choice pauses immediately; stale callbacks cannot resume GA', () => {
  const h = harness(); h.fire('CONSENT_API_READY'); h.choice(values(1)); h.load();
  h.window.UtivaroConsent.openSettings(); assert.equal(h.revocations(), 1);
  assert.equal(h.window.UtivaroConsent.canMeasure(), false);
  assert.equal(h.window['ga-disable-' + ID], true);
  h.choice(values(1)); assert.equal(h.window.UtivaroConsent.canMeasure(), false);
  h.tcf('useractioncomplete'); h.tcf('useractioncomplete'); assert.equal(h.reloads(), 1);
  // A fresh page evaluates the stored refusal; the old page's consent is not restored.
  const next = harness(); next.choice(values(2)); assert.equal(next.scripts.length, 0);
});
test('A Google-owned reopen also pauses and reloads; a late GA load cannot emit page_view', () => {
  const h = harness(); h.fire('CONSENT_API_READY'); h.choice(values(1));
  h.tcf('cmpuishown'); h.load(); assert.deepEqual(h.events(), []);
  h.tcf('useractioncomplete'); assert.equal(h.reloads(), 1);
});
test('CMP and GA failures do not enable measurement', () => {
  const h = harness(); h.window.googlefc.getGoogleConsentModeValues = () => { throw Error('offline'); };
  h.fire('CONSENT_MODE_DATA_READY'); assert.equal(h.scripts.length, 0);
  const g = harness(); g.choice(values(1)); g.scripts[0].onerror();
  assert.equal(g.window.UtivaroConsent.canMeasure(), false); assert.deepEqual(g.events(), []);
});
test('Consent updates clear continuous event batches instead of replaying them', () => {
  const h = harness(); h.useAnalytics(); h.fire('CONSENT_API_READY');
  const track = () => { h.window.UtivaroAnalytics.track('tool_start'); h.window.UtivaroAnalytics.track('tool_success'); };
  track(); h.choice(values(1)); h.load(); h.advance(); assert.deepEqual(h.events(), ['page_view']);
  track(); h.window.UtivaroConsent.openSettings(); h.advance();
  assert.deepEqual(h.events(), ['page_view']);
});
test('Search before consent is dropped; search after consent emits only bounded counts', () => {
  const h = harness({url:'https://utivaro.com/'}); h.useAnalytics();
  h.search.value = 'SECRET'; h.search.dispatchEvent({type:'input'});
  assert.equal(h.timers.size, 0); h.choice(values(1)); h.load(); h.advance();
  assert.deepEqual(h.events(), ['page_view']);
  h.search.dispatchEvent({type:'input'}); h.advance();
  assert.deepEqual(h.events(), ['page_view', 'tool_search']);
  assert.ok(!JSON.stringify(h.commands()).includes('SECRET'));
});
test('Search queued before withdrawal is discarded', () => {
  const h = harness({url:'https://utivaro.com/'}); h.fire('CONSENT_API_READY'); h.choice(values(1)); h.load(); h.useAnalytics();
  h.search.value = 'photo'; h.search.dispatchEvent({type:'input'});
  h.window.UtivaroConsent.openSettings(); h.advance(); assert.deepEqual(h.events(), ['page_view']);
});
test('An image conversion started before consent does not report its late completion', () => {
  const h = harness({url:'https://utivaro.com/tools/heic-to-jpg'}); h.useAnalytics();
  h.window.UtivaroAnalytics.track('tool_start'); h.choice(values(1)); h.load();
  h.window.UtivaroAnalytics.track('tool_success'); assert.deepEqual(h.events(), ['page_view']);
  h.window.UtivaroAnalytics.track('tool_start'); h.window.UtivaroAnalytics.track('tool_success');
  assert.deepEqual(h.events(), ['page_view', 'tool_start', 'tool_success']);
});
test('Query strings, fragments and full referrers do not enter GA page configuration', () => {
  const h = harness({url:'https://utivaro.com/tools/word-counter.html?private=SECRET#SECRET'});
  h.choice(values(1)); h.load(); assert.ok(!JSON.stringify(h.commands()).includes('SECRET'));
});
test('Copying a tool link is measured only after consent, without user input', () => {
  const h = harness({url:'https://utivaro.com/tools/base64?secret=SECRET'});
  h.useAnalytics();
  h.window.UtivaroAnalytics.track('tool_link_copy', {secret:'SECRET'});
  assert.deepEqual(h.events(), []);
  h.choice(values(1)); h.load();
  h.window.UtivaroAnalytics.track('tool_link_copy', {secret:'SECRET'});
  assert.deepEqual(h.events(), ['page_view','tool_link_copy']);
  assert.ok(!JSON.stringify(h.commands()).includes('SECRET'));
});
test('Back-forward cache restoration reevaluates consent on a new page', () => {
  const h = harness(); h.choice(values(1)); h.load();
  h.window.dispatchEvent({type:'pageshow', persisted:true});
  assert.equal(h.reloads(), 1); assert.equal(h.window.UtivaroConsent.canMeasure(), false);
});
test('Every page uses the consent loader first, without a second Analytics boot path', () => {
  const files = [...fs.readdirSync(root).filter(f => f.endsWith('.html')),
    ...fs.readdirSync(path.join(root,'tools')).filter(f => f.endsWith('.html')).map(f => 'tools/' + f)];
  assert.equal(files.length, 23);
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal((html.match(/src="\/assets\/utivaro-consent\.js\?v=2026-09-19\.1"/g) || []).length, 1, file);
    assert.equal((html.match(/adsbygoogle\.js\?client=ca-pub-7526430511237750/g) || []).length, 1, file);
    assert.ok(html.indexOf('utivaro-consent.js') < html.indexOf('adsbygoogle.js'), file);
    assert.ok(html.indexOf('utivaro-consent.js') < html.indexOf('</head>'), file);
    assert.ok(!/googletagmanager\.com|gtag\s*\(/.test(html), file);
    assert.equal((html.match(/data-utivaro-privacy /g) || []).length, 1, file);
    for (const match of html.matchAll(/<script[^>]+src="([^" ]*script\.js[^" ]*)"/g)) {
      assert.equal(match[1], '/script.js?v=20260925-1', file);
    }
  }
  assert.ok(!/googletagmanager\.com|gtag\s*\(/.test(fs.readFileSync(path.join(root,'script.js'),'utf8')));
});
