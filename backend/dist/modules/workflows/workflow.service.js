"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowEngine = exports.WorkflowEngine = void 0;
// A minimal reusable workflow engine
class WorkflowEngine {
    constructor() {
        this.defs = {};
    }
    register(def) {
        this.defs[def.name] = def;
    }
    getDefinition(name) {
        return this.defs[name];
    }
    canTransition(workflowName, from, to) {
        const def = this.getDefinition(workflowName);
        if (!def)
            return false;
        return def.transitions.some(t => t.from === from && t.to === to);
    }
    listAllowed(workflowName, from) {
        const def = this.getDefinition(workflowName);
        if (!def)
            return [];
        return def.transitions.filter(t => t.from === from).map(t => t.to);
    }
}
exports.WorkflowEngine = WorkflowEngine;
// register basic Incident workflow (example)
exports.workflowEngine = new WorkflowEngine();
exports.workflowEngine.register({
    name: 'Incident',
    states: ['New', 'In Progress', 'Awaiting Approval', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'In Progress', name: 'triage' },
        { from: 'In Progress', to: 'Awaiting Approval', name: 'request_approval' },
        { from: 'Awaiting Approval', to: 'In Progress', name: 'approve' },
        { from: 'In Progress', to: 'Closed', name: 'resolve' },
        { from: 'New', to: 'Closed', name: 'quick_resolve' }
    ]
});
