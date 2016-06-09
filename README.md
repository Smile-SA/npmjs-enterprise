# npmjs-enterprise

npmjs for enterprise: caches JSONs and attachments (.tgz files) on the File System

## Features

   * central registry downtime free
   * reduces bandwidth usage
   * speeds up packages download

### Architecture

![Architecture diagram](/resources/architecture.png)

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
