// Isolated, opt-in diagnostics. No GA4 loader, cookie reads, telemetry, or consent bypass.
export const VERSION = '2026-09-21.1';
const PUBLISHER = 'ca-pub-7526430511237750';
const AD_TAG = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + PUBLISHER;
const POLICIES = new Set(['no-referrer','no-referrer-when-downgrade','origin','origin-when-cross-origin','same-origin','strict-origin','strict-origin-when-cross-origin','unsafe-url']);
export function effectivePolicy(raw) {
  return String(raw || '').split(',').map(s => s.trim().toLowerCase()).filter(s => POLICIES.has(s)).at(-1) || null;
}
export function responseEvidence(response) {
  const type = response.headers.get('content-type') || '';
  const valid = response.status === 200 && !response.redirected && /^text\/html(?:;|$)/i.test(type);
  // Headers on 403/404/challenge responses are not evidence of the real page's policy.
  return {status:response.status, validHTML:valid, headers:valid ? {
    referrerPolicy:response.headers.get('referrer-policy'),
    csp:response.headers.get('content-security-policy'),
    cspReportOnly:response.headers.get('content-security-policy-report-only')
  } : null};
}
export function consentEvidence(values) {
  const names = {0:'UNKNOWN',1:'GRANTED',2:'DENIED',3:'NOT_APPLICABLE',4:'NOT_CONFIGURED'};
  const fields = ['adStoragePurposeConsentStatus','adUserDataPurposeConsentStatus','adPersonalizationPurposeConsentStatus','analyticsStoragePurposeConsentStatus'];
  return Object.fromEntries(fields.map(field => [field, Number.isInteger(values?.[field]) ? (names[values[field]] || 'INVALID') : 'INVALID']));
}
export function verdict(report) {
  if (!report.home?.validHTML || !report.check?.validHTML) return 'page-fetch-failed';
  if (!report.home.publisherMatches) return 'publisher-mismatch';
  if (report.modeReady) return 'consent-data-received';
  if (report.apiReady) return 'cmp-api-ready';
  if (report.blocked.some(item => item.kind === 'csp' && item.disposition === 'enforce')) return 'resource-blocked-by-csp';
  if ([report.home,report.check].some(page => ['no-referrer','same-origin'].includes(page.effectiveReferrerPolicy))) return 'restrictive-referrer-policy';
  if (report.tag === 'error') return 'adsense-tag-load-error';
  if (report.timedOut) return report.tag === 'loaded' ? 'tag-loaded-cmp-not-ready' : 'tag-not-loaded-in-time';
  return 'waiting';
}
const MESSAGES = {
  'page-fetch-failed':'تعذر التحقق من استجابة HTML للموقع. لم نبدأ اختبار Google؛ ترويسات صفحة الخطأ لا تثبت سياسة الموقع.',
  'publisher-mismatch':'لم نجد وسم AdSense واحدًا بالمعرّف المتوقع في الصفحة الرئيسية. لم يبدأ اختبار Google.',
  'consent-data-received':'وصلت بيانات Consent mode من Google. راجع قيمها في التقرير؛ هذه النتيجة لا تثبت وصول أحداث GA4.',
  'cmp-api-ready':'وصلت واجهة CMP؛ ما زلنا ننتظر بيانات Consent mode. إذا ظهرت الرسالة يمكنك اختيار تفضيلاتك.',
  'resource-blocked-by-csp':'رُصد حظر مورد Google بواسطة سياسة CSP. التفاصيل المحدودة موجودة في التقرير.',
  'restrictive-referrer-policy':'رُصدت سياسة مصدر قد تمنع وصول رسالة Google. راجع السياسة الظاهرة في التقرير.',
  'adsense-tag-load-error':'أبلغ المتصفح عن فشل تحميل وسم AdSense. هذا لا يحدد وحده إن كان السبب الشبكة أو مانع محتوى أو إعدادًا آخر.',
  'tag-loaded-cmp-not-ready':'اكتمل تحميل وسم AdSense، لكن CMP لم تصبح جاهزة خلال 30 ثانية. السبب غير محسوم؛ انسخ التقرير.',
  'tag-not-loaded-in-time':'لم يصل تأكيد تحميل وسم AdSense خلال 30 ثانية. السبب غير محسوم؛ انسخ التقرير.',
  waiting:'جارٍ انتظار استجابة Google لمدة تصل إلى 30 ثانية…'
};
function category(source, origin) {
  try {
    const host = new URL(source, origin).hostname;
    if (host === 'pagead2.googlesyndication.com') return 'adsense';
    if (host === 'fundingchoicesmessages.google.com' || host === 'fundingchoices.google.com') return 'cmp';
  } catch (_) {}
  return null;
}
export function mount(win, doc) {
  const byId = id => doc.getElementById(id);
  let report, started = false;
  function render() {
    if (!report) return;
    report.result = verdict(report);
    byId('summary').textContent = MESSAGES[report.result];
    byId('home-status').textContent = report.home ? 'HTTP ' + (report.home.status ?? 'غير متاح') + (report.home.validHTML ? ' — HTML صحيح' : ' — لم يُتحقق من الصفحة') : 'جارٍ الفحص';
    const policyText = page => !page?.validHTML ? 'غير متاحة' : page.effectiveReferrerPolicy || 'لا توجد سياسة صريحة في الاستجابة؛ يطبق المتصفح سياسته الافتراضية';
    byId('home-policy').textContent = policyText(report.home);
    byId('check-policy').textContent = policyText(report.check);
    byId('publisher-status').textContent = report.home?.validHTML ? (report.home.publisherMatches ? 'مطابق — وسم واحد' : 'لم يثبت التطابق') : 'غير متاح';
    byId('tag-status').textContent = ({idle:'لم يبدأ',loading:'جارٍ التحميل',loaded:'وصل تأكيد تحميل الملف',error:'فشل تحميل الملف'})[report.tag];
    byId('api-status').textContent = report.apiReady ? 'وصلت إشارة CONSENT_API_READY' : 'لم تصل إشارة الجاهزية';
    byId('mode-status').textContent = report.modeReady ? 'وصلت البيانات — القيم في التقرير أدناه' : 'لم تصل البيانات';
    byId('blocked-status').textContent = report.blocked.length ? report.blocked.map(item => item.kind + ': ' + item.resource + (item.directive ? ' / ' + item.directive : '')).join('، ') : 'لم تُرصد — لا يثبت ذلك عدم وجود حجب';
    byId('report').textContent = JSON.stringify(report, null, 2);
    byId('copy').disabled = false;
  }
  async function readPage(path) {
    const controller = new win.AbortController();
    const timer = win.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await win.fetch(path, {credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
      const page = responseEvidence(response);
      if (!page.validHTML) return page;
      const html = await response.text();
      const parsed = new win.DOMParser().parseFromString(html, 'text/html');
      const scripts = Array.from(parsed.querySelectorAll('script[src]'));
      const tags = scripts.filter(s => { try { const u = new URL(s.getAttribute('src'),win.location.origin); return u.origin === 'https://pagead2.googlesyndication.com' && u.pathname === '/pagead/js/adsbygoogle.js'; } catch (_) { return false; } });
      page.publisherMatches = tags.length === 1 && new URL(tags[0].getAttribute('src'),win.location.origin).searchParams.get('client') === PUBLISHER;
      page.metaReferrerPolicy = parsed.querySelector('meta[name="referrer" i]')?.getAttribute('content') || null;
      page.effectiveReferrerPolicy = effectivePolicy(page.metaReferrerPolicy) || effectivePolicy(page.headers.referrerPolicy);
      const expected = path === '/' ? scripts.some(s => /\/assets\/utivaro-consent\.js(?:\?|$)/.test(s.getAttribute('src'))) : Boolean(parsed.getElementById('report') && parsed.getElementById('run'));
      // A 200 HTML challenge/error page is not the application's page either.
      if (!expected) return {status:response.status,validHTML:false,headers:null,reason:'unexpected-page'};
      return page;
    } catch (_) { return {status:null,validHTML:false,headers:null,reason:'fetch-failed'}; }
    finally { win.clearTimeout(timer); }
  }
  byId('run').addEventListener('click', async () => {
    if (started) return;
    if (!/^(www\.)?utivaro\.com$/.test(win.location.hostname)) {
      byId('summary').textContent = 'افتح هذه الصفحة على نطاق utivaro.com بعد النشر لتشغيل فحص Google.';
      return;
    }
    const params = new URLSearchParams(win.location.search);
    if (params.get('fc') !== 'alwaysshow' || params.get('fctype') !== 'gdpr') {
      win.location.replace(win.location.pathname + '?fc=alwaysshow&fctype=gdpr');
      return;
    }
    started = true;
    byId('run').disabled = true;
    report = {version:VERSION,at:new Date().toISOString(),home:null,check:null,tag:'idle',apiReady:false,modeReady:false,consentValues:null,blocked:[],timedOut:false,ga4:'not-loaded-by-this-check'};
    byId('summary').textContent = 'جارٍ قراءة استجابات الموقع…';
    [report.home,report.check] = await Promise.all([readPage('/'),readPage(win.location.pathname)]);
    render();
    if (!report.home.validHTML || !report.check.validHTML || !report.home.publisherMatches) return;
    function blocked(item) { if (report.blocked.length < 10 && !report.blocked.some(old => JSON.stringify(old) === JSON.stringify(item))) report.blocked.push(item); render(); }
    doc.addEventListener('securitypolicyviolation', event => {
      const resource = category(event.blockedURI,win.location.origin);
      if (resource) blocked({kind:'csp',resource,directive:event.effectiveDirective,disposition:event.disposition});
    });
    win.addEventListener('error', event => {
      const resource = category(event.target?.src,win.location.origin);
      if (resource) blocked({kind:'resource-error',resource});
    }, true);
    // Register only official CMP callbacks. Never infer Analytics consent from TCF purposes.
    win.dataLayer = win.dataLayer || [];
    win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
    win.gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});
    win.googlefc = win.googlefc || {};
    win.googlefc.callbackQueue = win.googlefc.callbackQueue || [];
    win.googlefc.callbackQueue.push({CONSENT_API_READY:() => { report.apiReady = true; render(); }});
    win.googlefc.callbackQueue.push({CONSENT_MODE_DATA_READY:() => {
      try { report.consentValues = consentEvidence(win.googlefc.getGoogleConsentModeValues()); report.modeReady = true; }
      catch (_) { report.modeReadError = true; }
      render();
    }});
    const script = doc.createElement('script');
    script.async = true; script.crossOrigin = 'anonymous'; script.src = AD_TAG;
    script.onload = () => { report.tag = 'loaded'; render(); };
    script.onerror = () => { report.tag = 'error'; render(); };
    report.tag = 'loading'; render();
    // 30 seconds is an observation window, not proof of a permanent failure.
    win.setTimeout(() => { report.timedOut = true; render(); }, 30000);
    doc.head.appendChild(script);
  });
  byId('copy').addEventListener('click', async () => {
    if (!report) return;
    try { await win.navigator.clipboard.writeText(JSON.stringify(report,null,2)); byId('copy-status').textContent = 'تم نسخ التقرير. أرسله في المحادثة.'; }
    catch (_) { byId('copy-status').textContent = 'تعذر النسخ التلقائي. اضغط مطولًا على نص التقرير وحدده وانسخه، أو أرسل صورة النتائج.'; }
  });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') mount(window,document);
