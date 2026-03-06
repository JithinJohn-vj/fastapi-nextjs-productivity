"use client";

import { useEffect, useMemo, useState } from "react";
import { api, setAccessToken } from "../lib/api";

type Toast = { id: number; message: string; type: "success" | "error" };

type Task = Awaited<ReturnType<typeof api.getTasks>>[number];
type Habit = Awaited<ReturnType<typeof api.getHabits>>[number];
type User = Awaited<ReturnType<typeof api.getMe>>;

export default function Home() {
  const [mode, setMode] = useState<"login" | "register" | "dashboard">("login");
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.getStats>>>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const [authError, setAuthError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [authForm, setAuthForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
  });

  const [habitForm, setHabitForm] = useState({
    title: "",
    frequency: "daily",
  });

  const [filter, setFilter] = useState({
    search: "",
    priority: "all",
    status: "all",
  });
  const [now, setNow] = useState(() => Date.now());

  function pushToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3000
    );
  }

  async function bootstrapDashboard() {
    try {
      setLoading(true);
      const [tasksRes, habitsRes, statsRes, meRes] = await Promise.all([
        api.getTasks(),
        api.getHabits(),
        api.getStats(),
        api.getMe(),
      ]);
      setTasks(tasksRes);
      setHabits(habitsRes);
      setStats(statsRes);
      setUser(meRes);
      setMode("dashboard");
    } catch {
      // likely not authenticated yet – stay on login
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrapDashboard();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "register") {
      setUsernameStatus("idle");
      return;
    }

    const value = authForm.username.trim();
    if (!value) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");
    const handle = setTimeout(async () => {
      try {
        const res = await api.checkUsername(value);
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [authForm.username, mode]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter.priority !== "all" && t.priority !== filter.priority) {
        return false;
      }
      if (filter.status === "completed" && !t.completed) return false;
      if (filter.status === "pending" && t.completed) return false;
      if (
        filter.search &&
        !`${t.title} ${t.description ?? ""}`
          .toLowerCase()
          .includes(filter.search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [tasks, filter]);

  function getTaskTiming(task: Task, currentTime: number) {
    if (!task.due_date) return null;

    const deadline = new Date(`${task.due_date}T23:59:59`);
    if (Number.isNaN(deadline.getTime())) return null;

    const diffMs = deadline.getTime() - currentTime;
    if (diffMs <= 0) {
      return { status: "missed" as const };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    let label: string;
    if (days > 0) {
      label = `${days}d ${hours}h`;
    } else if (hours > 0) {
      label = `${hours}h ${minutes}m`;
    } else {
      label = `${minutes}m`;
    }

    return { status: "upcoming" as const, label };
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setAuthError(null);
      await api.register({
        username: authForm.username,
        email: authForm.email,
        password: authForm.password,
      });
      pushToast("Registration successful. You can now log in.");
      setMode("login");
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Registration failed";

      const trimmed = message.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          const detail =
            typeof parsed === "string"
              ? parsed
              : parsed?.detail || parsed?.message || parsed?.error;
          if (detail) {
            message = detail;
          }
        } catch {
          // ignore JSON parse errors and fall back to original message
        }
      }

      setAuthError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setAuthError(null);
      const token = await api.login({
        email: authForm.email,
        password: authForm.password,
      });
      setAccessToken(token.access_token);
      pushToast("Logged in");
      await bootstrapDashboard();
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Login failed",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
      setMode("login");
      setTasks([]);
      setHabits([]);
      setStats(undefined);
      setUser(null);
      pushToast("Logged out");
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Logout failed",
        "error"
      );
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      const created = await api.createTask(taskForm);
      setTasks((prev) => [created as Task, ...prev]);
      setTaskForm({
        title: "",
        description: "",
        priority: "medium",
        due_date: "",
      });
      pushToast("Task created");
      const s = await api.getStats();
      setStats(s);
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not create task",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggleTaskCompletion(task: Task) {
    try {
      const updated = await api.updateTask(task.id, {
        completed: !task.completed,
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? (updated as Task) : t))
      );
      const s = await api.getStats();
      setStats(s);
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not update task",
        "error"
      );
    }
  }

  async function removeTask(id: number) {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      const s = await api.getStats();
      setStats(s);
      pushToast("Task deleted");
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not delete task",
        "error"
      );
    }
  }

  async function handleCreateHabit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      const created = await api.createHabit(habitForm);
      setHabits((prev) => [created as Habit, ...prev]);
      setHabitForm({
        title: "",
        frequency: "daily",
      });
      pushToast("Habit created");
      const s = await api.getStats();
      setStats(s);
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not create habit",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkHabit(id: number) {
    try {
      const updated = await api.checkHabit(id);
      setHabits((prev) =>
        prev.map((h) => (h.id === id ? (updated as Habit) : h))
      );
      const s = await api.getStats();
      setStats(s);
      pushToast("Habit checked");
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not check habit",
        "error"
      );
    }
  }

  async function removeHabit(id: number) {
    try {
      await api.deleteHabit(id);
      setHabits((prev) => prev.filter((h) => h.id !== id));
      const s = await api.getStats();
      setStats(s);
      pushToast("Habit deleted");
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not delete habit",
        "error"
      );
    }
  }

  const isAuthMode = mode === "login" || mode === "register";

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 text-slate-900">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_60%)]" />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Smart Task &amp; Habit Manager
            </h1>
            <p className="text-sm text-slate-500">
              Stay on top of tasks, build streaks, and visualize your progress.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {mode === "dashboard" && (
              <button
                onClick={handleLogout}
                className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                Logout
              </button>
            )}
          </div>
        </header>

        {isAuthMode && (
          <main className="mx-auto flex w-full flex-1 items-center justify-center">
            <div className="grid w-full max-w-4xl gap-10 rounded-3xl border border-slate-100 bg-white/80 p-8 shadow-xl shadow-sky-100/50 backdrop-blur-md md:grid-cols-[1.3fr_1fr]">
              <div className="relative hidden flex-col justify-between md:flex">
                <div>
                  <p className="mb-3 inline-flex rounded-full bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-100">
                    New • Light, focused workspace
                  </p>
                  <h2 className="mb-3 text-2xl font-semibold leading-snug text-slate-900">
                    Turn your day into a
                    <span className="bg-gradient-to-r from-sky-500 to-emerald-500 bg-clip-text text-transparent">
                      {" "}
                      clear plan
                    </span>
                    .
                  </h2>
                  <p className="text-sm text-slate-500">
                    Capture tasks, build better habits, and see your progress in
                    one minimal, calming dashboard.
                  </p>
                </div>
                <div className="mt-8 space-y-3 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-700">
                      1
                    </span>
                    Plan your priorities for today.
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                      2
                    </span>
                    Build simple, repeatable habits.
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700">
                      3
                    </span>
                    Watch your streaks and stats grow.
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-y-0 -right-16 -z-10 hidden w-64 rounded-full bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.25),_transparent_60%)] md:block" />
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm shadow-sky-100/70">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {mode === "login" ? "Welcome back" : "Create account"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {mode === "login"
                        ? "Sign in to access your dashboard."
                        : "Get started in a few seconds."}
                    </p>
                  </div>
                  <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
                    <button
                      className={`flex-1 rounded-full px-3 py-1 transition ${
                        mode === "login"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      onClick={() => {
                        setAuthError(null);
                        setMode("login");
                      }}
                    >
                      Login
                    </button>
                    <button
                      className={`flex-1 rounded-full px-3 py-1 transition ${
                        mode === "register"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      onClick={() => {
                        setAuthError(null);
                        setMode("register");
                      }}
                    >
                      Register
                    </button>
                  </div>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={mode === "login" ? handleLogin : handleRegister}
                >
                  {mode === "register" && (
                    <div className="space-y-1">
                      {authError && (
                        <p className="text-[11px] font-medium text-rose-600">
                          {authError}
                        </p>
                      )}
                      <label className="text-xs font-medium text-slate-700">
                        Username
                      </label>
                      <input
                        type="text"
                        value={authForm.username}
                        onChange={(e) =>
                          setAuthForm((f) => ({
                            ...f,
                            username: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                        required
                      />
                      {usernameStatus === "checking" && (
                        <p className="text-[11px] text-slate-400">
                          Checking availability...
                        </p>
                      )}
                      {usernameStatus === "available" && (
                        <p className="text-[11px] text-emerald-600">
                          Username is available.
                        </p>
                      )}
                      {usernameStatus === "taken" && (
                        <p className="text-[11px] text-rose-600">
                          Username is already taken.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(e) =>
                        setAuthForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">
                      Password
                    </label>
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(e) =>
                        setAuthForm((f) => ({ ...f, password: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-3 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-sky-200 transition hover:-translate-y-0.5 hover:bg-sky-400 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading
                      ? "Please wait..."
                      : mode === "login"
                      ? "Login"
                      : "Create account"}
                  </button>
                </form>
              </div>
            </div>
          </main>
        )}

        {mode === "dashboard" && (
          <main className="flex flex-1 flex-col gap-5 pb-10">
            <section className="grid gap-4 md:grid-cols-4">
              <div className="col-span-2 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm shadow-sky-50/60 backdrop-blur-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">
                  Task overview
                </h2>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl bg-sky-50 p-3 shadow-xs">
                    <p className="text-xs text-sky-600">Total</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats?.total_tasks ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-600">Completed</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats?.completed_tasks ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <p className="text-xs text-amber-600">Pending</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats?.pending_tasks ?? 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm shadow-sky-50/60 backdrop-blur-sm">
                <h2 className="mb-2 text-sm font-semibold text-slate-800">
                  Completion rate
                </h2>
                <p className="text-3xl font-semibold text-slate-900">
                  {stats?.completion_rate ?? 0}
                  <span className="text-base font-normal text-slate-500">
                    %
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm shadow-sky-50/60 backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">
                  {(user?.username?.[0] || user?.email?.[0] || "U").toUpperCase()}
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-slate-800">
                    Account
                  </h2>
                  <p className="text-xs text-slate-600">
                    {user ? user.username : "Guest"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {user?.email || "Sign in to see your details"}
                  </p>
                  {stats && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Habits: {stats.total_habits} • Active streaks:{" "}
                      <span className="font-medium text-slate-700">
                        {stats.active_streaks}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="grid flex-1 gap-4 md:grid-cols-3">
              <div className="space-y-4 md:col-span-2">
                <div className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm shadow-sky-50/60 backdrop-blur-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">
                      Tasks
                    </h2>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <input
                        placeholder="Search..."
                        value={filter.search}
                        onChange={(e) =>
                          setFilter((f) => ({
                            ...f,
                            search: e.target.value,
                          }))
                        }
                        className="w-32 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                      />
                      <select
                        value={filter.priority}
                        onChange={(e) =>
                          setFilter((f) => ({
                            ...f,
                            priority: e.target.value,
                          }))
                        }
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                      >
                        <option value="all">All priorities</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <select
                        value={filter.status}
                        onChange={(e) =>
                          setFilter((f) => ({
                            ...f,
                            status: e.target.value,
                          }))
                        }
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                      >
                        <option value="all">All</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>

                  <form
                    onSubmit={handleCreateTask}
                    className="mb-4 grid gap-2 rounded-2xl bg-slate-50 p-3 text-xs ring-1 ring-slate-100 md:grid-cols-5"
                  >
                    <input
                      placeholder="Task title"
                      value={taskForm.title}
                      onChange={(e) =>
                        setTaskForm((f) => ({ ...f, title: e.target.value }))
                      }
                      className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:ring-2"
                      required
                    />
                    <input
                      placeholder="Description"
                      value={taskForm.description}
                      onChange={(e) =>
                        setTaskForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:ring-2 md:block"
                    />
                    <select
                      value={taskForm.priority}
                      onChange={(e) =>
                        setTaskForm((f) => ({
                          ...f,
                          priority: e.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:ring-2"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <input
                      type="date"
                      value={taskForm.due_date}
                      onChange={(e) =>
                        setTaskForm((f) => ({
                          ...f,
                          due_date: e.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:ring-2"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="md:col-span-1 rounded-xl bg-sky-500 px-3 py-2 font-medium text-white shadow-sm shadow-sky-200 transition hover:-translate-y-0.5 hover:bg-sky-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Add
                    </button>
                  </form>

                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {filteredTasks.length === 0 && (
                      <p className="text-xs text-slate-500">
                        No tasks yet. Add your first task above.
                      </p>
                    )}
                    {filteredTasks.map((task) => {
                      const timing = getTaskTiming(task, now);
                      const isMissed = timing?.status === "missed";

                      return (
                        <div
                          key={task.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-xs transition hover:-translate-y-0.5 hover:border-sky-100 hover:shadow-md"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                if (isMissed) return;
                                toggleTaskCompletion(task);
                              }}
                              disabled={isMissed}
                              className={`h-4 w-4 rounded-full border transition ${
                                task.completed
                                  ? "border-emerald-400 bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
                                  : "border-slate-400 bg-white hover:border-sky-400"
                              } ${
                                isMissed
                                  ? "cursor-not-allowed opacity-40 hover:border-slate-400"
                                  : ""
                              }`}
                              aria-label="Toggle completion"
                            />
                            <div>
                              <p
                                className={`font-medium ${
                                  task.completed
                                    ? "text-slate-400 line-through"
                                    : "text-slate-900"
                                }`}
                              >
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="text-[11px] text-slate-500">
                                  {task.description}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    task.priority === "high"
                                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                                      : task.priority === "low"
                                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                      : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                                  }`}
                                >
                                  {task.priority.toUpperCase()}
                                </span>
                                {task.due_date && (
                                  <span>Due {task.due_date}</span>
                                )}
                                {timing && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 ${
                                      isMissed
                                        ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                                        : "bg-sky-50 text-sky-700 ring-1 ring-sky-100"
                                    }`}
                                  >
                                    {isMissed
                                      ? "MISSED"
                                      : `Due in ${timing.label}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {!isMissed && (
                            <button
                              onClick={() => removeTask(task.id)}
                              className="text-[11px] text-slate-400 transition hover:text-rose-500"
                            >
                              Delete
                            </button>
                          )}
                          {isMissed && (
                            <span className="text-[11px] font-medium text-rose-500">
                              Locked
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm shadow-sky-50/60 backdrop-blur-sm">
                  <h2 className="mb-3 text-sm font-semibold text-slate-800">
                    Habits
                  </h2>
                  <form
                    onSubmit={handleCreateHabit}
                    className="mb-3 flex flex-col gap-2 text-xs"
                  >
                    <input
                      placeholder="Habit name"
                      value={habitForm.title}
                      onChange={(e) =>
                        setHabitForm((f) => ({ ...f, title: e.target.value }))
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                      required
                    />
                    <select
                      value={habitForm.frequency}
                      onChange={(e) =>
                        setHabitForm((f) => ({
                          ...f,
                          frequency: e.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none ring-sky-100 transition focus:border-sky-400 focus:bg-white focus:ring-2"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-xl bg-emerald-500 px-3 py-2 font-medium text-white shadow-sm shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Add habit
                    </button>
                  </form>

                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1 text-xs">
                    {habits.length === 0 && (
                      <p className="text-slate-500">
                        Create a habit to start building a streak.
                      </p>
                    )}
                    {habits.map((habit) => (
                      <div
                        key={habit.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-xs transition hover:-translate-y-0.5 hover:border-sky-100 hover:shadow-md"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {habit.title}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {habit.frequency} • Streak:{" "}
                            <span className="font-semibold text-slate-900">
                              {habit.streak_count}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={() => checkHabit(habit.id)}
                            className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white shadow-sm shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-md"
                          >
                            Check-in
                          </button>
                          <button
                            onClick={() => removeHabit(habit.id)}
                            className="text-[10px] text-slate-400 transition hover:text-rose-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>
        )}

        <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center">
          <div className="flex max-w-md flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto rounded-full px-4 py-2 text-xs shadow-lg ring-1 transition ${
                  t.type === "success"
                    ? "bg-emerald-500/95 text-white ring-emerald-200/80"
                    : "bg-rose-500/95 text-white ring-rose-200/80"
                }`}
              >
                {t.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
