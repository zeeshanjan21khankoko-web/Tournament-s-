/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-8d0d8005'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "0581696ff6e06f8923b7114ccc672987"
  }, {
    "url": "pwa-512x512.png",
    "revision": "a6e63ca31eb49a78d65be808108a03b9"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f78c35b049ccdef72cea8ade9a05c4e0"
  }, {
    "url": "index.html",
    "revision": "198ac7e4f18f3524530ef6cd17daefc4"
  }, {
    "url": "favicon.ico",
    "revision": "413272ec2673f6bd97263f44eeab5e00"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "c357e465cd1c03fef0a58388d0ae3982"
  }, {
    "url": "src/assets/images/tournament_valorant_cyber_1795298801660.jpg",
    "revision": "2d0e9b5b1c3c85df10a0e1508d7194fc"
  }, {
    "url": "src/assets/images/tournament_pubg_arena_1795298801850.jpg",
    "revision": "f12c8ad20a8f6b6a1bde5cbd4f8b80e4"
  }, {
    "url": "src/assets/images/tournament_freefire_clash_1795298801818.jpg",
    "revision": "1a9bf7320a1c200bc499d6e8af68ad31"
  }, {
    "url": "src/assets/images/kelly_tournament_banner_1795312123415.jpg",
    "revision": "e6a79b910f63e9012d2e22121b7f6a44"
  }, {
    "url": "src/assets/images/kelly_hero_banner_1795312122819.jpg",
    "revision": "90623e962404f9337b68425aed0ce5ec"
  }, {
    "url": "src/assets/images/clash_squad_arena_1795312122438.jpg",
    "revision": "ffee794ac1215de0b81c3cd8ff0e8dc8"
  }, {
    "url": "src/assets/images/avatar_esports_pro_1795298801657.jpg",
    "revision": "ed7fd8eb276f426d12f665b1eadd2356"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/kelly_hero_banner_1795312122819-Cp6Um1Un.jpg",
    "revision": null
  }, {
    "url": "assets/index-ChRvCbBz.js",
    "revision": null
  }, {
    "url": "assets/index-BQTC8Ttt.css",
    "revision": null
  }, {
    "url": "assets/aistudio/lv_0_20261122033158_1d7a0b5d.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "c357e465cd1c03fef0a58388d0ae3982"
  }, {
    "url": "favicon.ico",
    "revision": "413272ec2673f6bd97263f44eeab5e00"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f78c35b049ccdef72cea8ade9a05c4e0"
  }, {
    "url": "pwa-512x512.png",
    "revision": "a6e63ca31eb49a78d65be808108a03b9"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "0581696ff6e06f8923b7114ccc672987"
  }, {
    "url": "manifest.webmanifest",
    "revision": "7fccdc08f8bfa1b384137c6f054cf991"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/\/api\/tournaments$/i, new workbox.NetworkFirst({
    "cacheName": "tournaments-api-cache",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
