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
define(['./workbox-a454db71'], (function (workbox) { 'use strict';

	self.skipWaiting();
	workbox.clientsClaim();
	/**
	 * The precacheAndRoute() method efficiently caches and responds to
	 * requests for URLs in the manifest.
	 * See https://goo.gl/S9QRab
	 */
	workbox.precacheAndRoute([{
	  "url": "index.html",
	  "revision": "0.g92mjs0q7ng"
	}], {});
	workbox.cleanupOutdatedCaches();
	workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
	  allowlist: [/^\/$/],
	  denylist: [/^\/api\//, /^\/__\//]
	}));
	workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.StaleWhileRevalidate({
	  "cacheName": "nizal-google-fonts-css",
	  plugins: [new workbox.ExpirationPlugin({
	    maxEntries: 20,
	    maxAgeSeconds: 31536000
	  })]
	}), 'GET');
	workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
	  "cacheName": "nizal-google-fonts-files",
	  plugins: [new workbox.ExpirationPlugin({
	    maxEntries: 30,
	    maxAgeSeconds: 31536000
	  }), new workbox.CacheableResponsePlugin({
	    statuses: [0, 200]
	  })]
	}), 'GET');
	workbox.registerRoute(({
	  url,
	  request
	}) => {
	  if (request.method !== "GET") return false;
	  if (url.hostname.includes("identitytoolkit.googleapis.com") || url.hostname.includes("securetoken.googleapis.com") || url.hostname.includes("firestore.googleapis.com") || url.hostname.includes("firebaseinstallations.googleapis.com")) return false;
	  const isStorageMedia = url.hostname.includes("firebasestorage.googleapis.com") || url.hostname.includes("storage.googleapis.com") || url.hostname.includes("res.cloudinary.com");
	  const isImageExt = /\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(url.pathname);
	  return isStorageMedia || url.origin !== self.location.origin && isImageExt;
	}, new workbox.StaleWhileRevalidate({
	  "cacheName": "nizal-offline-media-v1",
	  plugins: [new workbox.ExpirationPlugin({
	    maxEntries: 500,
	    maxAgeSeconds: 2592000
	  }), new workbox.CacheableResponsePlugin({
	    statuses: [0, 200]
	  })]
	}), 'GET');

}));
