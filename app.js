'use strict';

var http = require('http');

var config = require('./lib/configLoader');
var urlUtils = require('./lib/urlUtils');
var api = require('./lib/api');

var logger = config.logger;

process.on('uncaughtException', function(err) {
  logger.error('Uncaught exception: %s', JSON.stringify(err, null, 4));
});

api.initChangesSync();

http.createServer(function(req, resp) {
  try {
    var startDate = Date.now();

    var isGet = req.method === 'GET';

    var module = urlUtils.module(req.url);
    var tarball = urlUtils.tarball(req.url);

    if (isGet && tarball) {
      api.manageAttachment(req, resp, tarball);
    } else if (isGet && module) {
      api.manageModule(req, resp, module);
    } else {
      api.proxyToCentralRepository(req, resp);
    }

    resp.on('finish', function() {
      logger.trace('%s: response in %sms', req.url, Date.now() - startDate);
    });
  } catch (error) {
    logger.error(error);
  }
}).listen(config.port, function() {
  logger.info('Server running at http://localhost:%s with config:\n%s', config.port, JSON.stringify(config, null, 4));
});
