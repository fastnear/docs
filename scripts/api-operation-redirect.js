/* Redirect pretty API routes to their interactive operation pages. */
(function () {
  var routeMaps = globalThis.__FASTNEAR_OPERATION_ROUTES__;
  if (!routeMaps) {
    return;
  }

  var pathname = window.location.pathname;
  if (pathname.includes("/openapi/")) {
    return;
  }

  var redirectTarget = pathname.startsWith("/reference/operation/")
    ? routeMaps.legacyRpcReferenceRoute &&
      routeMaps.legacyRpcReferenceRoute[pathname]
    : routeMaps.prettyToOperationRoute &&
      routeMaps.prettyToOperationRoute[pathname];

  if (!redirectTarget || redirectTarget === pathname) {
    return;
  }

  window.location.replace(
    redirectTarget + window.location.search + window.location.hash
  );
})();
