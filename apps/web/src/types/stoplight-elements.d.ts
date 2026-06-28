/* @stoplight/elements ships index.d.ts but its package.json "exports" map has
   no "types" condition, so TypeScript (moduleResolution: bundler) can't see it.
   Minimal declaration of the surface we use, mirrored from the package's own
   containers/API.d.ts. */
declare module '@stoplight/elements' {
  import type * as React from 'react';

  export interface CommonAPIProps {
    router?: 'history' | 'hash' | 'memory' | 'static';
    basePath?: string;
    staticRouterPath?: string;
    layout?: 'sidebar' | 'stacked' | 'responsive';
    logo?: string;
    hideTryIt?: boolean;
    hideSamples?: boolean;
    hideTryItPanel?: boolean;
    hideSecurityInfo?: boolean;
    hideServerInfo?: boolean;
    hideSchemas?: boolean;
    hideInternal?: boolean;
    hideExport?: boolean;
    tryItCredentialsPolicy?: 'omit' | 'include' | 'same-origin';
    tryItCorsProxy?: string;
    maxRefDepth?: number;
    outerRouter?: boolean;
  }

  export type APIProps = (
    | { apiDescriptionUrl: string }
    | { apiDescriptionDocument: string | object; apiDescriptionUrl?: string }
  ) &
    CommonAPIProps;

  export const API: React.FC<APIProps>;
}
