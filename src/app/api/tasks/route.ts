import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { createTaskSchema, queryParamsSchema } from '@/lib/validations';
import {
  apiError,
  apiSuccess,
  checkRateLimit,
  getClientIp,
  handleZodError,
  log,
  serializeTask,
} from '@/lib/api';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return apiError('Too many requests', 429);
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawParams = Object.fromEntries(searchParams.entries());

    const params = queryParamsSchema.parse(rawParams);
    const { completed, page, limit, q, sort, order } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {};
    if (completed !== undefined) where.completed = completed;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy: Prisma.TaskOrderByWithRelationInput;
    if (sort === 'priority') {
      orderBy = { priority: order };
    } else if (sort === 'dueDate') {
      orderBy = { dueDate: order };
    } else {
      orderBy = { createdAt: order };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({ where, orderBy, skip, take: limit }),
      prisma.task.count({ where }),
    ]);

    log('info', 'GET /api/tasks', { count: tasks.length, total });

    return apiSuccess({
      data: tasks.map(serializeTask),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err);
    log('error', 'GET /api/tasks failed', { err: String(err) });
    return apiError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return apiError('Too many requests', 429);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return apiError('Invalid JSON body', 400);
    }

    const data = createTaskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate + 'T00:00:00') : undefined,
      },
    });

    log('info', 'POST /api/tasks', { id: task.id });
    return apiSuccess(serializeTask(task), 201);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err);
    log('error', 'POST /api/tasks failed', { err: String(err) });
    return apiError('Internal server error', 500);
  }
}
