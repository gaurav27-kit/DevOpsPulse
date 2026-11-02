# DevOpsPulse

DevOpsPulse is an application monitoring and incident management platform built with the MERN stack (MongoDB, Express, React, Node.js). It provides automated HTTP/HTTPS health checks, response-time tracking, outage detection, incident workflows, deployment tracking, and a real-time operational dashboard.

## Tech Stack

- **Frontend**: React 18, Vite, React Router v6, TanStack Query v5, Axios, Tailwind CSS v4, Lucide React
- **Backend**: Node.js (ES modules), Express, MongoDB, Mongoose, Zod, bcryptjs, jsonwebtoken, helmet, cors
- **Security**: SSRF protection, tenant isolation scoped by `ownerId`, rate limiting, httpOnly JWT cookies

## Project Structure

```
DevOpsPulse/
├── backend/
│   ├── src/
│   │   ├── config/        # Environment and DB connection
│   │   ├── controllers/   # Request/response handlers
│   │   ├── middleware/    # Auth, validation, error handling, rate limiting
│   │   ├── models/        # Mongoose schemas (User, Application)
│   │   ├── routes/        # Express route definitions
│   │   ├── services/      # Business logic (auth, applications, urlSafety)
│   │   ├── utils/         # AppError, asyncHandler
│   │   ├── app.js         # Express app configuration
│   │   └── server.js      # Server entry point
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/           # Axios instance and API modules
    │   ├── components/    # Reusable UI components and AppLayout
    │   ├── hooks/         # Custom hooks (useAuth)
    │   ├── pages/         # Login, Register, Dashboard, NotFound
    │   ├── routes/        # ProtectedRoute, PublicOnlyRoute
    │   ├── App.jsx
    │   └── main.jsx
    ├── .env.example
    └── package.json
```

## Getting Started

### 1. Backend Setup
```bash
cd backend
cp .env.example .env
# Configure MONGO_URI and JWT_SECRET in .env
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.
