import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function apiError(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

export function handleZodError(err: ZodError) {
  const messages = err.errors.map((e) => e.message).join('; ');
  return apiError(messages, 400);
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, maxRequests = 100, windowMs = 60000): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

export function serializeTask(task: {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...task,
    dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function log(level: 'info' | 'warn' | 'error', message: string, meta?: object) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...meta };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
