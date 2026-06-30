// IndexedDB 数据层 - Task / PomodoroSession / Tag
const DB_NAME = 'smart-tasks-db';
const DB_VERSION = 1;

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  recurrence: 'daily' | 'weekly' | 'monthly' | null;
  tags: string[];
  subtasks: SubTask[];
  dependsOn: string[];
  pomodoros: number;
  noteMarkdown: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
}

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  order: number;
  dueDate?: string | null;
}

export interface PomodoroSession {
  id: string;
  taskId: string;
  startedAt: number;
  endedAt: number;
  duration: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

let dbInstance: IDBDatabase | null = null;

export function genId(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
        store.createIndex('deletedAt', 'deletedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('pomodoros')) {
        const store = db.createObjectStore('pomodoros', { keyPath: 'id' });
        store.createIndex('taskId', 'taskId', { unique: false });
        store.createIndex('endedAt', 'endedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('tags')) {
        const store = db.createObjectStore('tags', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: true });
      }
    };
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTasks(includeDeleted = false): Promise<Task[]> {
  const tasks = await tx<Task[]>('tasks', 'readonly', s => s.getAll());
  return includeDeleted ? tasks : tasks.filter(t => !t.deletedAt);
}

export async function getTaskById(id: string): Promise<Task | null> {
  const t = await tx<Task | null>('tasks', 'readonly', s => s.get(id));
  return t || null;
}

export async function saveTask(task: Task): Promise<void> {
  task.updatedAt = Date.now();
  await tx('tasks', 'readwrite', s => s.put(task));
}

export async function deleteTaskPermanent(id: string): Promise<void> {
  await tx('tasks', 'readwrite', s => s.delete(id));
}

export async function addPomodoroSession(session: PomodoroSession): Promise<void> {
  await tx('pomodoros', 'readwrite', s => s.put(session));
}

export async function getAllPomodoros(): Promise<PomodoroSession[]> {
  return await tx<PomodoroSession[]>('pomodoros', 'readonly', s => s.getAll());
}

export async function getAllTags(): Promise<Tag[]> {
  return await tx<Tag[]>('tags', 'readonly', s => s.getAll());
}

export async function saveTag(tag: Tag): Promise<void> {
  tag.updatedAt = Date.now();
  await tx('tags', 'readwrite', s => s.put(tag));
}

export async function deleteTag(id: string): Promise<void> {
  await tx('tags', 'readwrite', s => s.delete(id));
}

export async function exportAllData() {
  const [tasks, pomodoros, tags] = await Promise.all([getAllTasks(true), getAllPomodoros(), getAllTags()]);
  return { tasks, pomodoros, tags, exportedAt: new Date().toISOString(), version: DB_VERSION };
}

export async function importAllData(data: any, replace = false) {
  const db = await openDB();
  const t = db.transaction(['tasks', 'pomodoros', 'tags'], 'readwrite');
  if (replace) {
    t.objectStore('tasks').clear();
    t.objectStore('pomodoros').clear();
    t.objectStore('tags').clear();
  }
  if (data.tasks) data.tasks.forEach((x: Task) => t.objectStore('tasks').put(x));
  if (data.pomodoros) data.pomodoros.forEach((x: PomodoroSession) => t.objectStore('pomodoros').put(x));
  if (data.tags) data.tags.forEach((x: Tag) => t.objectStore('tags').put(x));
  return new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
