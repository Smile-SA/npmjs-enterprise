# npmjs-enterprise

npmjs for enterprise: proxies requests to a locally-hosted central-registry-replication CouchDB instance, caches attachments (.tgz files) on the File System and allows to publish private packages

## Features

   * central registry downtime free
   * reduces bandwidth usage
   * speeds up packages download
   * private packages

### Architecture

![Architecture diagram](/resources/architecture.png)

## Prerequisites

   * install npm-registry-couchapp (follow https://github.com/npm/npm-registry-couchapp#installing)
   * replicate the skimdb registry (follow https://github.com/npm/npm-registry-couchapp#replicating-the-registry)

## Install

First, clone the repo. Then:

```sh
npm install
```

## Configure

   * Copy the "config.js.sample" file as "config.js"
   * Edit the "config.js" configuration file to fit your needs

## Apache reverse proxy configuration

If you want to use an Apache reverse proxy, you can use the following configuration:

```
# AllowEncodedSlashes required for scoped modules that have URLs of the form "@scope%2fmodule" (with %2f corresponding to url-encoded "/") 
AllowEncodedSlashes NoDecode
# "nocanon" required to prevent "%2f" to be encoded to %252f
ProxyPass           / http://localhost:1337/  nocanon
ProxyPassReverse    / http://localhost:1337/
ProxyPreserveHost   On
```

## Run

```sh
node app.js
```

## Use

On the npm user computer, configure npm to use your proxy:

```sh
npm set registry "[proxyURL]"
```
