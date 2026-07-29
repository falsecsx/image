/**
 * Platform Configuration & Protocol Router (v2)
 * Provides a registry for image request builders. Actual network I/O lives in app.js.
 */
(function () {
  window.ImageRequestBuilders = window.ImageRequestBuilders || {};

  window.registerProtocol = function registerProtocol(name, builderFn) {
    if (!name || typeof builderFn !== 'function') {
      throw new Error('registerProtocol requires a name and builder function');
    }
    window.ImageRequestBuilders[name] = builderFn;
  };

  // Keep a thin helper for diagnostics; app.js owns the real callImageAPI.
  window.getImageRequestBuilder = function getImageRequestBuilder(protocol) {
    return window.ImageRequestBuilders[protocol] || null;
  };
})();
