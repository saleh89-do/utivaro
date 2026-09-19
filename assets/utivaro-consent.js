/* Utivaro consent bridge 2026-09-19.1.
   Basic GA4 loading, using Google's documented Consent Mode values.
   Ad-purpose/TCF consent is never treated as Analytics consent.
   https://developers.google.com/funding-choices/fc-api-docs */
(function () {
  'use strict';
  if (window.UtivaroConsent) return;
  const ID = 'G-QEJKW6BQMH', DISABLE = 'ga-disable-' + ID;
  const production = /^(www\.)?utivaro\.com$/.test(location.hostname);
  const fields = {
    ad_storage: 'adStoragePurposeConsentStatus',
    ad_user_data: 'adUserDataPurposeConsentStatus',
    ad_personalization: 'adPersonalizationPurposeConsentStatus',
    analytics_storage: 'analyticsStoragePurposeConsentStatus'
  };
  const denied = Object.fromEntries(Object.keys(fields).map(key => [key, 'denied']));
  let analyticsAllowed = false, requested = false, loaded = false;
  let resolved = false, suspended = false, reloadAfterChoice = false, reloading = false;
  let apiReady = false, gdprApplies;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // Synchronous head script: defaults precede CMP, config and event commands.
  window.gtag('consent', 'default', Object.assign({}, denied));
  window.gtag('set', 'ads_data_redaction', true);
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];

  function optedOut() {
    return navigator.globalPrivacyControl === true || window[DISABLE] === true;
  }
  function canMeasure() {
    return production && analyticsAllowed && loaded && !suspended && !optedOut();
  }
  function notify() {
    document.dispatchEvent(new CustomEvent('utivaro:consent', {detail: {analytics: canMeasure()}}));
  }
  function pause() {
    suspended = true;
    analyticsAllowed = false;
    // Once loaded, keep GA disabled until a fresh page evaluates the new choice.
    if (requested) window[DISABLE] = true;
    window.gtag('consent', 'update', Object.assign({}, denied));
    notify();
  }
  function message(text) {
    const status = document.getElementById('utivaro-privacy-status');
    if (status) status.textContent = text;
  }
  function reload() {
    if (reloading) return;
    reloading = true;
    pause();
    location.reload();
  }
  function cleanLocation() {
    return location.origin + location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  }
  function cleanReferrer() {
    try { const url = new URL(document.referrer); return /^https?:$/.test(url.protocol) ? url.origin + '/' : ''; }
    catch (_) { return ''; }
  }
  function loadAnalytics() {
    if (requested || !production || !analyticsAllowed || suspended || optedOut()) return;
    requested = true;
    window.gtag('js', new Date());
    window.gtag('config', ID, {
      send_page_view: false,
      page_location: cleanLocation(), page_referrer: cleanReferrer(),
      allow_google_signals: false, allow_ad_personalization_signals: false
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    script.onload = function () {
      loaded = true;
      notify();
      if (!canMeasure()) return;
      const params = {send_to: ID, page_location: cleanLocation(), page_referrer: cleanReferrer()};
      if (new URLSearchParams(location.search).get('utivaro_debug') === '1') params.debug_mode = true;
      window.gtag('event', 'page_view', params);
    };
    script.onerror = function () { loaded = false; notify(); };
    document.head.appendChild(script);
  }
  function readConsent() {
    if (suspended || reloading) return;
    let values;
    try { values = window.googlefc.getGoogleConsentModeValues(); }
    catch (_) { pause(); return; }
    resolved = true;
    const consent = {};
    for (const [key, field] of Object.entries(fields)) {
      // Documented enum: GRANTED=1, NOT_APPLICABLE=3. UNKNOWN=0,
      // DENIED=2, NOT_CONFIGURED=4 and malformed values all stay denied.
      // NOT_APPLICABLE is Google's regional determination, not user consent.
      const value = values && values[field];
      consent[key] = value === 1 || value === 3 ? 'granted' : 'denied';
    }
    if (optedOut()) consent.analytics_storage = 'denied';
    const nextAllowed = consent.analytics_storage === 'granted';
    // A later withdrawal must also block already-loaded automatic GA events.
    if (!nextAllowed && requested) window[DISABLE] = true;
    analyticsAllowed = nextAllowed;
    window.gtag('consent', 'update', consent);
    notify();
    loadAnalytics();
  }
  function queueConsentRead() {
    window.googlefc.callbackQueue.push({CONSENT_MODE_DATA_READY: readConsent});
  }
  function openSettings() {
    if (!apiReady || typeof window.googlefc.showRevocationMessage !== 'function') {
      message('Privacy choices are unavailable. Please refresh the page or try again later.');
      return;
    }
    if (gdprApplies === false) {
      message('Google does not provide a European consent message for this visit. See the Privacy Policy for other privacy controls.');
      return;
    }
    reloadAfterChoice = true;
    pause();
    message('Analytics is paused. After you save your choices, this page will refresh.');
    window.googlefc.callbackQueue.push({CONSENT_API_READY: function () {
      try { window.googlefc.showRevocationMessage(); }
      catch (_) { message('Privacy choices could not be opened. Analytics remains paused. Please refresh to try again.'); }
    }});
  }
  window.UtivaroConsent = Object.freeze({version: '2026-09-19.1', canMeasure: canMeasure, openSettings: openSettings});
  window.googlefc.callbackQueue.push({CONSENT_API_READY: function () {
    apiReady = true;
    if (typeof window.__tcfapi !== 'function') return;
    try {
      // TCF only signals UI/choice changes. Never infer GA consent from its purposes.
      window.__tcfapi('addEventListener', 0, function (data, success) {
        if (!success || !data) { pause(); return; }
        gdprApplies = data.gdprApplies;
        if (data.eventStatus === 'cmpuishown') {
          reloadAfterChoice = reloadAfterChoice || resolved || requested;
          pause();
        } else if (data.eventStatus === 'useractioncomplete') {
          if (reloadAfterChoice || requested) { reload(); return; }
          suspended = false;
          queueConsentRead();
        }
      });
    } catch (_) { pause(); }
  }});
  queueConsentRead();
  document.addEventListener('click', function (event) {
    if (!(event.target instanceof Element) || !event.target.closest('[data-utivaro-privacy]')) return;
    event.preventDefault();
    openSettings();
  });
  // A restored page must not revive consent that was changed on another page.
  window.addEventListener('pageshow', function (event) { if (event.persisted) reload(); });
})();
