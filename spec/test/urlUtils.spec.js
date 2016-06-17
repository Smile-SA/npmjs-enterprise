(function() {
  'use strict';

  var urlUtils = require('../../lib/urlUtils');

  describe('urlUtils.module', function() {
    it('of "/grunt" should detect module "grunt"', function() {
      var module = urlUtils.module('/grunt');
      expect(module).toBeTruthy();
      expect(module.name).toBe('grunt');
      expect(module.version).not.toBeDefined();
      expect(module.scoped).toBeFalsy();
    });

    it('of "/grunt/" should detect module "grunt"', function() {
      var module = urlUtils.module('/grunt/');
      expect(module).toBeTruthy();
      expect(module.name).toBe('grunt');
      expect(module.version).not.toBeDefined();
      expect(module.scoped).toBeFalsy();
    });

    it('of "/grunt/1.0.0" should detect module "grunt" and version "1.0.0"', function() {
      var module = urlUtils.module('/grunt/1.0.0');
      expect(module).toBeTruthy();
      expect(module.name).toBe('grunt');
      expect(module.version).toBe("1.0.0");
      expect(module.scoped).toBeFalsy();
    });

    it('of "/grunt/1.0.0/" should detect module "grunt" and version "1.0.0"', function() {
      var module = urlUtils.module('/grunt/1.0.0/');
      expect(module).toBeTruthy();
      expect(module.name).toBe('grunt');
      expect(module.version).toBe("1.0.0");
      expect(module.scoped).toBeFalsy();
    });

    it('of "/@jenkins-cd%2fjs-extensions" should detect module "@jenkins-cd%2fjs-extensions"', function() {
      var module = urlUtils.module('/@jenkins-cd%2fjs-extensions');
      expect(module).toBeTruthy();
      expect(module.name).toBe('@jenkins-cd%2fjs-extensions');
      expect(module.version).not.toBeDefined();
      expect(module.scoped).toBeTruthy();
    });

    it('of "/@jenkins-cd%2fjs-extensions/" should detect module "@jenkins-cd%2fjs-extensions"', function() {
      var module = urlUtils.module('/@jenkins-cd%2fjs-extensions/');
      expect(module).toBeTruthy();
      expect(module.name).toBe('@jenkins-cd%2fjs-extensions');
      expect(module.version).not.toBeDefined();
      expect(module.scoped).toBeTruthy();
    });

    it('of "/not/a/module" should detect module "grunt"', function() {
      var module = urlUtils.module('/not/a/module');
      expect(module).toBeFalsy();
    });
  });

  describe('urlUtils.tarball', function() {
    it('of "/grunt/-/grunt-0.1.0.tgz" should detect module "grunt" and version "0.1.0"', function() {
      var module = urlUtils.tarball('/grunt/-/grunt-0.1.0.tgz');
      expect(module).toBeTruthy();
      expect(module.name).toBe('grunt');
      expect(module.version).toBe("0.1.0");
    });

    it('of "/@jenkins-cd/js-extensions/-/js-extensions-0.0.2.tgz" should detect module "@jenkins-cd%2fjs-extensions" and version "0.0.2"', function() {
      var module = urlUtils.tarball('/@jenkins-cd/js-extensions/-/js-extensions-0.0.2.tgz');
      expect(module).toBeTruthy();
      expect(module.name).toBe('@jenkins-cd%2fjs-extensions');
      expect(module.version).toBe("0.0.2");
    });

    it('of "/not/a/tarball" should detect module "grunt" and version "0.1.0"', function() {
      var module = urlUtils.tarball('/not/a/tarball');
      expect(module).toBeFalsy();
    });
  });
})();
