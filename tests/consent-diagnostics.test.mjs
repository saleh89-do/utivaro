import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {effectivePolicy,responseEvidence,consentEvidence,verdict} from '../diagnostics/consent-check.mjs';
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
});
