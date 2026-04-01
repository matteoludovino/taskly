import { z } from 'zod';

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const prioritySchema = z.enum(['low', 'med', 'high']);

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'title is required' })
    .min(1, 'title must be at least 1 character')
    .max(255, 'title must be at most 255 characters')
    .trim(),
  description: z.string().max(2000).trim().optional(),
  priority: prioritySchema.default('med'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be in YYYY-MM-DD format')
    .refine((val) => {
      const date = new Date(val + 'T00:00:00');
      return date >= today();
    }, 'dueDate cannot be in the past')
    .optional(),
});

export const updateTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'title must be at least 1 character')
    .max(255, 'title must be at most 255 characters')
    .trim()
    .optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  priority: prioritySchema.optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be in YYYY-MM-DD format')
    .refine((val) => {
      const date = new Date(val + 'T00:00:00');
      return date >= today();
    }, 'dueDate cannot be in the past')
    .nullable()
    .optional(),
  completed: z.boolean().optional(),
});

export const patchTaskSchema = z.object({
  title: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  priority: prioritySchema.optional(),
  dueDate: z.string().nullable().optional(),
  completed: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export const queryParamsSchema = z.object({
  completed: z
    .string()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    })
    .optional(),
  page: z
    .string()
    .transform((val) => Math.max(1, parseInt(val, 10) || 1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 20)))
    .optional()
    .default('20'),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['createdAt', 'dueDate', 'priority']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});
