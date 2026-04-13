import { DOCS_ENHANCEMENTS } from "../@theme/ext/generatedEnhancements";
import { AGGREGATE_OPERATION_ROUTE_TO_CANONICAL } from "../@theme/ext/generatedOperationRoutes";

type CustomPageConfig = {
  authTransport?: "bearer" | "query";
  kind?: string;
  operationRoute?: string;
  pageModelId?: string;
  replaceOperationPage?: boolean;
  sourceSpec?: string;
};

type EnhancementOperation = {
  customPage?: CustomPageConfig;
};

type EnhancementManifest = {
  operations?: Record<string, EnhancementOperation>;
};

const enhancementManifests = DOCS_ENHANCEMENTS as Record<string, EnhancementManifest>;

const customPagesByCanonicalPath: Record<string, CustomPageConfig> = Object.fromEntries(
  Object.values(enhancementManifests).flatMap((manifest) =>
    Object.entries(manifest.operations || {})
      .filter(([, operation]) => Boolean(operation?.customPage))
      .map(([pathname, operation]) => [pathname, operation.customPage as CustomPageConfig])
  )
);

export function getFastnearCanonicalPath(pathname?: string) {
  if (!pathname) {
    return undefined;
  }

  return AGGREGATE_OPERATION_ROUTE_TO_CANONICAL[pathname] || pathname;
}

export function getFastnearCustomPageForPath(pathname?: string) {
  const canonicalPath = getFastnearCanonicalPath(pathname);
  if (!canonicalPath) {
    return undefined;
  }

  return customPagesByCanonicalPath[canonicalPath];
}

export function getFastnearCustomPageByCanonicalPath(canonicalPath?: string) {
  if (!canonicalPath) {
    return undefined;
  }

  return customPagesByCanonicalPath[canonicalPath];
}
