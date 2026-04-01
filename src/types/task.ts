export type Priority = 'low' | 'med' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  priority: Priority;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  completed?: boolean;
}

export type FilterType = 'all' | 'pending' | 'completed';
export type SortType = 'createdAt' | 'dueDate' | 'priority';

export interface TasksQueryParams {
  completed?: boolean;
  page?: number;
  limit?: number;
  q?: string;
  sort?: SortType;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
