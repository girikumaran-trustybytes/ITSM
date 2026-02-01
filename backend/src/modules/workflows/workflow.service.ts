export type WorkflowDefinition = {
  name: string
  states: string[]
  transitions: { from: string; to: string; name: string; guard?: string }[]
}

// A minimal reusable workflow engine
export class WorkflowEngine {
  private defs: Record<string, WorkflowDefinition> = {}

  register(def: WorkflowDefinition) {
    this.defs[def.name] = def
  }

  getDefinition(name: string) {
    return this.defs[name]
  }

  canTransition(workflowName: string, from: string, to: string) {
    const def = this.getDefinition(workflowName)
    if (!def) return false
    return def.transitions.some(t => t.from === from && t.to === to)
  }

  listAllowed(workflowName: string, from: string) {
    const def = this.getDefinition(workflowName)
    if (!def) return []
    return def.transitions.filter(t => t.from === from).map(t => t.to)
  }
}

// register basic Incident workflow (example)
export const workflowEngine = new WorkflowEngine()
workflowEngine.register({
  name: 'Incident',
  states: ['New', 'In Progress', 'Awaiting Approval', 'Closed', 'Rejected'],
  transitions: [
    { from: 'New', to: 'In Progress', name: 'triage' },
    { from: 'In Progress', to: 'Awaiting Approval', name: 'request_approval' },
    { from: 'Awaiting Approval', to: 'In Progress', name: 'approve' },
    { from: 'In Progress', to: 'Closed', name: 'resolve' },
    { from: 'New', to: 'Closed', name: 'quick_resolve' }
  ]
})
