import{R as r,x as e}from"./index-b5e35175.js";const g=[{id:"ui-light-dashboard-suite",title:"UI Design Prompt (Light Theme)",category:"ui-design",theme:"light",summary:"Desktop SaaS ITSM layout with sidebar navigation and analytics cards.",prompt:`Design a modern IT service management (ITSM) ticketing system similar to HaloPSA.
Include a clean light theme UI with a left sidebar navigation (Dashboard, Tickets, Clients, Assets, Reports, Settings).
The main dashboard should show ticket statistics (open, in progress, resolved), recent activity, SLA status, and performance charts.

The ticket view should include:
- Ticket ID, priority, status, assigned technician
- Conversation thread with replies
- Attachments section
- SLA timer and due date
- Action buttons (assign, escalate, resolve)

Use a professional SaaS style with soft shadows, rounded cards, minimal icons, and a blue/green color palette.
Make it suitable for desktop web application.`,tags:["dashboard","tickets","sla","light-theme"]},{id:"full-system-stack",title:"Full System App Prompt",category:"full-system",theme:"light",summary:"End-to-end helpdesk app scope with roles, APIs, authentication, and analytics.",prompt:`Build a full-stack IT helpdesk ticketing system similar to HaloPSA.

Features:
- User roles (Admin, Technician, Client)
- Ticket creation (title, description, priority, category)
- Ticket assignment and status tracking
- SLA management with timers and alerts
- Internal notes vs client replies
- Email notifications and updates
- Dashboard with analytics (ticket volume, response time, resolution rate)
- Asset management and client database

Tech stack:
- Frontend: React with modern UI (Tailwind CSS)
- Backend: Node.js / Express
- Database: MongoDB or PostgreSQL

Include authentication, REST APIs, and a responsive UI.`,tags:["full-stack","auth","rest-api","tailwind"]},{id:"image-set-light-10",title:"Image Generation Prompt (10 Screens, Light)",category:"image-set",theme:"light",summary:"Ten consistent ITSM screens for design exploration and product direction.",prompt:`Create a set of 10 modern UI screens for an IT ticketing system like HaloPSA in light theme.

Screens include:
1. Dashboard overview
2. Ticket list view
3. Ticket detail page
4. Create new ticket form
5. Client management page
6. Asset tracking page
7. Reports & analytics dashboard
8. SLA monitoring screen
9. Settings page
10. User management panel

Style:
- Clean SaaS dashboard
- Light theme with subtle gradients
- Card-based layout
- Professional and minimal
- Consistent spacing and typography`,tags:["images","10-screens","light-theme","figma-reference"]},{id:"ux-advanced-light",title:"Advanced UX Prompt (Enterprise)",category:"advanced-ux",theme:"light",summary:"Workflow-first UX with triage speed, smart filtering, and accessibility.",prompt:`Design a highly intuitive ITSM ticketing system inspired by HaloPSA and ServiceNow.

Focus on:
- Fast ticket triaging workflow
- Drag-and-drop ticket status updates
- Smart filters and search
- Priority highlighting (color-coded)
- Real-time updates
- Technician productivity tools

Ensure accessibility, responsive layout, and enterprise-grade UX patterns.`,tags:["ux","enterprise","triage","accessibility"]},{id:"image-set-dark-10",title:"Image Prompt (10 Screens, Dark)",category:"image-set",theme:"dark",summary:"Dark SaaS visual set with dashboard, tickets, assets, reports, and admin screens.",prompt:`Create 10 modern UI design screens for an IT helpdesk ticketing system similar to HaloPSA.

Theme: Dark mode (deep gray/black background with blue and teal accents)

Screens:
1. Dashboard with ticket stats, charts, SLA indicators
2. Ticket list view with filters and priority labels
3. Ticket detail page with conversation thread and attachments
4. New ticket creation form
5. Client management page
6. Asset management system
7. Reports and analytics dashboard
8. SLA monitoring screen with timers
9. Settings panel
10. User & role management page

Style:
- Clean SaaS dashboard
- Card-based layout with soft shadows
- Rounded corners, minimal icons
- Professional and modern UI
- High contrast readability

Generate each screen as a separate high-quality image.`,tags:["images","10-screens","dark-theme","high-contrast"]},{id:"react-dark-ui",title:"React Code Prompt (Dark UI)",category:"react-code",theme:"dark",summary:"Modular React + Tailwind UI blueprint for a polished ITSM front-end.",prompt:`Build a modern IT helpdesk ticketing system UI similar to HaloPSA using React and Tailwind CSS.

Requirements:
- Dark theme UI
- Sidebar navigation (Dashboard, Tickets, Clients, Assets, Reports, Settings)
- Dashboard with charts and stats cards
- Ticket list with filters, search, and status badges
- Ticket detail page with chat-style conversation
- Responsive design

Components:
- Sidebar
- Header/Navbar
- TicketCard
- TicketTable
- ChatThread
- StatsCards

Use:
- React functional components
- Tailwind CSS for styling
- Recharts for graphs
- Clean and modular structure

Make it production-ready and visually polished.`,tags:["react","tailwind","dark-theme","components"]},{id:"figma-dark-kit",title:"Figma UI Kit Prompt (Dark)",category:"figma-kit",theme:"dark",summary:"Componentized Figma kit with tokens, layouts, and reusable SaaS patterns.",prompt:`Design a Figma-style UI kit for an ITSM ticketing system inspired by HaloPSA.

Include:
- Design system (colors, typography, spacing, grid)
- Dark theme palette
- Components:
  - Buttons (primary, secondary, danger)
  - Input fields, dropdowns
  - Cards and tables
  - Modals and dialogs
  - Sidebar navigation
- Full screens:
  - Dashboard
  - Ticket list
  - Ticket detail
  - Reports
  - Settings

Style:
- SaaS product design
- Consistent spacing and layout
- Auto-layout ready
- Clean and developer-friendly

Organize in a way suitable for Figma components and reuse.`,tags:["figma","design-system","dark-theme","auto-layout"]},{id:"ux-advanced-dark",title:"Advanced Dark UX Prompt",category:"advanced-ux",theme:"dark",summary:"Premium dark enterprise UX with triage acceleration and real-time workflows.",prompt:`Design an enterprise-grade IT ticketing system UI inspired by HaloPSA, ServiceNow, and Jira.

Theme:
- Dark mode with elegant contrast
- Subtle gradients and glassmorphism effects

Focus on:
- Fast ticket triaging
- Drag-and-drop ticket workflow
- Smart filtering and search
- Real-time updates
- SLA tracking with visual timers
- Technician productivity tools

UI Elements:
- Interactive charts
- Activity timeline
- Notifications panel
- Multi-column ticket view

Style:
- Premium SaaS product
- Minimal, futuristic, and clean
- Smooth UX interactions

Make it visually stunning and highly usable.`,tags:["enterprise","dark-theme","real-time","productivity"]}],u=["I want 10 images like before","I want React code","I want Figma-style UI","I want dark theme instead"],y={"ui-design":"UI Design","full-system":"Full System","image-set":"Image Set","advanced-ux":"Advanced UX","react-code":"React Code","figma-kit":"Figma Kit"};function k(a,i){return g.filter(s=>!(a!=="all"&&s.theme!==a||i!=="all"&&s.category!==i))}async function S(a){var i;if(typeof navigator<"u"&&((i=navigator.clipboard)!=null&&i.writeText)){await navigator.clipboard.writeText(a);return}throw new Error("Clipboard API not available")}function f(){const[a,i]=r.useState("all"),[s,m]=r.useState("all"),[p,l]=r.useState(""),[d,o]=r.useState(""),h=r.useMemo(()=>k(a,s),[a,s]),c=async(t,n)=>{try{await S(n),l(t),o(""),window.setTimeout(()=>l(""),1400)}catch{o("Copy failed. Please copy manually."),window.setTimeout(()=>o(""),2e3)}};return e.jsxs("div",{className:"work-main prompt-library-page",children:[e.jsxs("div",{className:"prompt-library-header",children:[e.jsx("h2",{children:"AI Prompt Library"}),e.jsx("p",{children:"Reusable prompts for UI design, full-stack scaffolding, image generation, and advanced UX exploration."})]}),e.jsxs("div",{className:"prompt-library-toolbar",children:[e.jsxs("div",{className:"prompt-library-filter",children:[e.jsx("label",{htmlFor:"prompt-theme",children:"Theme"}),e.jsxs("select",{id:"prompt-theme",value:a,onChange:t=>i(t.target.value),children:[e.jsx("option",{value:"all",children:"All"}),e.jsx("option",{value:"light",children:"Light"}),e.jsx("option",{value:"dark",children:"Dark"})]})]}),e.jsxs("div",{className:"prompt-library-filter",children:[e.jsx("label",{htmlFor:"prompt-category",children:"Category"}),e.jsxs("select",{id:"prompt-category",value:s,onChange:t=>m(t.target.value),children:[e.jsx("option",{value:"all",children:"All"}),e.jsx("option",{value:"ui-design",children:"UI Design"}),e.jsx("option",{value:"full-system",children:"Full System"}),e.jsx("option",{value:"image-set",children:"Image Set"}),e.jsx("option",{value:"advanced-ux",children:"Advanced UX"}),e.jsx("option",{value:"react-code",children:"React Code"}),e.jsx("option",{value:"figma-kit",children:"Figma Kit"})]})]})]}),e.jsxs("div",{className:"prompt-library-quick",children:[e.jsx("h3",{children:"Quick Requests"}),e.jsx("div",{className:"prompt-quick-row",children:u.map(t=>e.jsx("button",{type:"button",onClick:()=>c(t,t),children:t},t))})]}),d?e.jsx("div",{className:"prompt-copy-error",children:d}):null,e.jsx("div",{className:"prompt-grid",children:h.map(t=>e.jsxs("article",{className:"prompt-card",children:[e.jsxs("div",{className:"prompt-card-head",children:[e.jsxs("div",{children:[e.jsx("h3",{children:t.title}),e.jsx("p",{children:t.summary})]}),e.jsxs("div",{className:"prompt-badges",children:[e.jsx("span",{children:y[t.category]}),e.jsx("span",{children:t.theme})]})]}),e.jsx("pre",{children:t.prompt}),e.jsx("div",{className:"prompt-card-tags",children:t.tags.map(n=>e.jsx("span",{children:n},n))}),e.jsx("div",{className:"prompt-card-actions",children:e.jsx("button",{type:"button",onClick:()=>c(t.id,t.prompt),children:p===t.id?"Copied":"Copy Prompt"})})]},t.id))})]})}export{f as default};
