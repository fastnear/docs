#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const ROOT = path.resolve(__dirname, "..");

const GENERATED_TS_MODULE = path.resolve(
  ROOT,
  "shared/generatedOperationRoutes.ts"
);
const GENERATED_BROWSER_SCRIPT = path.resolve(
  ROOT,
  "scripts/generated-operation-routes.js"
);

const ROUTE_SOURCES = [
  {
    baseUrl: "/apis/fastnear",
    dir: path.resolve(ROOT, "apis/fastnear"),
    includeInCanonicalMap: true,
  },
  {
    baseUrl: "/apis/transactions",
    dir: path.resolve(ROOT, "apis/transactions"),
    includeInCanonicalMap: true,
  },
  {
    baseUrl: "/apis/transfers",
    dir: path.resolve(ROOT, "apis/transfers"),
    includeInCanonicalMap: true,
  },
  {
    baseUrl: "/apis/kv-fastdata",
    dir: path.resolve(ROOT, "apis/kv-fastdata"),
    includeInCanonicalMap: true,
  },
  {
    baseUrl: "/apis/neardata",
    dir: path.resolve(ROOT, "apis/neardata"),
    includeInCanonicalMap: true,
  },
];

const LEGACY_RPC_REFERENCE_SOURCE = {
  baseUrl: "/rpcs",
  dir: path.resolve(ROOT, "rpcs"),
};

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

function listLeafSpecs(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listLeafSpecs(absolutePath, baseDir));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".yaml") &&
      entry.name !== "openapi.yaml"
    ) {
      files.push(path.relative(baseDir, absolutePath));
    }
  }

  return files.sort();
}

function getSingleOperation(spec, sourceFile) {
  const paths = Object.entries(spec.paths || {});
  if (paths.length !== 1) {
    throw new Error(
      `Expected ${sourceFile} to contain exactly one OpenAPI path; found ${paths.length}.`
    );
  }

  const [, pathItem] = paths[0];
  const operations = Object.entries(pathItem || {}).filter(
    ([method, value]) => HTTP_METHODS.has(method) && value && typeof value === "object"
  );

  if (operations.length !== 1) {
    throw new Error(
      `Expected ${sourceFile} to contain exactly one OpenAPI operation; found ${operations.length}.`
    );
  }

  const [, operation] = operations[0];
  const operationId = operation.operationId;
  const tag = Array.isArray(operation.tags) ? operation.tags[0] : undefined;

  if (!operationId || !tag) {
    throw new Error(
      `Expected ${sourceFile} to define both tags[0] and operationId for route generation.`
    );
  }

  return {
    tag,
    operationId,
  };
}

