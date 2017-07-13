var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
var mkdirp = require('mkdirp');
var request = require('request');
var zlib = require('zlib');
var changes = require('concurrent-couch-follower');
var JSONStream = require('JSONStream');
var es = require('event-stream');
var etag = require('nginx-etag');

var config = require('./configLoader');

var logger = config.logger;

var api = {};

var httpCentralUrl = config.centralURL.replace('https', 'http');
var httpsCentralUrl = httpCentralUrl.replace('http', 'https');
var sequenceFile = path.join(config.attachmentPath, '.sequence');

function verifyShasum(tmpFilePath, tarball, filePath) {
  var hash = crypto.createHash('sha1');
  fs.createReadStream(tmpFilePath).on('data', function(data) {
    hash.update(data);
  })
    .on('end', function() {
      var shasum = hash.digest('hex');
      var targetShasum;
      request({
        // We request ourselves to benefit from JSON caching!
        baseUrl: 'http://localhost:' + config.port,
        url: tarball.name
      })
      // Extract shasum of the correct version
        .pipe(JSONStream.parse(['versions', tarball.version, 'dist', 'shasum']))
        .pipe(es.mapSync(function(data) {
          targetShasum = data;
          if (targetShasum === shasum) {
            logger.trace('Correct shasum %s for file %s.', shasum, tmpFilePath);
            mkdirp(path.dirname(filePath), function() {
              fs.rename(tmpFilePath, filePath);
            });
          } else {
            logger.error('Incorrect shasum %s for file %s (expected: %s): we delete the file.', shasum, tmpFilePath, targetShasum);
            fs.unlink(tmpFilePath);
          }
        }))
        .on('end', function() {
          if (targetShasum === undefined) {
            logger.error('Unavailable shasum for version %s of module %s: we delete the file.', tarball.version, tarball.name);
            fs.unlink(tmpFilePath);
          }
        });
    });
}

function verifyJson(tmpFilePath, filePath) {
  fs.readFile(tmpFilePath, 'utf8', function(err, jsonData) {
    var isJSON = true;
    try {
      var json = JSON.parse(jsonData);
    } catch (e) {
      isJSON = false;
      logger.error('File %s is not a valid JSON: we delete the JSON files.', tmpFilePath, e);
    }
    if (!isJSON || !json.name || !json.versions || !json.time) {
      if (isJSON) {
        logger.error('File %s is a valid JSON but it lacks one property among "name", "versions" and "time".', tmpFilePath);
      }
      fs.unlinkSync(tmpFilePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      logger.trace('File %s is a valid JSON.', tmpFilePath);
      var latest = (json['dist-tags']) ? json['dist-tags'].latest : '';
      logger.debug('Saving new version of %s: %s', json.name, latest);
      mkdirp(path.dirname(filePath), function() {
        fs.rename(tmpFilePath, filePath);
      });
    }
  })
}

/**
 * Serve attachment from file system if present, else serve it from central registry (and save it on file system)
 * @param req request
 * @param resp response
 * @param {Tarball} tarball - tarball
 */
api.manageAttachment = function(req, resp, tarball) {
  var fileName = path.basename(req.url);
  var tmpFilePath = path.join(config.attachmentPath, fileName + '.tmp');
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
      var tmpFileStream = fs.createWriteStream(tmpFilePath);
      couchDBStream.pipe(tmpFileStream);

      tmpFileStream.on('finish', function() {
        logger.trace('File %s is completely written', tmpFilePath);
        verifyShasum(tmpFilePath, tarball, filePath);
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
      .pipe(es.replace(httpsCentralUrl, config.proxyURL))
      .pipe(es.replace(httpCentralUrl, config.proxyURL))
      .pipe(resp);
  });
}
/**
 * Serve JSON of a module from local (or central) registry with attachment URL replacement
 * @param req request
 * @param resp response
 * @param {Module} module - module
 */
api.manageModule = function(req, resp, module) {
  // TODO: We do NOT handle requests with version for now
  if (module.version) {
    proxyToCentralRepositoryAndReplaceUrls(req, resp);
  } else {
    var tmpFilePath = path.join(config.attachmentPath, module.name + '.json.tmp');
    var filePath = path.join(config.attachmentPath, module.name + '.json');
    fs.exists(filePath, function(exists) {
      if (exists) {
        etag.fromFile(filePath, function(err, jsonEtag) {
          var ifNoneMatch = req.headers['if-none-match'];
          if (ifNoneMatch && ifNoneMatch === jsonEtag) {
            logger.debug('%s: client cache up to date. Replying "Not Modified"', req.url);
            resp.writeHead(304);
            resp.end();
          } else {
            logger.debug('%s: serving JSON from file system: %s', req.url, filePath);
            resp.setHeader('etag', jsonEtag);
            fs.createReadStream(filePath)
              .pipe(es.replace(httpsCentralUrl, config.proxyURL))
              .pipe(es.replace(httpCentralUrl, config.proxyURL))
              .pipe(resp);
          }
        });
      } else {
        var downloadURL = config.centralURL + req.url;
        logger.debug('%s: downloading, saving and serving JSON from central registry: %s', req.url, downloadURL);
        req.pipe(request(downloadURL))
          .on('response', function(response) {
            response = unzipIfRequired(response);
            response
              .pipe(es.replace(httpsCentralUrl, config.proxyURL))
              .pipe(es.replace(httpCentralUrl, config.proxyURL))
              .pipe(resp);
            var tmpFileStream = fs.createWriteStream(tmpFilePath);
            response.pipe(tmpFileStream);
            tmpFileStream.on('finish', function() {
              logger.trace('File %s is completely written', tmpFilePath);
              verifyJson(tmpFilePath, filePath);
            })
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
    // Replace "/" by "%2f" for scoped modules
    var moduleName = data.id.replace('/', '%2f');
    var fileName = moduleName + '.json';
    var filePath = path.join(config.attachmentPath, fileName);

    fs.exists(filePath, function(exists) {
      if (exists) {
        logger.debug('Updating %s module (seq: %s)', data.id, data.seq);
        // We can't use data.doc as it could contain invalid semver (e.g.: grunt-0.4.0a). To prevent this problem, we then download the JSON from central registry which retains only valid versions.
        // As change detection and json download are from 2 different server, we add a delay to prevent downloading a not up to date json.
        setTimeout(function() {
          // Delete deprecated file
          fs.unlinkSync(filePath);
          // Request the module from ourselves to trigger json save
          request(
            {
              baseUrl: 'http://localhost:' + config.port,
              url: moduleName
            },
            done
          );
        }, config.delay);
      } else {
        logger.trace('New %s module (seq: %s), but we don\'t use it', data.id, data.seq);
        done();
      }
    });
  }, {
    db: config.syncURL,
    now: true,
    sequence: sequenceFile,
    include_docs: false,
    concurrency: 1
  });

  var seq = stream.sequence();
  if (seq === 0) {
    logger.debug('Starting sync from latest sequence number on %s', config.syncURL);
  } else {
    logger.debug('Restarting sync from %s since sequence number %s', config.syncURL, seq);
  }
};

module.exports = api;
