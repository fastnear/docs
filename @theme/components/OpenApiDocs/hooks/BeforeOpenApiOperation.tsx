import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Description } from "@redocly/openapi-docs/lib/components/OperationItem/Description";
import { Security } from "@redocly/openapi-docs/lib/components/Security";
import { usePageData } from "@redocly/realm/dist/client/app/hooks/usePageData";

import { FastnearOperationPage } from "../../../../shared/FastnearOperationPage";
import { getFastnearPageModel } from "../../../../shared/fastnearPageModel";
import { getFastnearCustomPageForPath } from "../../../../shared/fastnearCustomPages";

type BeforeOpenApiOperationProps = {
  operation: any;
};

function getPilotRequestTarget(anchor: HTMLElement | null) {
  const section = anchor?.closest("[data-section-id]");
  const requestSamples = section?.querySelector(".panel-container-request-samples");
  const requestRow = requestSamples?.parentElement as HTMLElement | null;

  if (!requestRow) {
    return { hiddenRows: [], requestRow: null, target: null, createdTarget: false };
  }

  const hiddenRows: HTMLElement[] = [];
  let row = requestRow.nextElementSibling as HTMLElement | null;
  while (row) {
    hiddenRows.push(row);
    row = row.nextElementSibling as HTMLElement | null;
  }

  const existingTarget = Array.from(requestRow.children).find((child) =>
    child.classList.contains("fastnear-operation-pilot__request-target")
  ) as HTMLElement | undefined;

  if (existingTarget) {
    return { hiddenRows, requestRow, target: existingTarget, createdTarget: false };
  }

  const target = document.createElement("div");
  target.className = "fastnear-operation-pilot__request-target";
  requestRow.appendChild(target);

  return { hiddenRows, requestRow, target, createdTarget: true };
}

function getOperationRoot(anchor: HTMLElement | null, operationId?: string) {
  if (!anchor || !operationId) {
    return null;
  }

  let current: HTMLElement | null = anchor;
  while (current) {
    if (
      current.id &&
      current.id.endsWith(`/${operationId}`) &&
      !current.id.includes("/request") &&
      !current.id.includes("/response")
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function FastnearOperationPilot({
  contentOverride,
  hideSiblingOperations,
  interaction,
  operation,
}: {
  contentOverride?: React.ReactNode;
  hideSiblingOperations?: boolean;
  interaction: any;
  operation: any;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const pageModel = useMemo(
    () =>
      getFastnearPageModel({
        kind: interaction?.kind,
        operationId: operation?.operationDefinition?.operationId,
      }),
    [interaction?.kind, operation?.operationDefinition?.operationId]
  );

  const content = useMemo(() => {
    if (contentOverride) {
      return contentOverride;
    }

    return (
      <div className="fastnear-operation-pilot">
        <div className="fastnear-operation-pilot__context">
          <Description
            description={
              operation.description || operation.externalDocs ? operation.description : undefined
            }
            externalDocs={operation.externalDocs}
            extensions={operation.extensions}
          />
          <Security securities={operation.security || []} />
          <p className="fastnear-operation-pilot__note">
            The <strong>Security</strong> button documents the API key scheme. Use the API key
            field in the live interaction below to authenticate requests and keep that key saved in
            your browser.
          </p>
        </div>

        {pageModel ? (
          <FastnearOperationPage pageModel={pageModel} surface="operation" />
        ) : (
          <p className="fastnear-interaction__error">
            This FastNEAR interaction could not be resolved to a generated page model.
          </p>
        )}
      </div>
    );
  }, [contentOverride, operation, pageModel]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const { hiddenRows, requestRow, target: requestTarget, createdTarget } = getPilotRequestTarget(
      anchorRef.current
    );
    const operationRoot = getOperationRoot(
      anchorRef.current,
      operation?.operationDefinition?.operationId
    );
    const hiddenOperations: HTMLElement[] = [];

    if (!requestRow || !requestTarget) {
      setTarget(null);
      return undefined;
    }

    requestRow.classList.add("fastnear-operation-pilot__request-row");
    hiddenRows.forEach((row) => row.classList.add("fastnear-operation-pilot__hidden-row"));
    if (hideSiblingOperations && operationRoot?.parentElement) {
      const tagPrefix = operationRoot.id.split("/").slice(0, -1).join("/");
      Array.from(operationRoot.parentElement.children).forEach((child) => {
        if (
          !(child instanceof HTMLElement) ||
          child === operationRoot ||
          !child.id ||
          !child.id.startsWith(`${tagPrefix}/`) ||
          child.id.includes("/request") ||
          child.id.includes("/response")
        ) {
          return;
        }

        child.classList.add("fastnear-operation-pilot__hidden-operation");
        hiddenOperations.push(child);
      });
    }
    setTarget(requestTarget);

    return () => {
      requestRow.classList.remove("fastnear-operation-pilot__request-row");
      hiddenRows.forEach((row) => row.classList.remove("fastnear-operation-pilot__hidden-row"));
      hiddenOperations.forEach((child) =>
        child.classList.remove("fastnear-operation-pilot__hidden-operation")
      );

      if (createdTarget) {
        requestTarget.remove();
      }
    };
  }, [hideSiblingOperations, operation?.operationDefinition?.operationId]);

  return (
    <>
      <span ref={anchorRef} className="fastnear-operation-pilot__anchor" aria-hidden="true" />
      {target ? createPortal(content, target) : null}
    </>
  );
}

export function BeforeOpenApiOperation({ operation }: BeforeOpenApiOperationProps) {
  const pageData = usePageData("slug") as { slug?: string } | null;
  const pathname =
    pageData?.slug || (typeof window !== "undefined" ? window.location.pathname : undefined);
  const interaction = operation?.operationDefinition?.["x-fastnear-interaction"];
  const customPage = getFastnearCustomPageForPath(pathname);
  const pageModel = getFastnearPageModel({
    kind: interaction?.kind,
    operationId: operation?.operationDefinition?.operationId,
    pageModelId: customPage?.pageModelId,
    pathname,
  });
  const isRpcPageModel =
    Boolean(pageModel?.canonicalPath?.startsWith("/rpcs/")) &&
    pageModel?.info.operationId === operation?.operationDefinition?.operationId;

  if (interaction?.kind) {
    return <FastnearOperationPilot interaction={interaction} operation={operation} />;
  }

  if (
    (!customPage?.replaceOperationPage && !isRpcPageModel) ||
    !pageModel ||
    pageModel.info.operationId !== operation?.operationDefinition?.operationId
  ) {
    return null;
  }

  return (
    <FastnearOperationPilot
      contentOverride={<FastnearOperationPage pageModel={pageModel} surface="operation" />}
      hideSiblingOperations
      interaction={{
        kind: customPage?.kind || pageModel.interaction.kind,
      }}
      operation={operation}
    />
  );
}
