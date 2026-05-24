import { vi } from 'vitest';

vi.mock('express', () => {
  const mockJsonMiddleware = (req, res, next) => next && next();
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn()
  };
  const mockApp = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn(),
    json: mockJsonMiddleware
  };
  const Router = vi.fn(() => mockRouter);
  const expressExport = Object.assign(() => mockApp, mockApp, { json: mockJsonMiddleware });
  expressExport.Router = Router;
  return {
    default: expressExport,
    json: vi.fn(() => mockJsonMiddleware),
    Router
  };
});
