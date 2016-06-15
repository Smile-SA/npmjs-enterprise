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

function unzipIfRequired(response) {
  var contentEncoding = response.headers['content-encoding'];
  if (contentEncoding === 'gzip') {
    // Response is a gzip stream, we gunzip it in order to be able to replace content
    response = response.pipe(zlib.createGunzip());
  } else if (contentEncoding === 'deflate') {
    // Response is a deflate stream, we inflate it in order to be able to replace content
    response = response.pipe(zlib.createInflate());
  }
  return response;
}

function proxyToCentralRepositoryAndReplaceUrls(req, resp) {
  var centralCouchDBUrl = config.centralURL;
  logger.debug('%s: forwarding to repository (%s) and responding with attachment URL replacement', req.url, centralCouchDBUrl);
  var centralRegistry = {
    baseUrl: centralCouchDBUrl,
    url: req.url
  };
  req.pipe(request(centralRegistry)).on('response', function(response) {
    response = unzipIfRequired(response);
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
          req.pipe(request(downloadURL))
            .on('response', function(response) {
              response = unzipIfRequired(response);
              response
                .pipe(replacestream(httpsCentralUrl, config.proxyURL))
                .pipe(replacestream(httpCentralUrl, config.proxyURL))
                .pipe(resp);
              response.pipe(fs.createWriteStream(filePath));
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
  var centralRegistry = {
    baseUrl: centralCouchDBUrl,
    url: req.url
  };
  req.pipe(request(centralRegistry)).pipe(resp);
};

api.initChangesSync = function() {
  mkdirp.sync(path.dirname(sequenceFile));

  var stream = changes(function(data, done) {
    var filePath = path.join(config.attachmentPath, data.id + '.json');

    fs.exists(filePath, function(exists) {
      if (exists) {
        logger.debug('Updating %s module (seq: %s)', data.id, data.seq);
        // We can't use data.doc as it could contain invalid semver (e.g.: grunt-0.4.0a). To prevent this problem, we then download the JSON from central registry which retains only valid versions.
        request(
          {
            baseUrl: config.centralURL,
            url: data.id
          },
          done
        ).pipe(fs.createWriteStream(filePath));
      } else {
        logger.trace('New %s module (seq: %s), but we don\'t use it', data.id, data.seq);
        done();
      }
    });
  }, {
    db: config.skimdbURL,
    now: true,
    sequence: sequenceFile,
    include_docs: false,
    concurrency: 1
  });

  var seq = stream.sequence();
  if (seq === 0) {
    logger.debug('Starting sync from latest sequence number on %s', config.skimdbURL);
  } else {
    logger.debug('Restarting sync from %s since sequence number %s', config.skimdbURL, seq);
  }
};

module.exports = api;
