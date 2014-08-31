# npmjs-enterprise

npmjs for enterprise

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

## Run

```sh
node app.js
```

## Use

On the npm user computer, configure npm to use your proxy:

```sh
npm set registry "[proxyURL]"
```