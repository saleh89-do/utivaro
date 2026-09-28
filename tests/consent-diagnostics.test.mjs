import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {effectivePolicy,responseEvidence,consentEvidence,verdict,publisherEvidence,mount,VERSION} from '../diagnostics/consent-check.mjs';
const page = {validHTML:true,publisherMatches:true,effectiveReferrerPolicy:null};
const report = extra => ({home:{...page},check:{...page},tag:'loaded',apiReady:false,modeReady:false,blocked:[],timedOut:true,...extra});
test('A 403 error policy cannot be reported as the successful page policy', () => {
  const evidence = responseEvidence(new Response('blocked',{status:403,headers:{'content-type':'text/html','referrer-policy':'same-origin'}}));
  assert.equal(evidence.validHTML,false); assert.equal(evidence.headers,null);
  assert.equal(verdict(report({home:evidence})),'page-fetch-failed');
});
test('Only a 200 HTML response supplies policy evidence; report-only CSP is distinct', () => {
  assert.equal(responseEvidence(new Response('text',{headers:{'content-type':'text/plain'}})).headers,null);
  const evidence = responseEvidence(new Response('<html>',{headers:{'content-type':'text/html; charset=utf-8','referrer-policy':'strict-origin-when-cross-origin','content-security-policy-report-only':"script-src 'self'"}}));
  assert.equal(evidence.validHTML,true); assert.equal(evidence.headers.csp,null);
  assert.equal(evidence.headers.cspReportOnly,"script-src 'self'");
  assert.equal(effectivePolicy('no-referrer, strict-origin-when-cross-origin, invalid'),'strict-origin-when-cross-origin');
});
test('Tag load alone and a timeout never become CMP success or an AdSense approval diagnosis', () => {
  assert.equal(verdict(report()),'tag-loaded-cmp-not-ready');
  assert.equal(verdict(report({timedOut:false})),'waiting');
  assert.equal(verdict(report({tag:'error'})),'adsense-tag-load-error');
  assert.equal(verdict(report({tag:'loading'})),'tag-not-loaded-in-time');
});
test('API readiness is separate from consent data and respects publisher mismatch', () => {
  assert.equal(verdict(report({apiReady:true})),'cmp-api-ready');
  assert.equal(verdict(report({apiReady:true,modeReady:true})),'consent-data-received');
  assert.equal(verdict(report({home:{...page,publisherMatches:false}})),'publisher-mismatch');
});
test('Only an enforced CSP violation proves CSP blocking; a restrictive policy is a hypothesis', () => {
  assert.equal(verdict(report({blocked:[{kind:'csp',disposition:'report'}]})),'tag-loaded-cmp-not-ready');
  assert.equal(verdict(report({blocked:[{kind:'csp',disposition:'enforce'}]})),'resource-blocked-by-csp');
  assert.equal(verdict(report({home:{...page,effectiveReferrerPolicy:'same-origin'}})),'restrictive-referrer-policy');
  assert.equal(verdict(report({check:{...page,effectiveReferrerPolicy:'no-referrer'}})),'restrictive-referrer-policy');
});
test('The report exposes only documented purpose enums and excludes raw consent strings', () => {
  const values = consentEvidence({analyticsStoragePurposeConsentStatus:4,adStoragePurposeConsentStatus:1,adUserDataPurposeConsentStatus:'1',adPersonalizationPurposeConsentStatus:99,tcString:'PRIVATE'});
  assert.equal(values.analyticsStoragePurposeConsentStatus,'NOT_CONFIGURED');
  assert.equal(values.adStoragePurposeConsentStatus,'GRANTED');
  assert.equal(values.adUserDataPurposeConsentStatus,'INVALID');
  assert.equal(values.adPersonalizationPurposeConsentStatus,'INVALID');
  assert.ok(!JSON.stringify(values).includes('PRIVATE'));
});
test('Diagnostics is unindexed, absent from sitemap, and has no Analytics boot path', () => {
  const html = fs.readFileSync(new URL('../diagnostics/consent.html',import.meta.url),'utf8');
  const code = fs.readFileSync(new URL('../diagnostics/consent-check.mjs',import.meta.url),'utf8');
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.ok(!fs.readFileSync(new URL('../sitemap.xml',import.meta.url),'utf8').includes('/diagnostics/'));
  assert.doesNotMatch(html+code,/googletagmanager\.com|google-analytics\.com|utivaro-consent\.js\?v=|document\.cookie|localStorage|sessionStorage/);
  assert.doesNotMatch(code,/gtag\(['"](?:config|event)['"]/);
  assert.ok(html.includes('consent-check.mjs?v=' + VERSION));
});

const origin = 'https://utivaro.com';
const tag = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7526430511237750';
test('An intentionally deferred tag is different from a missing or incorrect publisher', () => {
  const deferred = publisherEvidence(['/diagnostics/consent-check.mjs'],origin,true);
  assert.equal(deferred.publisherMatches,null);
  assert.equal(deferred.publisherStatus,'deferred-until-run');
  assert.equal(deferred.tagCount,0);
  assert.equal(verdict(report({check:{...page,...deferred}})),'tag-loaded-cmp-not-ready');
  assert.equal(publisherEvidence([],origin).publisherMatches,false);
  for (const sources of [[tag.replace('7526430511237750','1111111111111111')],[tag,tag],[tag.split('?')[0]]]) {
    assert.equal(publisherEvidence(sources,origin).publisherMatches,false);
  }
  const runtime = publisherEvidence([tag],origin);
  assert.equal(runtime.publisherMatches,true);
  assert.deepEqual(runtime.publisherIds,['ca-pub-7526430511237750']);
  assert.equal(verdict(report({runtimeAdSense:{...runtime,publisherMatches:false},modeReady:true})),'runtime-publisher-mismatch');
});

// A small DOM adapter exercises the real click/load path without contacting Google.
function diagnosticHarness({homeTag = tag, staticTag = null, liveTag = null} = {}) {
  const element = () => ({textContent:'',disabled:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},getAttribute(name){return this[name] ?? null;}});
  const nodes = new Map(), scripts = [], timers = new Map(); let serial = 0;
  if (liveTag) scripts.push({...element(),src:liveTag});
  const doc = {
    getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},
    querySelectorAll(){return scripts;},createElement:element,addEventListener(){},
    head:{appendChild(script){
      assert.deepEqual(Array.from(win.dataLayer[0]).slice(0,2),['consent','default']);
      assert.ok(Object.values(win.dataLayer[0][2]).every(value=>value==='denied'));
      scripts.push(script);
    }}
  };
  const win = {
    location:new URL(origin+'/diagnostics/consent?fc=alwaysshow&fctype=gdpr'),
    AbortController,addEventListener(){},navigator:{},
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
    async fetch(path){return new Response(path==='/'?'home':'check',{headers:{'content-type':'text/html'}});},
    DOMParser:class {parseFromString(which){return {
      querySelectorAll(){return (which==='home'?[homeTag,'/assets/utivaro-consent.js']:staticTag?[staticTag]:[]).map(src=>({...element(),src}));},
      querySelector(){return null;},getElementById(){return which==='check'?{}:null;}
    };}}
  };
  mount(win,doc);
  return {win,scripts,run:()=>doc.getElementById('run').listeners.click(),read:()=>JSON.parse(doc.getElementById('report').textContent),timeout(){for(const timer of timers.values())if(timer.delay===30000)timer.fn();}};
}
test('A real diagnostic run adds the matching tag once and distinguishes defaults from CMP values', async () => {
  const h=diagnosticHarness();
  assert.equal(h.scripts.length,0);
  await h.run(); await h.run();
  assert.equal(h.scripts.length,1);
  assert.equal(h.read().check.publisherMatches,null);
  assert.equal(h.read().runtimeAdSense.publisherMatches,true);
  assert.equal(h.read().consentDefaults.command,'queued-before-adsense');
  assert.equal(h.read().consentValues,null);
  h.scripts[0].onload(); h.timeout();
  assert.equal(h.read().result,'tag-loaded-cmp-not-ready');
  h.scripts[0].src=tag.replace('7526430511237750','1111111111111111');
  h.scripts[0].onload();
  assert.equal(h.read().result,'runtime-publisher-mismatch');
});
test('Incorrect homepage publishers and pre-existing diagnostic tags prevent another tag load', async () => {
  const wrong=diagnosticHarness({homeTag:tag.replace('7526430511237750','1111111111111111')});
  await wrong.run(); assert.equal(wrong.scripts.length,0); assert.equal(wrong.read().result,'publisher-mismatch');
  for (const options of [{staticTag:tag},{liveTag:tag}]) {
    const h=diagnosticHarness(options); const before=h.scripts.length;
    await h.run(); assert.equal(h.scripts.length,before); assert.equal(h.read().result,'unexpected-existing-adsense-tag');
  }
});
