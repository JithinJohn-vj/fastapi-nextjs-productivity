const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth, ...init } = options;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      const detail =
        typeof json === "string"
          ? json
          : json?.detail || json?.message || json?.error;
      throw new Error(detail || res.statusText);
    } catch {
      throw new Error(text || res.statusText);
    }
  }

  if (res.status === 204) {
    // No content
    return undefined as T;
  }

  return res.json();
}

export const api = {
  register(body: { username: string; email: string; password: string }) {
    return request<{ message: string }>("/api/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  login(body: { email: string; password: string }) {
    return request<{ access_token: string; token_type: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  logout() {
    return request<void>("/api/logout", { method: "POST" });
  },
  getTasks() {
    return request<
      {
        id: number;
        title: string;
        description?: string | null;
        priority: string;
        due_date?: string | null;
        completed: boolean;
      }[]
    >("/api/tasks");
  },
  createTask(body: {
    title: string;
    description?: string;
    priority: string;
    due_date?: string;
  }) {
    return request("/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateTask(
    id: number,
    body: {
      title?: string;
      description?: string;
      priority?: string;
      due_date?: string;
      completed?: boolean;
    }
  ) {
    return request(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteTask(id: number) {
    return request<void>(`/api/tasks/${id}`, { method: "DELETE" });
  },
  getHabits() {
    return request<
      {
        id: number;
        title: string;
        frequency: string;
        streak_count: number;
        last_checked?: string | null;
      }[]
    >("/api/habits");
  },
  createHabit(body: { title: string; frequency: string }) {
    return request("/api/habits", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateHabit(
    id: number,
    body: { title?: string; frequency?: string; streak_count?: number }
  ) {
    return request(`/api/habits/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  checkHabit(id: number) {
    return request(`/api/habits/${id}/check`, {
      method: "POST",
    });
  },
  deleteHabit(id: number) {
    return request<void>(`/api/habits/${id}`, { method: "DELETE" });
  },
  getStats() {
    return request<{
      total_tasks: number;
      completed_tasks: number;
      pending_tasks: number;
      completion_rate: number;
      total_habits: number;
      active_streaks: number;
    }>("/api/stats");
  },
  getMe() {
    return request<{
      id: number;
      username: string;
      email: string;
    }>("/api/me");
  },
  checkUsername(username: string) {
    return request<{ available: boolean }>(
      `/api/users/availability?username=${encodeURIComponent(username)}`
    );
  },
};

