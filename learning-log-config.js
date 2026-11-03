/* 直接复用Umami，不需要额外编号服务或数据库。 */
window.CLASSROOM_LEARNING_LOG_CONFIG = Object.freeze({
  enabled: true,
  localArchive: true,
  heartbeatSeconds: 60,
  queueLimit: 1000,
  retentionDays: 7,
  siteVersion: 'V1.3-learning-log.3-local'
});
