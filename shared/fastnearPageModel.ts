import {
  ALL_PAGE_MODELS,
  type GeneratedFastnearPageModel,
} from "./generatedFastnearPageModels";

export * from "./generatedFastnearPageModels";

export type FastnearPageModel = GeneratedFastnearPageModel;
export type FastnearInteractionField = FastnearPageModel["interaction"]["fields"][number];
export type FastnearInteractionNetwork = FastnearPageModel["interaction"]["networks"][number];
export type FastnearRequestExample = FastnearPageModel["request"]["examples"][number];
export type ViewAccountPageModel = Extract<FastnearPageModel, { pageModelId: "rpc-view-account" }>;
export type ViewAccountNetwork = ViewAccountPageModel["interaction"]["networks"][number];

export const fastnearPageModelsByPageModelId: Record<string, FastnearPageModel> =
  Object.fromEntries(ALL_PAGE_MODELS.map((pageModel) => [pageModel.pageModelId, pageModel]));

export const fastnearPageModelsByKind: Record<string, FastnearPageModel> = Object.fromEntries(
  ALL_PAGE_MODELS.filter((pageModel) => pageModel.interaction.kind.startsWith("rpc-")).map(
    (pageModel) => [pageModel.interaction.kind, pageModel]
  )
);

export const fastnearPageModelsByOperationId: Record<string, FastnearPageModel> =
  Object.fromEntries(ALL_PAGE_MODELS.map((pageModel) => [pageModel.info.operationId, pageModel]));

export const fastnearPageModelsByCanonicalPath: Record<string, FastnearPageModel> =
  Object.fromEntries(ALL_PAGE_MODELS.map((pageModel) => [pageModel.canonicalPath, pageModel]));

export const fastnearPageModelsByRoutePath: Record<string, FastnearPageModel> = Object.fromEntries(
  ALL_PAGE_MODELS.flatMap((pageModel) => [
    [pageModel.canonicalPath, pageModel],
    ...pageModel.routeAliases.map((routePath) => [routePath, pageModel]),
  ])
);

export function getFastnearPageModel({
  kind,
  operationId,
  pageModelId,
  pathname,
}: {
  kind?: string;
  operationId?: string;
  pageModelId?: string;
  pathname?: string;
}) {
  if (pageModelId && fastnearPageModelsByPageModelId[pageModelId]) {
    return fastnearPageModelsByPageModelId[pageModelId];
  }

  if (pathname && fastnearPageModelsByRoutePath[pathname]) {
    return fastnearPageModelsByRoutePath[pathname];
  }

  if (kind && fastnearPageModelsByKind[kind]) {
    return fastnearPageModelsByKind[kind];
  }

  if (operationId && fastnearPageModelsByOperationId[operationId]) {
    return fastnearPageModelsByOperationId[operationId];
  }

  return undefined;
}
