// Inspired from https://github.com/mojombo/semver/issues/110#issuecomment-19433284, but more permissive (allow leading zeros) and non capturing
var versionRegexp = '(\\d+\\.\\d+\\.\\d+(?:-(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)';
var tarballRegexp = new RegExp('^\\/((?:@[^/]+\\/)?[^/]+)\\/-\\/[^/]+?-' + versionRegexp + '\\.tgz$');
var moduleRegexp = new RegExp('^\\/([^/]+)(?:/?([^/]+)?/?)$');
var scopedModuleRegexp = new RegExp('^\\/\\@([^/]+)%2f.+/?$');

var api = {};

/**
 * Module
 * @param {String} name - name of the module
 * @param {String} version - version of the module
 * @param {Boolean} scoped - whether it is a scoped module
 * @constructor
 */
function Module(name, version, scoped) {
  this.name = name;
  this.version = version;
  this.scoped = scoped;
}

/**
 * Tarball
 * @param {String} name - name of the module
 * @param {String} version - version of the module
 * @constructor
 */
function Tarball(name, version) {
  this.name = name;
  this.version = version;
}

/**
 * Extracts module info from url if it matches a module url
 * @param {String} url - url
 * @return {Module}
 */
api.module = function(url) {
  var moduleMatch = url.match(moduleRegexp);
  if (!moduleMatch) {
    return null;
  } else {
    return new Module(
      moduleMatch[1],
      moduleMatch[2],
      url.match(scopedModuleRegexp) !== null
    );
  }
};

/**
 * Extracts tarball info from url if it matches a tarball url
 * @param {String} url - url
 * @return {Tarball}
 */
api.tarball = function(url) {
  var tarballMatch = url.match(tarballRegexp);
  if (!tarballMatch) {
    return null;
  } else {
    return new Tarball(
      tarballMatch[1].replace('/', '%2f'),
      tarballMatch[2]
    );
  }
};

module.exports = api;
