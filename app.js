'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var request = require('request');
var replacestream = require('replacestream');
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
var versionRegexp = '(\\d+\\.\\d+\\.\\d+(?:-(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)'
var tarballRegexp = new RegExp('^\\/([^/]+)\\/-\\/[^/]+?-' + versionRegexp + '\\.tgz$');

http.createServer(function (req, resp) {
  logger.debug(req.url);

  if (req.url.match(tarballRegexp) != null) {
    manageAttachment(req, resp);
  } else {
    logger.debug(req.url + ' : forwarding to couchDB');

    // Read AND Write stream
    var couchDBStream = request(config.couchURL + req.url);
    // Proxy the request to couchDB
    req.pipe(couchDBStream);
    // We only replace attachment URLs in GET
    if (req.method === 'GET') {
      logger.debug('Responding with attachment URL replacement');
      couchDBStream.pipe(replacestream(config.centralURL, config.proxyURL)).pipe(resp);
    } else {
      couchDBStream.pipe(resp);
    }
  }
}).listen(config.port, function () {
    logger.info('Server running at http://localhost:%s with config:\n%s', config.port, JSON.stringify(config, null, 4));
  });