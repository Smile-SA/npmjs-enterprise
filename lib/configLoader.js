var config = require('./../config');
var log4js = require('log4js');
log4js.configure('log4js.json', {reloadSecs: 10});
var logger = log4js.getLogger('app');

/**
 * Transform in canonical form
 */
function normalization(config) {
  for (var i in config) {
    if (typeof config[i] === 'string') {
      // Remove trailing '/' in strings
      config[i] = config[i].replace(/\/$/, '');
    } else if (typeof config[i] === 'object') {
      config[i] = normalization(config[i]);
    }
  }
  return config;
}

config = normalization(config);

// Default listening port
config.port = config.port || 1337;

config.centralURL = config.centralURL || 'https://registry.npmjs.org';

config.syncURL = config.syncURL || 'https://replicate.npmjs.com';

config.delay = config.delay || 1000;

config.logger = logger;

module.exports = config;
