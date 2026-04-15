import React, { useId, useMemo, useState } from "react";

import type { FastnearPageModel } from "./fastnearPageModel";

function getSchemaTypeLabel(schema: any): string {
  if (!schema) {
    return "unknown";
  }

  if (schema.oneOf?.length) {
    return "one of";
  }

  if (schema.anyOf?.length) {
    return "any of";
  }

  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }

  if (schema.type) {
    return schema.type;
  }

  if (schema.properties?.length) {
    return "object";
  }

  if (schema.items) {
    return "array";
  }

  return "value";
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function renderInlineCodeText(text?: string | null) {
  if (!text) {
    return null;
  }

  return text.split(/(`[^`]+`)/g).map((segment, index) => {
    if (segment.startsWith("`") && segment.endsWith("`") && segment.length >= 2) {
      return <code key={`code-${index}`}>{segment.slice(1, -1)}</code>;
    }

    return <React.Fragment key={`text-${index}`}>{segment}</React.Fragment>;
  });
}

function buildExamplePath(pathTemplate: string, pathValues: Record<string, any>) {
  return Object.entries(pathValues || {}).reduce((currentPath, [key, value]) => {
    return currentPath.replace(`{${key}}`, encodeURIComponent(String(value)));
  }, pathTemplate);
}

function buildExampleSearch(queryValues: Record<string, any>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(queryValues || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

function buildHttpExample(pageModel: FastnearPageModel, example: FastnearPageModel["request"]["examples"][number]) {
  const request = example?.request || {};
  const pathValues = request.path || {};
  const queryValues = request.query || {};
  const renderedPath = buildExamplePath(pageModel.route.path, pathValues);
  const renderedSearch = buildExampleSearch(queryValues);
  return `${pageModel.route.method} ${renderedPath}${renderedSearch}`;
}

function hasHttpRequestBody(pageModel: FastnearPageModel) {
  return pageModel.route.transport === "http" && Boolean(pageModel.request.bodySchema);
}

function formatNetworkTabLabel(network: string) {
  return network.charAt(0).toUpperCase() + network.slice(1);
}

function shouldUseNetworkTabLabels(
  requestExamples: FastnearPageModel["request"]["examples"]
) {
  const networkExamples = requestExamples.filter((example) => example.network);
  return (
    requestExamples.length > 0 &&
    networkExamples.length === requestExamples.length &&
    new Set(networkExamples.map((example) => example.network)).size === requestExamples.length
  );
}

function getExampleTabLabel(
  requestExamples: FastnearPageModel["request"]["examples"],
  example: FastnearPageModel["request"]["examples"][number]
) {
  if (example.network && shouldUseNetworkTabLabels(requestExamples)) {
    return formatNetworkTabLabel(example.network);
  }

  return example.label;
}

function isInlineSchemaVariant(schema: any): boolean {
  if (!schema) {
    return false;
  }

  return !schema.properties?.length &&
    !schema.items &&
    !schema.additionalProperties &&
    !schema.oneOf?.length &&
    !schema.anyOf?.length &&
    !schema.description &&
    schema.default === undefined &&
    schema.example === undefined;
}

function getSchemaVariantLabel(schema: any, fallbackLabel: string): string {
  if (!schema) {
    return fallbackLabel;
  }

  if (schema.refName) {
    return schema.refName;
  }

  if (Array.isArray(schema.enum) && schema.enum.length === 1) {
    return String(schema.enum[0]);
  }

  const typeLabel = getSchemaTypeLabel(schema);
  if (schema.nullable && typeLabel && !String(typeLabel).includes("null")) {
    return `${typeLabel} | null`;
  }

  return typeLabel || fallbackLabel;
}

function shouldInlineSchemaVariants(variants: any[] | undefined): boolean {
  return Array.isArray(variants) && variants.length > 0 && variants.every(isInlineSchemaVariant);
}

function SchemaNode({ schema, name, depth = 0 }: { schema: any; name?: string; depth?: number }) {
  if (!schema) {
    return null;
  }

  const typeLabel = getSchemaTypeLabel(schema);
  const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
  const inlineOneOf = shouldInlineSchemaVariants(schema.oneOf);
  const inlineAnyOf = shouldInlineSchemaVariants(schema.anyOf);

  return (
    <div className="fastnear-reference-schema__node" data-depth={depth}>
      <div className="fastnear-reference-schema__header">
        <div className="fastnear-reference-schema__headline">
          {name ? <code className="fastnear-reference-schema__name">{name}</code> : null}
          <span className="fastnear-reference-schema__type">{typeLabel}</span>
          {schema.nullable ? (
            <span className="fastnear-reference-schema__flag">nullable</span>
          ) : null}
          {schema.refName ? (
            <span className="fastnear-reference-schema__flag">{schema.refName}</span>
          ) : null}
        </div>
        {schema.required?.length ? (
          <span className="fastnear-reference-schema__hint">
            requires {schema.required.join(", ")}
          </span>
        ) : null}
      </div>

      {schema.description ? (
        <p className="fastnear-reference-schema__description">
          {renderInlineCodeText(schema.description)}
        </p>
      ) : null}

      {enumValues.length > 0 ? (
        <div className="fastnear-reference-schema__enum-list">
          {enumValues.map((value: unknown) => (
            <code key={String(value)}>{String(value)}</code>
          ))}
        </div>
      ) : null}

      {schema.default !== undefined ? (
        <p className="fastnear-reference-schema__meta">
          Default: <code>{String(schema.default)}</code>
        </p>
      ) : null}

      {schema.example !== undefined ? (
        <p className="fastnear-reference-schema__meta">
          Example: <code>{String(schema.example)}</code>
        </p>
      ) : null}

      {inlineOneOf ? (
        <div className="fastnear-reference-schema__inline-variants">
          {schema.oneOf.map((variant: any, index: number) => (
            <span
              className="fastnear-reference-schema__inline-variant"
              key={`${name || "variant"}-oneof-inline-${index}`}
            >
              {getSchemaVariantLabel(variant, `Option ${index + 1}`)}
            </span>
          ))}
        </div>
      ) : null}

      {!inlineOneOf && schema.oneOf?.length ? (
        <div className="fastnear-reference-schema__variants">
          {schema.oneOf.map((variant: any, index: number) => (
            <div
              className="fastnear-reference-schema__variant"
              key={`${name || "variant"}-oneof-${index}`}
            >
              <span className="fastnear-reference-schema__variant-label">
                {getSchemaVariantLabel(variant, `Option ${index + 1}`)}
              </span>
              <SchemaNode schema={variant} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}

      {inlineAnyOf ? (
        <div className="fastnear-reference-schema__inline-variants">
          {schema.anyOf.map((variant: any, index: number) => (
            <span
              className="fastnear-reference-schema__inline-variant"
              key={`${name || "variant"}-anyof-inline-${index}`}
            >
              {getSchemaVariantLabel(variant, `Shape ${index + 1}`)}
            </span>
          ))}
        </div>
      ) : null}

      {!inlineAnyOf && schema.anyOf?.length ? (
        <div className="fastnear-reference-schema__variants">
          {schema.anyOf.map((variant: any, index: number) => (
            <div
              className="fastnear-reference-schema__variant"
              key={`${name || "variant"}-anyof-${index}`}
            >
              <span className="fastnear-reference-schema__variant-label">
                {getSchemaVariantLabel(variant, `Shape ${index + 1}`)}
              </span>
              <SchemaNode schema={variant} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}

      {schema.items ? (
        <div className="fastnear-reference-schema__children">
          <SchemaNode schema={schema.items} name="items" depth={depth + 1} />
        </div>
      ) : null}

      {schema.properties?.length ? (
        <div className="fastnear-reference-schema__children">
          {schema.properties.map((property: any) => (
            <SchemaNode
              key={`${name || "root"}-${property.name}`}
              name={`${property.name}${property.required ? " *" : ""}`}
              schema={property.schema}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}

      {schema.additionalProperties && typeof schema.additionalProperties === "object" ? (
        <div className="fastnear-reference-schema__children">
          <SchemaNode
            name="additionalProperties"
            schema={schema.additionalProperties}
            depth={depth + 1}
          />
        </div>
      ) : null}
    </div>
  );
}

type FastnearOperationReferenceProps = {
  className?: string;
  headingLevel?: "h2" | "h3";
  onExampleSelect?: (exampleId: string) => void;
  pageModel: FastnearPageModel;
  selectedExampleId?: string;
};

function ParameterGroup({
  parameters,
  title,
}: {
  parameters: FastnearPageModel["request"]["parameters"]["path"];
  title: string;
}) {
  if (!parameters.length) {
    return null;
  }

  return (
    <div className="fastnear-reference__parameter-group">
      <h3>{title}</h3>
      <div className="fastnear-reference__schema-block fastnear-reference__schema-block--parameters">
        {parameters.map((parameter) => (
          <SchemaNode
            key={`${parameter.location}-${parameter.name}`}
            name={`${parameter.name}${parameter.required ? " *" : ""}`}
            schema={parameter.schema}
          />
        ))}
      </div>
    </div>
  );
}

export function FastnearOperationReference({
  className,
  headingLevel = "h2",
  onExampleSelect,
  pageModel,
  selectedExampleId,
}: FastnearOperationReferenceProps) {
  const headingTag = headingLevel;
  const requestExamples = pageModel.request.examples;
  const response = pageModel.responses[0];
  const firstExampleId = requestExamples[0]?.id || "";
  const [uncontrolledExampleId, setUncontrolledExampleId] = useState(firstExampleId);
  const activeExampleId = selectedExampleId ?? uncontrolledExampleId;
  const activeExample =
    requestExamples.find((example) => example.id === activeExampleId) || requestExamples[0];
  const Heading = headingTag as keyof JSX.IntrinsicElements;
  const headingId = useId();
  const httpHasBody = hasHttpRequestBody(pageModel);
  const usesNetworkTabLabels = shouldUseNetworkTabLabels(requestExamples);
  const requestSummary = useMemo(() => {
    if (pageModel.route.transport === "json-rpc") {
      return `This operation accepts a JSON-RPC body over ${pageModel.route.method} to ${pageModel.route.path}.`;
    }

    if (httpHasBody) {
      return `This operation performs ${pageModel.route.method} ${pageModel.route.path} with an ${pageModel.request.mediaType || "HTTP"} request body.`;
    }

    return `This operation performs ${pageModel.route.method} ${pageModel.route.path}.`;
  }, [httpHasBody, pageModel.request.mediaType, pageModel.route.method, pageModel.route.path, pageModel.route.transport]);

  const handleExampleSelect = (exampleId: string) => {
    if (selectedExampleId === undefined) {
      setUncontrolledExampleId(exampleId);
    }

    onExampleSelect?.(exampleId);
  };

  return (
    <section
      className={["fastnear-reference", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <div className="fastnear-reference__grid">
        <div className="fastnear-reference__panel">
          <div className="fastnear-reference__heading-row">
            <Heading id={headingId}>Request reference</Heading>
            <span className="fastnear-reference__badge">
              {pageModel.request.mediaType || pageModel.route.method}
            </span>
          </div>

          {requestExamples.length > 0 ? (
            <div
              className={[
                "fastnear-reference__tabs",
                usesNetworkTabLabels ? "fastnear-reference__tabs--network" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="tablist"
              aria-label="Request examples"
            >
              {requestExamples.map((example) => (
                <button
                  type="button"
                  key={example.id}
                  className={example.id === activeExample?.id ? "is-active" : ""}
                  onClick={() => handleExampleSelect(example.id)}
                >
                  {getExampleTabLabel(requestExamples, example)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="fastnear-reference__summary">
            <p>{requestSummary}</p>
            <p>
              Required request inputs: <strong>{pageModel.request.required ? "yes" : "no"}</strong>
            </p>
          </div>

          {pageModel.route.transport === "json-rpc" ? (
            <>
              <pre className="fastnear-reference__code fastnear-reference__code--example">
                {formatJson(activeExample?.request?.body)}
              </pre>

              <div className="fastnear-reference__schema-block">
                <h3>Request schema</h3>
                <SchemaNode schema={pageModel.request.bodySchema} />
              </div>
            </>
          ) : (
            <>
              <pre className="fastnear-reference__code fastnear-reference__code--request-line">
                {buildHttpExample(pageModel, activeExample)}
              </pre>

              {httpHasBody ? (
                <>
                  <pre className="fastnear-reference__code fastnear-reference__code--example">
                    {formatJson(activeExample?.request?.body || {})}
                  </pre>

                  <div className="fastnear-reference__schema-block">
                    <h3>Request body schema</h3>
                    <SchemaNode schema={pageModel.request.bodySchema} />
                  </div>
                </>
              ) : null}

              <ParameterGroup parameters={pageModel.request.parameters.path} title="Path parameters" />
              <ParameterGroup
                parameters={pageModel.request.parameters.query}
                title="Query parameters"
              />
              <ParameterGroup
                parameters={pageModel.request.parameters.header}
                title="Header parameters"
              />
            </>
          )}
        </div>

        <div className="fastnear-reference__panel">
          <div className="fastnear-reference__heading-row">
            <Heading>Response reference</Heading>
            <span className="fastnear-reference__badge">
              {response?.status} {response?.mediaType}
            </span>
          </div>

          <p className="fastnear-reference__response-description">
            {renderInlineCodeText(response?.description)}
          </p>

          <div className="fastnear-reference__schema-block">
            <h3>Response schema</h3>
            <SchemaNode schema={response?.schema} />
          </div>
        </div>
      </div>
    </section>
  );
}
