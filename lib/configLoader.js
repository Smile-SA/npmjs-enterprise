var config = require('./../config');

/**
 * Transform in canonical form
 */
function normalization(config) {
  for (var i in config) {
    if (typeof config[i] === 'string') {
      // Remove trailing '/' in strings
      config[i] = config[i].replace(/\/$/, '');
    } else if (typeof config[i] === 'object'){
      config[i] = normalization(config[i]);
    }
  }
  return config;
}

config = normalization(config);

// Default listening port
config.port = config.port || 1337;

config.centralURL = config.centralURL || "https://registry.npmjs.org";

module.exports = config;
