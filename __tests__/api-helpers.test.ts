import { serializeTask, checkRateLimit, getClientIp } from '../src/lib/api';

describe('serializeTask', () => {
  const base = {
    id: 'test-uuid',
    title: 'Buy milk',
    description: null,
    completed: false,
    priority: 'med' as const,
    dueDate: null,
    createdAt: new Date('2024-06-01T12:00:00Z'),
    updatedAt: new Date('2024-06-01T12:00:00Z'),
  };

  it('serializes dates to ISO strings', () => {
    const result = serializeTask(base);
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('returns null dueDate when not set', () => {
    const result = serializeTask(base);
    expect(result.dueDate).toBeNull();
  });

  it('formats dueDate as YYYY-MM-DD', () => {
    const task = { ...base, dueDate: new Date('2024-12-25T00:00:00Z') };
    const result = serializeTask(task);
    expect(result.dueDate).toBe('2024-12-25');
  });

  it('preserves all fields', () => {
    const result = serializeTask(base);
    expect(result.id).toBe(base.id);
    expect(result.title).toBe(base.title);
    expect(result.completed).toBe(false);
    expect(result.priority).toBe('med');
  });
});

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const ip = `test-${Date.now()}`;
    expect(checkRateLimit(ip, 5, 60000)).toBe(true);
    expect(checkRateLimit(ip, 5, 60000)).toBe(true);
    expect(checkRateLimit(ip, 5, 60000)).toBe(true);
  });

  it('blocks requests over the limit', () => {
    const ip = `block-${Date.now()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(ip, 3, 60000);
    expect(checkRateLimit(ip, 3, 60000)).toBe(false);
  });

  it('resets after window expires', async () => {
    const ip = `reset-${Date.now()}`;
    checkRateLimit(ip, 1, 50);
    checkRateLimit(ip, 1, 50); // hit limit
    expect(checkRateLimit(ip, 1, 50)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(checkRateLimit(ip, 1, 50)).toBe(true);
  });
});

describe('getClientIp', () => {
  it('returns forwarded IP when header present', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('returns "unknown" when no header', () => {
    const req = new Request('http://localhost');
    expect(getClientIp(req)).toBe('unknown');
  });
});
