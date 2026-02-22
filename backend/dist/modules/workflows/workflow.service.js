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
    normalizeKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    resolveDefinitionName(name) {
        const direct = this.defs[name];
        if (direct)
            return name;
        const normalized = this.normalizeKey(name);
        if (!normalized)
            return undefined;
        for (const key of Object.keys(this.defs)) {
            if (this.normalizeKey(key) === normalized)
                return key;
        }
        const aliases = {
            incident: 'Incident',
            fault: 'Incident',
            servicerequest: 'Service Request',
            changerequest: 'Change Request (Asset Replacement)',
            changerequestassetreplacement: 'Change Request (Asset Replacement)',
            accessrequest: 'Access Request',
            newstarterrequest: 'New Starter Request',
            leaverrequest: 'Leaver Request',
            task: 'Task',
            softwarerequest: 'Software Request',
            hrrequest: 'HR Request',
            peripheralrequest: 'Peripheral Request',
        };
        const mapped = aliases[normalized];
        if (mapped && this.defs[mapped])
            return mapped;
        return undefined;
    }
    getDefinition(name) {
        const resolved = this.resolveDefinitionName(name);
        if (!resolved)
            return undefined;
        return this.defs[resolved];
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
exports.workflowEngine.register({
    name: 'Service Request',
    states: ['New', 'Awaiting Approval', 'In Progress', 'Fulfilled', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'Awaiting Approval', name: 'request_approval' },
        { from: 'New', to: 'In Progress', name: 'accept_no_approval' },
        { from: 'Awaiting Approval', to: 'In Progress', name: 'approve' },
        { from: 'Awaiting Approval', to: 'Rejected', name: 'reject' },
        { from: 'In Progress', to: 'Fulfilled', name: 'fulfill' },
        { from: 'Fulfilled', to: 'Closed', name: 'close' },
        { from: 'New', to: 'Closed', name: 'quick_close' },
        { from: 'Closed', to: 'In Progress', name: 'reopen' },
    ],
});
exports.workflowEngine.register({
    name: 'Change Request (Asset Replacement)',
    states: ['New', 'Under Verification', 'Awaiting Approval', 'Approved', 'Procurement', 'In Progress', 'Completed', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'Under Verification', name: 'verify_asset' },
        { from: 'Under Verification', to: 'Awaiting Approval', name: 'send_for_approval' },
        { from: 'Awaiting Approval', to: 'Approved', name: 'approve' },
        { from: 'Awaiting Approval', to: 'Rejected', name: 'reject' },
        { from: 'Approved', to: 'Procurement', name: 'start_procurement' },
        { from: 'Approved', to: 'In Progress', name: 'start_implementation' },
        { from: 'Procurement', to: 'In Progress', name: 'procurement_to_implementation' },
        { from: 'In Progress', to: 'Completed', name: 'complete_change' },
        { from: 'Completed', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'Access Request',
    states: ['New', 'Manager Approval', 'IT Approval', 'Provisioning', 'Completed', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'Manager Approval', name: 'send_to_manager' },
        { from: 'Manager Approval', to: 'IT Approval', name: 'manager_approve' },
        { from: 'Manager Approval', to: 'Rejected', name: 'manager_reject' },
        { from: 'IT Approval', to: 'Provisioning', name: 'it_approve' },
        { from: 'Provisioning', to: 'Completed', name: 'provision_access' },
        { from: 'Completed', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'New Starter Request',
    states: ['New', 'HR Confirmation', 'IT Setup', 'Asset Allocation', 'Ready for Joining', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'HR Confirmation', name: 'confirm_hr' },
        { from: 'HR Confirmation', to: 'IT Setup', name: 'start_it_setup' },
        { from: 'IT Setup', to: 'Asset Allocation', name: 'allocate_asset' },
        { from: 'Asset Allocation', to: 'Ready for Joining', name: 'mark_ready' },
        { from: 'Ready for Joining', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'Leaver Request',
    states: ['New', 'HR Confirmation', 'Access Revoked', 'Asset Collected', 'Completed', 'Closed'],
    transitions: [
        { from: 'New', to: 'HR Confirmation', name: 'hr_confirm' },
        { from: 'HR Confirmation', to: 'Access Revoked', name: 'revoke_access' },
        { from: 'Access Revoked', to: 'Asset Collected', name: 'collect_asset' },
        { from: 'Asset Collected', to: 'Completed', name: 'complete_offboarding' },
        { from: 'Completed', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'Task',
    states: ['New', 'Assigned', 'In Progress', 'Completed', 'Closed'],
    transitions: [
        { from: 'New', to: 'Assigned', name: 'accept' },
        { from: 'Assigned', to: 'In Progress', name: 'start' },
        { from: 'In Progress', to: 'Completed', name: 'complete' },
        { from: 'Completed', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'Software Request',
    states: ['New', 'Manager Approval', 'Budget Approval', 'Procurement', 'Installation', 'Completed', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'Manager Approval', name: 'request_approval' },
        { from: 'Manager Approval', to: 'Budget Approval', name: 'budget_approve' },
        { from: 'Manager Approval', to: 'Rejected', name: 'manager_reject' },
        { from: 'Budget Approval', to: 'Procurement', name: 'start_procurement' },
        { from: 'Procurement', to: 'Installation', name: 'install' },
        { from: 'Installation', to: 'Completed', name: 'mark_completed' },
        { from: 'Completed', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'HR Request',
    states: ['New', 'HR Review', 'In Progress', 'Resolved', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'HR Review', name: 'send_to_hr' },
        { from: 'HR Review', to: 'In Progress', name: 'start_review' },
        { from: 'HR Review', to: 'Rejected', name: 'reject' },
        { from: 'In Progress', to: 'Resolved', name: 'resolve' },
        { from: 'Resolved', to: 'Closed', name: 'close' },
    ],
});
exports.workflowEngine.register({
    name: 'Peripheral Request',
    states: ['New', 'Stock Check', 'Approval', 'Issued', 'Closed', 'Rejected'],
    transitions: [
        { from: 'New', to: 'Stock Check', name: 'check_stock' },
        { from: 'Stock Check', to: 'Approval', name: 'request_approval' },
        { from: 'Stock Check', to: 'Issued', name: 'issue_asset_no_approval' },
        { from: 'Approval', to: 'Issued', name: 'issue_asset' },
        { from: 'Approval', to: 'Rejected', name: 'reject' },
        { from: 'Issued', to: 'Closed', name: 'close' },
    ],
});
