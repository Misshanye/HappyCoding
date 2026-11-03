/* Legacy aggregate event names retained; learning-log.js supplies visitor association. */
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
  
  function properties(value = {}) {
    const data = {};
    if (value.language === 'python' || value.language === 'c') data.language = value.language;
    if (value.mode === 'quiz' || value.mode === 'free') data.mode = value.mode;
    if (typeof value.level === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value.level)) data.level = value.level;
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
    if (name) { payload.name = name; payload.data = {...(window.ClassroomLearningLog?.context()||{}),...properties(data)}; }
    // Shared durable transport; legacy event names are preserved.
    if(window.ClassroomLearningLog) {
      window.ClassroomLearningLog.enqueuePayload(payload);
      return;
    }

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
