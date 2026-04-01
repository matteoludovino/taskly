import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { updateTaskSchema, patchTaskSchema } from '@/lib/validations';
import {
  apiError, apiSuccess, checkRateLimit, getClientIp, handleZodError, log, serializeTask,
} from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

async function findTask(id: string) {
  if (!id || typeof id !== 'string' || id.length > 100) return null;
  return prisma.task.findUnique({ where: { id } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const task = await findTask(id);
    if (!task) return apiError('Task not found', 404);
    return apiSuccess(serializeTask(task));
  } catch (err) {
    log('error', `GET /api/tasks/${id} failed`, { err: String(err) });
    return apiError('Internal server error', 500);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) return apiError('Too many requests', 429);

  try {
    const task = await findTask(id);
    if (!task) return apiError('Task not found', 404);

    const body = await request.json().catch(() => null);
    if (!body) return apiError('Invalid JSON body', 400);

    const data = updateTaskSchema.parse(body);

    if (data.dueDate) {
      const date = new Date(data.dueDate + 'T00:00:00');
      const today = new Date(); today.setHours(0,0,0,0);
      if (date < today) return apiError('dueDate cannot be in the past', 400);
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        title: data.title ?? task.title,
        description: data.description !== undefined ? data.description : task.description,
        priority: data.priority ?? task.priority,
        completed: data.completed ?? task.completed,
        dueDate: data.dueDate !== undefined
          ? data.dueDate ? new Date(data.dueDate + 'T00:00:00') : null
          : task.dueDate,
      },
    });

    log('info', `PUT /api/tasks/${id}`);
    return apiSuccess(serializeTask(updated));
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err);
    log('error', `PUT /api/tasks/${id} failed`, { err: String(err) });
    return apiError('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) return apiError('Too many requests', 429);

  try {
    const task = await findTask(id);
    if (!task) return apiError('Task not found', 404);

    const body = await request.json().catch(() => null);
    if (!body) return apiError('Invalid JSON body', 400);

    const data = patchTaskSchema.parse(body);
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.completed !== undefined) updateData.completed = data.completed;
    if (data.dueDate !== undefined) {
      if (data.dueDate === null) {
        updateData.dueDate = null;
      } else {
        const date = new Date(data.dueDate + 'T00:00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        if (date < today) return apiError('dueDate cannot be in the past', 400);
        updateData.dueDate = date;
      }
    }

    const updated = await prisma.task.update({ where: { id }, data: updateData });

    log('info', `PATCH /api/tasks/${id}`, { fields: Object.keys(updateData) });
    return apiSuccess(serializeTask(updated));
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err);
    log('error', `PATCH /api/tasks/${id} failed`, { err: String(err) });
    return apiError('Internal server error', 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(_request);
  if (!checkRateLimit(ip)) return apiError('Too many requests', 429);

  try {
    const task = await findTask(id);
    if (!task) return apiError('Task not found', 404);

    await prisma.task.delete({ where: { id } });

    log('info', `DELETE /api/tasks/${id}`);
    return apiSuccess({ message: 'Task deleted successfully' });
  } catch (err) {
    log('error', `DELETE /api/tasks/${id} failed`, { err: String(err) });
    return apiError('Internal server error', 500);
  }
}
