import type { Metadata } from 'next';
import { ApiReference } from './ApiReference';

export const metadata: Metadata = {
  title: 'API reference — bookkeeprr',
  description:
    'OpenAPI reference for the bookkeeprr REST API and the Readarr-compatible surface.',
};

// Standalone, chrome-less route — opened in a new tab from the footer link.
// Elements brings its own sidebar layout and internal scroll.
export default function ApiDocsPage(): React.JSX.Element {
  return <ApiReference />;
}
