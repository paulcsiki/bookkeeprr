// The readarr request schemas moved to the pure OpenAPI module so the spec
// generator can import them hermetically — this re-export keeps the existing
// import sites working. Single source: @/server/openapi/schemas/readarr.
export {
  ReadarrAuthorPostBody,
  ReadarrAuthorPutBody,
  ReadarrBookPostBody,
  ReadarrBookPutBody,
  ReadarrCommandPostBody,
  ReadarrLookupQuery,
  ReadarrPaginationQuery,
  type ReadarrAuthorPostBodyT,
  type ReadarrBookPostBodyT,
} from '@/server/openapi/schemas/readarr';
