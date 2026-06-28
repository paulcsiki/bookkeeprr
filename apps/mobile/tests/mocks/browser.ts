// Historical MSW worker entry kept for the Jest test suite (Node side uses
// `tests/mocks/server.ts` instead). The in-app runtime uses a dependency-free
// fetch monkey-patch (`src/lib/e2e-fetch-mock.ts`) because msw/native pulls
// in browser globals React Native doesn't ship.
import { setupServer } from 'msw/native';
import { handlers } from './handlers';

export const worker = setupServer(...handlers);
