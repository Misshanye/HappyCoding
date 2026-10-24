/* Anonymous aggregate metrics only. No code, input, output, names or persistent visitor IDs. */
window.ClassroomAnalytics = (() => {
  const config = window.CLASSROOM_ANALYTICS_CONFIG || {};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let endpoint;
  try { endpoint = new URL(config.endpoint); } catch (_) {}
  const disabledByBrowser = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const enabled = config.enabled === true && uuid.test(config.websiteId || '') &&
    endpoint?.protocol === 'https:' && location.protocol !== 'file:' && !disabledByBrowser;
  let started = false, pending = Promise.resolve();
  const completed = new Set();
  const allowedLevels = new Set(['L1', 'L2', 'L3', 'L4']);
  function properties(value = {}) {
    const data = {};
    if (value.language === 'python' || value.language === 'c') data.language = value.language;
    if (value.mode === 'quiz' || value.mode === 'free') data.mode = value.mode;
    if (allowedLevels.has(value.level)) data.level = value.level;
    if (value.execution === 'run' || value.execution === 'step') data.execution = value.execution;
    if (typeof value.case === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value.case)) data.case = value.case;
    return data;
  }
  function send(name, data) {
    if (!enabled || !started) return;
    // Omit search/hash/referrer to avoid leaking query values or fragment content.
    const payload = {
      website: config.websiteId, hostname: location.hostname, url: location.pathname,
      language: navigator.language || '', screen: `${screen.width}x${screen.height}`,
      title: '编程互动课堂', referrer: '',
    };
    if (name) { payload.name = name; payload.data = properties(data); }
    // Ordered, non-blocking requests; no retries that might double-count an accepted request.
    pending = pending.then(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(endpoint.href, {
          method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'event', payload }), keepalive: true, signal: controller.signal,
        });
      } catch (_) { /* Analytics must never interfere with teaching. */ }
      finally { clearTimeout(timer); }
    });
  }
  function start() {
    if (started || !enabled) return;
    started = true;
    // Only the runtime's explicit automatic reload is suppressed; normal refreshes count.
    let automaticReload = false;
    try {
      const marker = JSON.parse(sessionStorage.getItem('classroom_analytics_runtime_reload') || 'null');
      sessionStorage.removeItem('classroom_analytics_runtime_reload');
      automaticReload = marker?.path === location.pathname &&
        Date.now() - marker.at >= 0 && Date.now() - marker.at < 30000;
    } catch (_) {}
    if (!automaticReload) send();
  }
  function prepareReload() {
    if (!enabled || !started) return;
    try {
      sessionStorage.setItem('classroom_analytics_runtime_reload', JSON.stringify({
        path: location.pathname, at: Date.now(),
      }));
    } catch (_) { /* Lack of session storage must not block runtime startup. */ }
  }
  function run(value) {
    if (!started) return;
    const data = properties(value);
    if (!data.language) return;
    send(`code_run_${data.language}`, data);
    if (data.mode === 'quiz' && data.level) send('level_use', data);
  }
  function success(value) {
    if (!started) return;
    const data = properties(value);
    if (!data.language || !data.level || !data.case) return;
    const key = `${data.language}:${data.level}:${data.case}`;
    if (completed.has(key)) return;
    completed.add(key);
    send('case_success', data);
  }
  return Object.freeze({ start, run, success, prepareReload });
})();