function getSingleOperationId(spec, sourceFile) {
  const paths = Object.entries(spec.paths || {});
  if (paths.length !== 1) {
    throw new Error(
      `Expected ${sourceFile} to contain exactly one OpenAPI path; found ${paths.length}.`
    );
  }

  const [, pathItem] = paths[0];
  const operations = Object.entries(pathItem || {}).filter(
    ([method, value]) => HTTP_METHODS.has(method) && value && typeof value === "object"
  );

  if (operations.length !== 1) {
    throw new Error(
      `Expected ${sourceFile} to contain exactly one OpenAPI operation; found ${operations.length}.`
    );
  }

  const [, operation] = operations[0];
  if (!operation.operationId) {
    throw new Error(`Expected ${sourceFile} to define operationId for route generation.`);
  }

  return operation.operationId;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function buildOperationRoutes() {
  const prettyToOperationRoute = {};
  const aggregateOperationRouteToCanonical = {};
  const legacyRpcReferenceRoute = {};

  for (const source of ROUTE_SOURCES) {
    if (!fs.existsSync(source.dir)) {
      continue;
    }

    for (const relativePath of listLeafSpecs(source.dir)) {
      const sourceFile = path.join(source.dir, relativePath);
      const parsed = YAML.parse(fs.readFileSync(sourceFile, "utf8"));
      const { tag, operationId } = getSingleOperation(parsed, sourceFile);
      const routeSuffix = `/${toPosixPath(relativePath).replace(/\.yaml$/, "")}`;
      const prettyRoute = `${source.baseUrl}${routeSuffix}`;
      const operationRoute = `${source.baseUrl}/openapi/${tag}/${operationId}`;

      prettyToOperationRoute[prettyRoute] = operationRoute;

      if (source.includeInCanonicalMap) {
        aggregateOperationRouteToCanonical[operationRoute] = prettyRoute;
      }
    }
  }

  if (fs.existsSync(LEGACY_RPC_REFERENCE_SOURCE.dir)) {
    for (const relativePath of listLeafSpecs(LEGACY_RPC_REFERENCE_SOURCE.dir)) {
      if (!relativePath.includes("/")) {
        continue;
      }

      const sourceFile = path.join(LEGACY_RPC_REFERENCE_SOURCE.dir, relativePath);
      const parsed = YAML.parse(fs.readFileSync(sourceFile, "utf8"));
      const operationId = getSingleOperationId(parsed, sourceFile);
      const routeSuffix = `/${toPosixPath(relativePath).replace(/\.yaml$/, "")}`;

      legacyRpcReferenceRoute[`/reference/operation/${operationId}`] =
        `${LEGACY_RPC_REFERENCE_SOURCE.baseUrl}${routeSuffix}/other/${operationId}`;
    }
  }

  return {
    prettyToOperationRoute,
    aggregateOperationRouteToCanonical,
    legacyRpcReferenceRoute,
  };
}

function writeGeneratedFiles() {
  const routes = buildOperationRoutes();

  fs.mkdirSync(path.dirname(GENERATED_TS_MODULE), { recursive: true });
  fs.writeFileSync(
    GENERATED_TS_MODULE,
    [
      "/* This file is auto-generated by scripts/generate-operation-routes.js. */",
      "/* Do not edit it by hand; regenerate it via scripts/sync-external-apis.js. */",
      "",
      `export const PRETTY_TO_OPERATION_ROUTE = ${JSON.stringify(
        routes.prettyToOperationRoute,
        null,
        2
      )} as const;`,
      "",
      `export const AGGREGATE_OPERATION_ROUTE_TO_CANONICAL = ${JSON.stringify(
        routes.aggregateOperationRouteToCanonical,
        null,
        2
      )} as const;`,
      "",
      `export const LEGACY_RPC_REFERENCE_ROUTE = ${JSON.stringify(
        routes.legacyRpcReferenceRoute,
        null,
        2
      )} as const;`,
      "",
      "export type PrettyToOperationRouteMap = typeof PRETTY_TO_OPERATION_ROUTE;",
      "export type AggregateOperationRouteToCanonicalMap = typeof AGGREGATE_OPERATION_ROUTE_TO_CANONICAL;",
      "export type LegacyRpcReferenceRouteMap = typeof LEGACY_RPC_REFERENCE_ROUTE;",
      "",
    ].join("\n")
  );

  fs.mkdirSync(path.dirname(GENERATED_BROWSER_SCRIPT), { recursive: true });
  fs.writeFileSync(
    GENERATED_BROWSER_SCRIPT,
    [
      "/* This file is auto-generated by scripts/generate-operation-routes.js. */",
      "/* Do not edit it by hand; regenerate it via scripts/sync-external-apis.js. */",
      "(function () {",
      "  globalThis.__FASTNEAR_OPERATION_ROUTES__ = Object.freeze({",
      `    prettyToOperationRoute: ${JSON.stringify(routes.prettyToOperationRoute, null, 2)
        .split("\n")
        .join("\n    ")},`,
      `    legacyRpcReferenceRoute: ${JSON.stringify(routes.legacyRpcReferenceRoute, null, 2)
        .split("\n")
        .join("\n    ")},`,
      "  });",
      "})();",
      "",
    ].join("\n")
  );

  console.log(`Generated operation route modules: ${GENERATED_TS_MODULE}`);
  console.log(`Generated browser route map: ${GENERATED_BROWSER_SCRIPT}`);
}

if (require.main === module) {
  writeGeneratedFiles();
}

module.exports = {
  buildOperationRoutes,
  writeGeneratedFiles,
};
