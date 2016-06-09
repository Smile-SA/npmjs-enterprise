'use strict';

var http = require('http');

var config = require('./lib/configLoader');
var api = require('./lib/api');

var logger = config.logger;

// Inspired from https://github.com/mojombo/semver/issues/110#issuecomment-19433284, but more permissive (allow leading zeros) and non capturing
var versionRegexp = '(\\d+\\.\\d+\\.\\d+(?:-(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)';
var tarballRegexp = new RegExp('^(\\/@([^/]+))?\\/([^/]+)\\/-\\/[^/]+?-' + versionRegexp + '\\.tgz$');
var moduleRegexp = new RegExp('^\\/[^/]+$');

process.on('uncaughtException', function(err) {
  logger.error('Uncaught exception: %s', JSON.stringify(err, null, 4));
});

http.createServer(function(req, resp) {
  try {
    var isGet = req.method === 'GET';
    var isTarball = req.url.match(tarballRegexp) != null;
    var isModule = req.url.match(moduleRegexp) != null;

    if (isGet && isTarball) {
      api.manageAttachment(req, resp);
    } else if (isGet && isModule) {
      api.manageModule(req, resp);
    } else {
      api.proxyToCentralRepository(req, resp);
    }
  } catch (error) {
    logger.error(error);
  }
}).listen(config.port, function() {
  logger.info('Server running at http://localhost:%s with config:\n%s', config.port, JSON.stringify(config, null, 4));
});
