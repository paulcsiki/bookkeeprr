# @bookkeeprr/types

Domain types + zod schemas shared across bookkeeprr apps (web, mobile, website).

These are the **wire/display** contracts — not DB rows. DB rows live in
`apps/web/src/server/db/`.

## Usage

```ts
import { ContentTypeSchema, type ContentType, ReaderManifestSchema } from '@bookkeeprr/types';

const parsed = ReaderManifestSchema.parse(jsonFromApi);
```

## Conventions

- Every type is paired with a zod schema (`type Foo`, `FooSchema`).
- Schemas use camelCase property names. API routes coerce snake_case → camelCase at the boundary.
- This package depends only on `zod`. No React, no Node, no DOM.
