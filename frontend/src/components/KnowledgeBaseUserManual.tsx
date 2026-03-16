import React from 'react'

const sections = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'navigation-roles', title: 'Navigation & Roles' },
  { id: 'tickets', title: 'Ticket Lifecycle' },
  { id: 'conversation-views', title: 'Conversation Views' },
  { id: 'ticket-actions', title: 'Ticket Actions' },
  { id: 'escalation', title: 'Escalation' },
  { id: 'approvals', title: 'Approvals' },
  { id: 'queues', title: 'Queues & Assignment' },
  { id: 'workflows', title: 'Workflows & Status' },
  { id: 'sla', title: 'SLA & Priorities' },
  { id: 'mail', title: 'Mail Configuration' },
  { id: 'templates', title: 'Email Templates & Signatures' },
  { id: 'assets', title: 'Assets' },
  { id: 'asset-types', title: 'Asset Types & Fields' },
  { id: 'users', title: 'Users & Agents' },
  { id: 'suppliers', title: 'Suppliers' },
  { id: 'reports', title: 'Reports' },
  { id: 'admin', title: 'Admin Settings' },
  { id: 'best-practices', title: 'Best Practices' },
]

export default function KnowledgeBaseUserManual() {
  return (
    <div className="kb-manual">
      <aside className="kb-manual-sidebar">
        <div className="kb-manual-title">User Manual</div>
        <nav className="kb-manual-nav">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>{s.title}</a>
          ))}
        </nav>
      </aside>
      <main className="kb-manual-content">
        <h2>User Manual</h2>
        <p className="kb-muted">Step-by-step SOP for daily operations across all modules.</p>

        <section id="getting-started" className="kb-section">
          <h3>Getting Started</h3>
          <ol>
            <li>Sign in with your account credentials.</li>
            <li>Confirm your name and role in the top-right profile menu.</li>
            <li>Check the left sidebar for modules you can access.</li>
            <li>Open Tickets to see your team queues and assigned items.</li>
            <li>Use the top toolbar for search, notifications, and profile.</li>
            <li>Open a ticket from the list to view full details.</li>
            <li>Verify the ticket subject, requester, and status before acting.</li>
          </ol>
        </section>

        <section id="navigation-roles" className="kb-section">
          <h3>Navigation & Roles</h3>
          <ol>
            <li>Use the left sidebar to move between Tickets, Assets, Users, Suppliers, Reports, and Admin.</li>
            <li>Use the queue panel inside Tickets to filter by team and staff.</li>
            <li>Agents can work tickets but cannot change Admin settings unless granted.</li>
            <li>Admins can configure queues, workflows, mail, templates, and security.</li>
            <li>Users and Agents are separate entities and must be created separately.</li>
          </ol>
        </section>

        <section id="tickets" className="kb-section">
          <h3>Ticket Lifecycle</h3>
          <ol>
            <li>Create a ticket from the top bar or inbound mail.</li>
            <li>Verify Subject, Type, and Description are correct.</li>
            <li>Confirm requester details and contact method.</li>
            <li>Accept the ticket to take ownership.</li>
            <li>Set Status to the correct working state.</li>
            <li>Work the ticket using notes, emails, or supplier logs.</li>
            <li>Add internal notes for context and troubleshooting steps.</li>
            <li>Keep the user informed using Email User or Note + Email.</li>
            <li>Update status as progress changes.</li>
            <li>Close the ticket when resolution is complete and verified.</li>
          </ol>
        </section>

        <section id="conversation-views" className="kb-section">
          <h3>Conversation Views</h3>
          <ol>
            <li>All Conversation shows full timeline including system events.</li>
            <li>Conversation & Internal hides system status updates.</li>
            <li>Use Conversation & Internal for clean agent communication.</li>
          </ol>
        </section>

        <section id="ticket-actions" className="kb-section">
          <h3>Ticket Actions</h3>
          <ol>
            <li>Accept Ticket: assigns the ticket to you.</li>
            <li>Mark as responsed: stops response SLA timer.</li>
            <li>Email User: sends message to end user.</li>
            <li>Log to Supplier: logs update and routes to supplier.</li>
            <li>Internal note: visible to agents only.</li>
            <li>Private note: for personal use if enabled.</li>
            <li>Note + Email: logs and emails together.</li>
            <li>Requesting Approval: trigger approval flow.</li>
            <li>Close: completes the ticket.</li>
          </ol>
        </section>

        <section id="escalation" className="kb-section">
          <h3>Escalation</h3>
          <ol>
            <li>Click Escalate in the action bar.</li>
            <li>Select the target team.</li>
            <li>Select staff or leave Unassigned.</li>
            <li>Add a short reason and clear handover notes.</li>
            <li>Save to move the ticket to the new queue.</li>
            <li>Verify the ticket now appears in the target team queue.</li>
          </ol>
        </section>

        <section id="approvals" className="kb-section">
          <h3>Approvals</h3>
          <ol>
            <li>Choose Requesting Approval from actions.</li>
            <li>Select the approver and add context.</li>
            <li>Record any approval references or reasons in the note.</li>
            <li>Await approval before proceeding to closure.</li>
            <li>Update the user once approval is granted or rejected.</li>
          </ol>
        </section>

        <section id="queues" className="kb-section">
          <h3>Queues & Assignment</h3>
          <ol>
            <li>Tickets appear under team queues in the left panel.</li>
            <li>Unassigned shows tickets without staff.</li>
            <li>Assign tickets only to staff in the selected team.</li>
            <li>If staff is not part of a team, they should not receive that ticket.</li>
            <li>Use team queues to split workload and track responsibility.</li>
          </ol>
        </section>

        <section id="workflows" className="kb-section">
          <h3>Workflows & Status</h3>
          <ol>
            <li>Status is controlled by workflow rules.</li>
            <li>Use valid status transitions to avoid errors.</li>
            <li>Status badges show current state in the ticket info panel.</li>
            <li>If a transition fails, check workflow configuration in Admin.</li>
          </ol>
        </section>

        <section id="sla" className="kb-section">
          <h3>SLA & Priorities</h3>
          <ol>
            <li>SLA cards show response and resolution targets.</li>
            <li>Green tick means met, red X means breached.</li>
            <li>Priorities control SLA timing and urgency.</li>
            <li>Respond quickly to prevent SLA breaches.</li>
          </ol>
        </section>

        <section id="mail" className="kb-section">
          <h3>Mail Configuration</h3>
          <ol>
            <li>Go to Admin ? Mail Configuration.</li>
            <li>Add mailbox with provider details or OAuth.</li>
            <li>Set IMAP/SMTP defaults and verify connection.</li>
            <li>Save to enable inbound and outbound mail.</li>
            <li>Use ticket mail actions to send outbound updates.</li>
          </ol>
        </section>

        <section id="templates" className="kb-section">
          <h3>Email Templates & Signatures</h3>
          <ol>
            <li>Open Admin ? Email & Signature Templates.</li>
            <li>Create templates using placeholders like $ticketID$.</li>
            <li>Use $User Name$ for the recipient name and $subject$ for ticket subject.</li>
            <li>Assign templates to actions if needed.</li>
          </ol>
        </section>

        <section id="assets" className="kb-section">
          <h3>Assets</h3>
          <ol>
            <li>Add assets in the Assets module.</li>
            <li>Assign assets to users or tickets.</li>
            <li>Fill Identification fields for tracking and inventory.</li>
            <li>Use the Details tab for Laptop, Workstation, Desktop, or PC.</li>
          </ol>
        </section>

        <section id="asset-types" className="kb-section">
          <h3>Asset Types & Fields</h3>
          <ol>
            <li>Create Categories such as Hardware, Software, Cloud.</li>
            <li>Create Asset Types under a Category.</li>
            <li>Only child types appear in asset selection.</li>
            <li>Use consistent naming for clean reporting.</li>
          </ol>
        </section>

        <section id="users" className="kb-section">
          <h3>Users & Agents</h3>
          <ol>
            <li>Agents are added in Agent Management.</li>
            <li>Users are added in Users (separate from agents).</li>
            <li>User details include work email, department, reporting manager, and employment info.</li>
            <li>Do not create duplicate users with the same work email.</li>
          </ol>
        </section>

        <section id="suppliers" className="kb-section">
          <h3>Suppliers</h3>
          <ol>
            <li>Maintain supplier list and contacts.</li>
            <li>Select supplier when logging a supplier update.</li>
            <li>Supplier email auto-fills in supplier actions.</li>
            <li>Keep supplier contact details up to date.</li>
          </ol>
        </section>

        <section id="reports" className="kb-section">
          <h3>Reports</h3>
          <ol>
            <li>Reports provide metrics and summaries if enabled.</li>
            <li>Admins can choose which reports to show.</li>
            <li>Use reports for trend analysis and SLA performance.</li>
          </ol>
        </section>

        <section id="admin" className="kb-section">
          <h3>Admin Settings</h3>
          <ol>
            <li>Queues: manage teams and visibility.</li>
            <li>Workflows: configure allowed transitions.</li>
            <li>Mail: configure providers and routing.</li>
            <li>Templates: manage email and signature content.</li>
            <li>Security: login policy, session timeout, IP restriction.</li>
            <li>Audit changes after any configuration update.</li>
          </ol>
        </section>

        <section id="best-practices" className="kb-section">
          <h3>Best Practices</h3>
          <ol>
            <li>Keep ticket updates short and clear.</li>
            <li>Use Internal Notes for agent-only context.</li>
            <li>Escalate to the correct team and use Unassigned when unsure.</li>
            <li>Close tickets only after confirmation.</li>
            <li>Use templates for consistent communication.</li>
            <li>Validate supplier responses before closing supplier-related tickets.</li>
          </ol>
        </section>
      </main>
    </div>
  )
}
