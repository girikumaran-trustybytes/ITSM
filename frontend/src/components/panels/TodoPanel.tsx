import React, { useState } from 'react'

type Task = {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  type: 'Appointment' | 'Task'
  staff: string
}

const formatDate = (value: string) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

export default function TodoPanel() {
  const [view, setView] = useState<'list' | 'form'>('list')
  const [tasks, setTasks] = useState<Task[]>([])
  const [form, setForm] = useState({
    type: 'Task' as Task['type'],
    title: '',
    ticket: '',
    attendees: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '19:00',
    endTime: '19:30',
    staff: 'Girikumaran',
    taskType: 'Site Visit',
    alert: 'None',
    status: 'Do not change',
    notes: '',
    allDay: false,
    privateTask: false,
    informStaff: false,
  })

  const handleSave = () => {
    if (!form.title.trim()) return
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: form.title.trim(),
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      type: form.type,
      staff: form.staff,
    }
    setTasks(prev => [newTask, ...prev])
    setView('list')
  }

  if (view === 'form') {
    return (
      <div className="todo-form">
        <div className="todo-form-header">
          <button className="todo-save" onClick={handleSave}>Save</button>
          <button className="todo-close" onClick={() => setView('list')} aria-label="Close">x</button>
        </div>
        <div className="todo-form-title">New Task</div>
        <div className="todo-form-section">
          <div className="todo-label">Event Type</div>
          <label className="todo-radio">
            <input
              type="radio"
              checked={form.type === 'Appointment'}
              onChange={() => setForm({ ...form, type: 'Appointment' })}
            />
            Appointment
          </label>
          <label className="todo-radio">
            <input
              type="radio"
              checked={form.type === 'Task'}
              onChange={() => setForm({ ...form, type: 'Task' })}
            />
            Task
          </label>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Description *</label>
          <input
            className="todo-input"
            placeholder="Add a subject"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Ticket</label>
          <select className="todo-input" value={form.ticket} onChange={(e) => setForm({ ...form, ticket: e.target.value })}>
            <option value="">Search by Ticket ID or Summary</option>
            <option value="#1030094">#1030094 - Internal Note</option>
            <option value="#1030085">#1030085 - New request</option>
          </select>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Other Attendees</label>
          <input
            className="todo-input"
            placeholder="Other Attendees"
            value={form.attendees}
            onChange={(e) => setForm({ ...form, attendees: e.target.value })}
          />
        </div>

        <div className="todo-form-row">
          <div>
            <label className="todo-label">Start</label>
            <div className="todo-inline">
              <input type="date" className="todo-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <input
                type="time"
                className="todo-input"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                disabled={form.allDay}
              />
              <label className="todo-checkbox">
                <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
                All Day
              </label>
            </div>
          </div>
        </div>

        <div className="todo-form-row">
          <div>
            <label className="todo-label">End</label>
            <div className="todo-inline">
              <input type="date" className="todo-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <input
                type="time"
                className="todo-input"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                disabled={form.allDay}
              />
              <label className="todo-checkbox">
                <input type="checkbox" checked={form.privateTask} onChange={(e) => setForm({ ...form, privateTask: e.target.checked })} />
                Private
              </label>
            </div>
          </div>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Staff *</label>
          <select className="todo-input" value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })}>
            <option>Girikumaran</option>
            <option>Agent One</option>
            <option>Agent Two</option>
          </select>
          <label className="todo-checkbox">
            <input type="checkbox" checked={form.informStaff} onChange={(e) => setForm({ ...form, informStaff: e.target.checked })} />
            Inform Staff
          </label>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Task Type *</label>
          <select className="todo-input" value={form.taskType} onChange={(e) => setForm({ ...form, taskType: e.target.value })}>
            <option>Site Visit</option>
            <option>Remote Support</option>
            <option>Call Back</option>
          </select>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Alert</label>
          <select className="todo-input" value={form.alert} onChange={(e) => setForm({ ...form, alert: e.target.value })}>
            <option>None</option>
            <option>15 minutes before</option>
            <option>1 hour before</option>
          </select>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Staff Status</label>
          <select className="todo-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Do not change</option>
            <option>Busy</option>
            <option>Available</option>
          </select>
        </div>

        <div className="todo-form-section">
          <label className="todo-label">Notes</label>
          <textarea
            className="todo-textarea"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="todo-form-footer">
          <button className="todo-primary" onClick={handleSave}>Save</button>
          <button className="todo-ghost" onClick={() => setView('list')}>Discard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="todo-list">
      <input
        className="todo-date"
        type="text"
        value={formatDate(form.date)}
        readOnly
      />
      {tasks.length === 0 ? (
        <div className="panel-empty">Nothing to do at the moment</div>
      ) : (
        <div className="todo-items">
          {tasks.map((task) => (
            <div key={task.id} className="todo-item">
              <div className="todo-item-title">{task.title}</div>
              <div className="todo-item-sub">{task.type} - {formatDate(task.date)} {task.startTime}-{task.endTime}</div>
            </div>
          ))}
        </div>
      )}
      <button className="todo-add" onClick={() => setView('form')}>+ Add</button>
    </div>
  )
}
