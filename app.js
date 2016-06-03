'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var request = require('request');
var replacestream = require('replacestream');
var zlib = require('zlib');
require('string.prototype.endswith');

var log4js = require('log4js');
log4js.configure('log4js.json', {reloadSecs: 10});
var logger = log4js.getLogger('app');

var config = require('./lib/configLoader');

function manageAttachment(req, resp) {
  var filePath = path.join(config.attachmentPath, req.url);
  fs.exists(filePath, function (exists) {
    if (exists) {
      logger.debug('Serving attachment from file system: ' + filePath);
      fs.createReadStream(filePath).pipe(resp);
    } else {
      var downloadURL = config.centralURL + req.url;
      logger.debug('Downloading, saving and serving attachment from central registry: ' + downloadURL);
      mkdirp(path.dirname(filePath), function () {
        var stream = request.get(downloadURL);
        stream.pipe(fs.createWriteStream(filePath));
        stream.pipe(resp);
      });
    }
  });
}

// Inspired from https://github.com/mojombo/semver/issues/110#issuecomment-19433284, but more permissive (allow leading zeros) and non capturing
var versionRegexp = '(\\d+\\.\\d+\\.\\d+(?:-(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)';
var tarballRegexp = new RegExp('^(\\/@([^/]+))?\\/([^/]+)\\/-\\/[^/]+?-' + versionRegexp + '\\.tgz$');
var scopedModuleRegexp = new RegExp('^\\/\\@([^/]+)%2f.+$');

var httpCentralUrl = config.centralURL.replace('https', 'http');
var httpsCentralUrl = httpCentralUrl.replace('http', 'https');

process.on('uncaughtException', function(err) {
  logger.error('Uncaught exception: %s', err);
});

http.createServer(function (req, resp) {
  logger.debug(req.url);

  try {
    if (req.url.match(tarballRegexp) != null) {
      manageAttachment(req, resp);
    } else {
      var couchDBUrl = config.couchURL;

      // FIXME: For now, scoped modules are not synced via couchdb (https://github.com/npm/registry/issues/13), so we query the central one instead
      var isScopedModule = (req.url.match(scopedModuleRegexp) != null);
      if (isScopedModule) {
        couchDBUrl = config.centralURL;
      }

      logger.debug('%s: forwarding to couchDB (%s)', req.url, couchDBUrl);

      // Read AND Write stream
      var couchDBStream = request(couchDBUrl + req.url);
      // Proxy the request to couchDB
      req.pipe(couchDBStream);
      // We only replace attachment URLs in GET
      if (req.method === 'GET') {
        logger.debug('Responding with attachment URL replacement');

        couchDBStream.on('response', function (response) {
          var contentEncoding = response.headers['content-encoding'];
          if (contentEncoding === 'gzip') {
            // Response is gzip-ed, we ungzip it in order to be able to replace content
            response = response.pipe(zlib.createGunzip());
          }
          response
            .pipe(replacestream(httpsCentralUrl, config.proxyURL))
            .pipe(replacestream(httpCentralUrl, config.proxyURL))
            .pipe(resp);
        });
      } else {
        couchDBStream.pipe(resp);
      }
    }
  } catch (error) {
    logger.error(error);
  }
}).listen(config.port, function () {
  logger.info('Server running at http://localhost:%s with config:\n%s', config.port, JSON.stringify(config, null, 4));
});
