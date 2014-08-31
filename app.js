'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var request = require('request');
require('string.prototype.endswith');

var log4js = require('log4js');
log4js.configure('log4js.json', {reloadSecs: 10});
var logger = log4js.getLogger('app');

var config = {
  'port': 1337,
  'localURL': 'http://localhost:5984/registry/_design/app/_rewrite',
  'centralURL': 'http://registry.npmjs.org',
  'regex': new RegExp('http://registry.npmjs.org', 'g'),
  'attachmentURL': 'http://localhost:1337',
  'attachmentPath': '/tmp/npmAttachments'
}

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

http.createServer(function (req, resp) {
  logger.debug(req.url);
  if (req.url.endsWith('.tgz')) {
    manageAttachment(req, resp);
  } else {
    logger.debug(req.url + ' : forwarding to couchDB and replacing attachment URLs');
    request.get(config.localURL + req.url, function (error, response, body) {
      body = body.replace(config.regex, config.attachmentURL);
      resp.end(body);
    });
  }
}).listen(config.port, function () {
    logger.info('Server running at http://localhost:%s with config:\n%s', config.port, JSON.stringify(config, null, 4));
  });