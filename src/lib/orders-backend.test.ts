// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitToIndependentBackend } from './orders-backend.server';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('independent order proxy', () => {
  it('fails closed when external mode lacks credentials', async () => {
    vi.stubEnv('ORDERS_BACKEND_URL', 'https://orders.example.com');
    vi.stubEnv('ORDERS_API_TOKEN', '');
    await expect(submitToIndependentBackend(new FormData())).rejects.toThrow('nije podešen');
  });
  it('forwards a design and customer email only to the configured service', async () => {
    vi.stubEnv('ORDERS_BACKEND_URL', 'https://orders.example.com');
    vi.stubEnv('ORDERS_API_TOKEN', 'test-server-secret');
    const request = vi.fn().mockResolvedValue(Response.json({ id: 'a788648d-1111-4111-8111-111111111111' }, { status: 201 }));
    vi.stubGlobal('fetch', request);
    const form = new FormData();
    form.set('email', 'test@example.com');
    form.set('design', new File(['test'], 'test.pdf'));
    await expect(submitToIndependentBackend(form)).resolves.toEqual({ id: 'a788648d-1111-4111-8111-111111111111' });
    expect(request.mock.calls[0]?.[0]).toBe('https://orders.example.com/v1/orders');
    expect(request.mock.calls[0]?.[1].body.get('email')).toBe('test@example.com');
    expect(request.mock.calls[0]?.[1].body.get('design').name).toBe('test.pdf');
  });
});