var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var request = require('request');
var replacestream = require('replacestream');
var zlib = require('zlib');
var changes = require('concurrent-couch-follower');

var config = require('./configLoader');

var logger = config.logger;

var api = {};

var scopedModuleRegexp = new RegExp('^\\/\\@([^/]+)%2f.+$');
var httpCentralUrl = config.centralURL.replace('https', 'http');
var httpsCentralUrl = httpCentralUrl.replace('http', 'https');
var sequenceFile = path.join(config.attachmentPath, '.sequence');

/**
 * Serve attachment from file system if present, else serve it from central registry (and save it on file system)
 * @param req request
 * @param resp response
 */
api.manageAttachment = function(req, resp) {
  var filePath = path.join(config.attachmentPath, req.url);
  fs.exists(filePath, function(exists) {
    if (exists) {
      logger.debug('%s: serving attachment from file system: %s', req.url, filePath);
      fs.createReadStream(filePath).pipe(resp);
    } else {
      var downloadURL = config.centralURL + req.url;
      logger.debug('%s: downloading, saving and serving attachment from central registry: %s', req.url, downloadURL);
      var couchDBStream = request(downloadURL);
      req.pipe(couchDBStream);
      couchDBStream.pipe(resp);
      mkdirp(path.dirname(filePath), function() {
        couchDBStream.pipe(fs.createWriteStream(filePath));
      });
    }
  });
};

function proxyToCentralRepositoryAndReplaceUrls(req, resp) {
  var couchDBUrl = config.centralURL;

  logger.debug('%s: forwarding to repository (%s) and responding with attachment URL replacement', req.url, couchDBUrl);

  var couchDBStream = request(couchDBUrl + req.url);
  req.pipe(couchDBStream);
  couchDBStream.on('response', function(response) {
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
}

/**
 * Serve JSON of a module from local (or central) registry with attachment URL replacement
 * @param req request
 * @param resp response
 */
api.manageModule = function(req, resp) {
  // FIXME: For now, scoped modules are not synced via couchdb (https://github.com/npm/registry/issues/13), so we query the central one instead
  var isScopedModule = req.url.match(scopedModuleRegexp) != null;

  if (isScopedModule) {
    proxyToCentralRepositoryAndReplaceUrls(req, resp);
  } else {
    var filePath = path.join(config.attachmentPath, req.url + '.json');
    fs.exists(filePath, function(exists) {
      if (exists) {
        logger.debug('%s: serving JSON from file system: %s', req.url, filePath);
        fs.createReadStream(filePath)
          .pipe(replacestream(httpsCentralUrl, config.proxyURL))
          .pipe(replacestream(httpCentralUrl, config.proxyURL))
          .pipe(resp);
      } else {
        var downloadURL = config.centralURL + req.url;
        logger.debug('%s: downloading, saving and serving JSON from central registry: %s', req.url, downloadURL);
        mkdirp(path.dirname(filePath), function() {
          var couchDBStream = request(downloadURL);
          req.pipe(couchDBStream);
          couchDBStream.on('response', function(response) {
            var contentEncoding = response.headers['content-encoding'];
            if (contentEncoding === 'gzip') {
              // Response is gzip-ed, we ungzip it in order to be able to replace content
              response = response.pipe(zlib.createGunzip());
            }
            response.pipe(fs.createWriteStream(filePath));
            response
              .pipe(replacestream(httpsCentralUrl, config.proxyURL))
              .pipe(replacestream(httpCentralUrl, config.proxyURL))
              .pipe(resp);
          });
        });
      }
    });
  }
};

/**
 * Proxy to central repository
 * @param req request
 * @param resp response
 */
api.proxyToCentralRepository = function(req, resp) {
  var centralCouchDBUrl = config.centralURL;
  logger.debug('%s: forwarding to central repository (%s)', req.url, centralCouchDBUrl);
  var centralCouchDBStream = request(centralCouchDBUrl + req.url);
  req.pipe(centralCouchDBStream);
  centralCouchDBStream.pipe(resp);
};

api.initChangesSync = function() {
  mkdirp.sync(path.dirname(sequenceFile));
  var sequenceNumberToRestartFrom;
  if (fs.existsSync(sequenceFile)) {
    sequenceNumberToRestartFrom = parseInt(fs.readFileSync(sequenceFile, 'utf-8'));
  }
  sequenceNumberToRestartFrom = sequenceNumberToRestartFrom || 'now';

  if (sequenceNumberToRestartFrom === 'now') {
    logger.debug('Starting sync from latest sequence number on %s', config.skimdbURL);
  } else {
    logger.debug('Restarting sync from %s since sequence number %s', config.skimdbURL, sequenceNumberToRestartFrom);
  }

  changes(function(data, done) {
    var filePath = path.join(config.attachmentPath, data.id + '.json');

    fs.exists(filePath, function(exists) {
      if (exists) {
        logger.debug('Updating %s module (seq: %s)', data.id, data.seq);
        fs.writeFile(filePath, JSON.stringify(data), done);
      } else {
        logger.trace('New %s module (seq: %s), but we don\'t use it', data.id, data.seq);
        done();
      }
    });
  }, {
    db: config.skimdbURL,
    since: sequenceNumberToRestartFrom,
    sequence: sequenceFile,
    include_docs: true,
    concurrency: 1
  });
};

module.exports = api;
