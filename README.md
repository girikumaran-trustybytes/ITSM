# CMDB Mock Application

A simple Configuration Management Database (CMDB) interface built with React, TypeScript, Vite (frontend) and Express, TypeScript (backend).

## Project Structure

```
.
├── frontend/                    # React + TypeScript + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   └── AssetTable.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
└── backend/                     # Express + TypeScript backend
    ├── src/
    │   ├── index.ts
    │   └── data.ts
    ├── package.json
    └── tsconfig.json
```

## Features

- **Frontend**: Responsive CMDB asset management interface with sidebar navigation and asset table
- **Backend**: RESTful API with sample asset data
- **TypeScript**: Full type safety across both frontend and backend
- **Real-time Communication**: Frontend fetches assets from backend API

## Setup & Installation

### Prerequisites
- Node.js 16+ and npm

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend will start on `http://localhost:5000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000` and proxy API requests to the backend.

### Docker

You can run the app with Docker and Docker Compose.

- Using Docker Compose (recommended):
```bash
docker compose up --build
```
This builds images for both services and starts:
- Frontend: http://localhost:3000 (served by nginx)
- Backend: http://localhost:5000

- Build and run individually:
```bash
# Backend
docker build -t cmdb-backend ./backend
docker run -p 5000:5000 cmdb-backend

# Frontend
docker build -t cmdb-frontend ./frontend
docker run -p 3000:80 cmdb-frontend
```

Stop everything:
```bash
docker compose down
```

This provides a Docker-based way to build and run the app in production mode.

---

## Refactor & Architecture Changes ✅

I've refactored the backend and frontend to start aligning with an enterprise ITSM architecture (incrementally, preserving current functionality):

- Backend: introduced modular structure under `backend/src/`:
  - `app.ts` and `server.ts` (app/server split)
  - `modules/tickets`, `modules/assets`, `modules/workflows`, `modules/sla`
  - `common/middleware` (auth, rbac, error)
  - Background job: `jobs/sla.job.ts` (demo scheduler performs SLA checks)
  - Audit logging (in-memory for now) and GET `/api/tickets/:id/audit`
  - Workflow engine (`modules/workflows/workflow.service.ts`) with reusable definitions and transition checks

- Frontend: scaffolded an `app/` folder and added centralized `services/`:
  - `services/api.ts`, `services/ticket.service.ts` for centralized API calls
  - `TicketsView` will attempt to hydrate from `/api/tickets` when available

Next recommended steps:
1. Add persistent storage (Postgres/Mongo) and move in-memory seed into `database/migrations` and `seeders`.
2. Replace mockAuth with a real auth provider (JWT/OIDC) and wire RBAC to a roles store.
3. Implement persistent audit log and SLA/notification queue (Redis + worker).
4. Add CI workflow to build/push Docker images and run tests.

If you'd like, I can next add a GitHub Actions CI workflow to build Docker images and run TypeScript checks. 🔧

## Available Scripts

### Backend
- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled backend

### Frontend
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## API Endpoints

- `GET /api/assets` - Fetch all assets
- `GET /api/assets/:id` - Fetch asset by ID
- `GET /api/tickets` - List tickets (new)
- `POST /api/tickets` - Create ticket (new)
- `GET /api/tickets/:id` - Get ticket details (new)
- `POST /api/tickets/:id/transition` - Transition ticket state (new)
- `GET /api/tickets/:id/audit` - Get audit log for ticket (new)
- `GET /health` - Health check

## Sample Asset Data

The backend includes sample assets with the following fields:
- Asset Type (Workstation, Laptop)
- Asset Tag (ABC00001, ABC00008, etc.)
- Site (Main, etc.)
- Status (Active, In Stock)
- Key Field (Hardware model)
- Key Field 2 (Serial number or identifier)
- Business Owner (Optional)
