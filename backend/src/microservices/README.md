# Backend Microservice-Style Routers

This folder provides domain routers for:

- `ticket-service`
- `asset-service`
- `user-service`
- `supplier-service`

Each router delegates to the existing module routes (no business logic changes), enabling service-style API mounts under `/api/microservices/*`.
