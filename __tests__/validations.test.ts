import { createTaskSchema, updateTaskSchema, patchTaskSchema, queryParamsSchema } from '../src/lib/validations';

describe('createTaskSchema', () => {
  it('accepts a valid task', () => {
    const result = createTaskSchema.safeParse({
      title: 'Buy milk',
      priority: 'high',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('high');
    }
  });

  it('rejects empty title', () => {
    const result = createTaskSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title over 255 chars', () => {
    const result = createTaskSchema.safeParse({ title: 'a'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority', () => {
    const result = createTaskSchema.safeParse({ title: 'Task', priority: 'urgent' });
    expect(result.success).toBe(false);
  });

  it('rejects past dueDate', () => {
    const result = createTaskSchema.safeParse({ title: 'Task', dueDate: '2020-01-01' });
    expect(result.success).toBe(false);
  });

  it('rejects bad dueDate format', () => {
    const result = createTaskSchema.safeParse({ title: 'Task', dueDate: '01/01/2099' });
    expect(result.success).toBe(false);
  });

  it('accepts a future dueDate', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const dateStr = future.toISOString().split('T')[0];
    const result = createTaskSchema.safeParse({ title: 'Task', dueDate: dateStr });
    expect(result.success).toBe(true);
  });

  it('defaults priority to med', () => {
    const result = createTaskSchema.safeParse({ title: 'Task' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe('med');
  });

  it('trims title whitespace', () => {
    const result = createTaskSchema.safeParse({ title: '  Buy bread  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('Buy bread');
  });
});

describe('patchTaskSchema', () => {
  it('rejects empty object', () => {
    const result = patchTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts completed toggle', () => {
    const result = patchTaskSchema.safeParse({ completed: true });
    expect(result.success).toBe(true);
  });

  it('accepts partial update', () => {
    const result = patchTaskSchema.safeParse({ priority: 'low' });
    expect(result.success).toBe(true);
  });
});

describe('queryParamsSchema', () => {
  it('parses valid completed filter', () => {
    const result = queryParamsSchema.safeParse({ completed: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.completed).toBe(true);
  });

  it('parses false completed filter', () => {
    const result = queryParamsSchema.safeParse({ completed: 'false' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.completed).toBe(false);
  });

  it('defaults page to 1', () => {
    const result = queryParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(1);
  });

  it('defaults limit to 20', () => {
    const result = queryParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(20);
  });

  it('caps limit at 100', () => {
    const result = queryParamsSchema.safeParse({ limit: '9999' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(100);
  });
});

describe('updateTaskSchema', () => {
  it('accepts optional fields', () => {
    const result = updateTaskSchema.safeParse({ title: 'Updated', completed: false });
    expect(result.success).toBe(true);
  });

  it('accepts null dueDate (clear it)', () => {
    const result = updateTaskSchema.safeParse({ dueDate: null });
    expect(result.success).toBe(true);
  });
});
