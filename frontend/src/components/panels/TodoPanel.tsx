import React, { useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'
type ReminderFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed'

type TodoTask = {
  id: string
  title: string
  details: string
  completed: boolean
  dueDate: string
  dueTime: string
  reminderMinutes: number
  repeat: RepeatRule
  notifiedAt: string | null
}

type TodoSettings = {
  inAppReminder: boolean
  desktopReminder: boolean
  defaultReminderMinutes: number
}

const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440]
const FILTER_OPTIONS: Array<{ value: ReminderFilter; label: string }> = [
  { value: 'all', label: 'All Tasks' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
]

const DEFAULT_SETTINGS: TodoSettings = {
  inAppReminder: true,
  desktopReminder: false,
  defaultReminderMinutes: 15,
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const parseDueAt = (task: Pick<TodoTask, 'dueDate' | 'dueTime'>) => {
  if (!task.dueDate) return Number.NaN
  const time = task.dueTime || '23:59'
  return new Date(`${task.dueDate}T${time}:00`).getTime()
}

const relativeDue = (task: Pick<TodoTask, 'dueDate' | 'dueTime'>) => {
  const ts = parseDueAt(task)
  if (!Number.isFinite(ts)) return '-'
  const diffMin = Math.round((ts - Date.now()) / 60000)
  if (Math.abs(diffMin) < 1) return 'now'
  if (diffMin > 0) return `in ${diffMin}m`
  return `${Math.abs(diffMin)}m ago`
}

const formatDue = (task: Pick<TodoTask, 'dueDate' | 'dueTime'>) => {
  const ts = parseDueAt(task)
  if (!Number.isFinite(ts)) return 'No deadline'
  return new Date(ts).toLocaleString()
}

export default function TodoPanel() {
  const { user } = useAuth()
  const userKey = String(user?.id || user?.email || 'guest')
  const tasksStorageKey = `itsm.todo.tasks.v5.${userKey}`
  const settingsStorageKey = `itsm.todo.settings.v5.${userKey}`

  const [tasks, setTasks] = useState<TodoTask[]>(() => {
    try {
      if (typeof window === 'undefined') return []
      const raw = window.localStorage.getItem(tasksStorageKey)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [settings, setSettings] = useState<TodoSettings>(() => {
    try {
      if (typeof window === 'undefined') return DEFAULT_SETTINGS
      const raw = window.localStorage.getItem(settingsStorageKey)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === 'object' ? { ...DEFAULT_SETTINGS, ...parsed } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [filter, setFilter] = useState<ReminderFilter>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDetails, setNewDetails] = useState('')
  const [newDueDate, setNewDueDate] = useState(todayKey())
  const [newDueTime, setNewDueTime] = useState('19:00')
  const [newReminderMin, setNewReminderMin] = useState<number>(DEFAULT_SETTINGS.defaultReminderMinutes)
  const [newRepeat, setNewRepeat] = useState<RepeatRule>('none')
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  const [inAppNotices, setInAppNotices] = useState<Array<{ id: string; message: string }>>([])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(tasksStorageKey, JSON.stringify(tasks))
  }, [tasks, tasksStorageKey])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  }, [settings, settingsStorageKey])

  React.useEffect(() => {
    setNewReminderMin(settings.defaultReminderMinutes)
  }, [settings.defaultReminderMinutes])

  React.useEffect(() => {
    const checkReminders = () => {
      const now = Date.now()
      const dueNow: Array<{ id: string; message: string }> = []
      setTasks((prev) =>
        prev.map((task) => {
          if (task.completed || task.notifiedAt) return task
          const dueAt = parseDueAt(task)
          if (!Number.isFinite(dueAt)) return task
          const remindAt = dueAt - task.reminderMinutes * 60000
          if (now < remindAt) return task
          dueNow.push({ id: task.id, message: `${task.title} - due ${formatDue(task)}` })
          return { ...task, notifiedAt: new Date().toISOString() }
        })
      )

      if (dueNow.length > 0 && settings.inAppReminder) {
        setInAppNotices((prev) => [...dueNow, ...prev].slice(0, 5))
      }

      if (dueNow.length > 0 && settings.desktopReminder && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => undefined)
        }
        if (Notification.permission === 'granted') {
          dueNow.forEach((n) => {
            try {
              new Notification('Task Reminder', { body: n.message })
            } catch {}
          })
        }
      }
    }

    checkReminders()
    const timer = window.setInterval(checkReminders, 30000)
    return () => window.clearInterval(timer)
  }, [settings.desktopReminder, settings.inAppReminder])

  const visibleTasks = useMemo(() => {
    const now = Date.now()
    const startToday = new Date(todayKey()).getTime()
    const endToday = startToday + 24 * 60 * 60 * 1000
    const ordered = tasks.slice().sort((a, b) => parseDueAt(a) - parseDueAt(b))

    if (filter === 'completed') return ordered.filter((t) => t.completed)
    if (filter === 'today') return ordered.filter((t) => !t.completed && parseDueAt(t) >= startToday && parseDueAt(t) < endToday)
    if (filter === 'upcoming') return ordered.filter((t) => !t.completed && parseDueAt(t) >= now)
    if (filter === 'overdue') return ordered.filter((t) => !t.completed && parseDueAt(t) < now)
    return ordered
  }, [filter, tasks])

  const addTask = () => {
    const title = newTitle.trim()
    if (!title) return
    const nextTask: TodoTask = {
      id: `todo-${Date.now()}`,
      title,
      details: newDetails.trim(),
      completed: false,
      dueDate: newDueDate,
      dueTime: newDueTime,
      reminderMinutes: newReminderMin,
      repeat: newRepeat,
      notifiedAt: null,
    }
    setTasks((prev) => [nextTask, ...prev])
    setNewTitle('')
    setNewDetails('')
    setNewRepeat('none')
    setMenuTaskId(null)
    setShowAddForm(false)
  }

  const toggleCompleted = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)))
  }

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setInAppNotices((prev) => prev.filter((n) => n.id !== id))
    setMenuTaskId(null)
  }

  const addDeadlineToday = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              dueDate: todayKey(),
              dueTime: t.dueTime || '19:00',
              notifiedAt: null,
            }
          : t
      )
    )
    setMenuTaskId(null)
  }

  return (
    <div className="todo-list todo-v4">
      <div className="todo-v4-head">
        <div className="todo-v4-title">My Tasks</div>
        <div className="todo-v4-head-actions">
          <button className="todo-v4-new-btn" onClick={() => setShowAddForm((v) => !v)} aria-label="New Task">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Task
          </button>
          <button className="todo-close" onClick={() => setShowSettings((v) => !v)} aria-label="Settings">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.5a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
            </svg>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="todo-v4-settings">
          <label className="todo-checkbox">
            <input
              type="checkbox"
              checked={settings.inAppReminder}
              onChange={(e) => setSettings((p) => ({ ...p, inAppReminder: e.target.checked }))}
            />
            In-app reminders
          </label>
          <label className="todo-checkbox">
            <input
              type="checkbox"
              checked={settings.desktopReminder}
              onChange={(e) => setSettings((p) => ({ ...p, desktopReminder: e.target.checked }))}
            />
            Desktop notifications
          </label>
          <label className="todo-label">Default reminder</label>
          <select
            className="todo-input"
            value={settings.defaultReminderMinutes}
            onChange={(e) => setSettings((p) => ({ ...p, defaultReminderMinutes: Number(e.target.value) }))}
          >
            {REMINDER_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'At due time' : `${m} minutes before`}
              </option>
            ))}
          </select>
        </div>
      )}

      {showAddForm && (
        <div className="todo-v4-add">
          <input
            className="todo-input"
            placeholder="Add a task"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <textarea
            className="todo-textarea"
            placeholder="Details (optional)"
            value={newDetails}
            onChange={(e) => setNewDetails(e.target.value)}
          />
          <div className="todo-inline">
            <input type="date" className="todo-input" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
            <input type="time" className="todo-input" value={newDueTime} onChange={(e) => setNewDueTime(e.target.value)} />
          </div>
          <div className="todo-inline">
            <select className="todo-input" value={newReminderMin} onChange={(e) => setNewReminderMin(Number(e.target.value))}>
              {REMINDER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Reminder: Due time' : `Reminder: ${m}m before`}
                </option>
              ))}
            </select>
            <select className="todo-input" value={newRepeat} onChange={(e) => setNewRepeat(e.target.value as RepeatRule)}>
              <option value="none">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button className="todo-primary" onClick={addTask}>Add</button>
          </div>
        </div>
      )}

      <div className="todo-v4-toolbar">
        <select className="todo-input" value={filter} onChange={(e) => setFilter(e.target.value as ReminderFilter)}>
          {FILTER_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {settings.inAppReminder && inAppNotices.length > 0 && (
        <div className="todo-v4-reminders">
          {inAppNotices.map((notice) => (
            <div key={notice.id} className="todo-reminder-item">
              {notice.message}
            </div>
          ))}
        </div>
      )}

      {visibleTasks.length === 0 ? (
        <div className="panel-empty">No tasks found.</div>
      ) : (
        <div className="todo-items">
          {visibleTasks.map((task) => (
            <div key={task.id} className={`todo-item todo-v4-item${task.completed ? ' todo-item-done' : ''}`}>
              <div className="todo-v4-row">
                <label className="todo-checkbox">
                  <input type="checkbox" checked={task.completed} onChange={() => toggleCompleted(task.id)} />
                  <span className="todo-item-title">{task.title}</span>
                </label>
                <button className="todo-close" onClick={() => setMenuTaskId((v) => (v === task.id ? null : task.id))} aria-label="Task menu">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </div>
              {task.details ? <div className="todo-item-sub">{task.details}</div> : null}
              <div className="todo-item-sub">Due: {formatDue(task)} ({relativeDue(task)})</div>
              <div className="todo-item-sub">Reminder: {task.reminderMinutes === 0 ? 'At due time' : `${task.reminderMinutes}m before`} | Repeat: {task.repeat}</div>
              {menuTaskId === task.id && (
                <div className="todo-v4-menu">
                  <button className="todo-ghost" onClick={() => addDeadlineToday(task.id)}>Add deadline (today)</button>
                  <button className="todo-ghost" onClick={() => removeTask(task.id)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
