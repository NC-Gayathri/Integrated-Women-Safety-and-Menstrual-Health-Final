# Women Safety & Menstrual Health Backend Server

Production-grade Express.js + TypeScript + MySQL REST API server with layered architecture, JWT authentication, bcrypt password hashing, input validation, structured Winston logging, and OpenAPI Swagger documentation.

## Directory Structure

```
server/
├── src/
│   ├── config/             # DB Pool & Swagger setup
│   ├── constants/          # System messages, status codes, enums
│   ├── controllers/        # Express route handlers
│   ├── middleware/         # Auth, validation, request tracing, error handling
│   ├── models/             # TypeScript DTOs & DB types
│   ├── routes/             # Express API v1 routers
│   ├── services/           # Business logic & MySQL transactions
│   ├── utils/              # Winston logger, password hashing, API responses
│   ├── validators/         # express-validator rules
│   ├── app.ts              # Express application setup
│   └── server.ts           # Listener entry point
├── logs/                   # Winston log files
├── schema.sql              # Database DDL script
├── .env.example            # Environment variables template
└── API_DOCS.md             # API specifications & Mermaid ER diagram
```

## Quick Start & Installation Guide

### 1. Prerequisites
- Node.js (v18+ recommended)
- MySQL Server (v8.0+ running on port 3306)

### 2. Database Setup
Execute `schema.sql` in MySQL to initialize `women_safety_db` and tables:

```bash
mysql -u root -p < schema.sql
```

### 3. Environment Setup
Copy `.env.example` to `.env` and fill in your database credentials:

```bash
cp .env.example .env
```

### 4. Install Dependencies
```bash
cd server
npm install
```

### 5. Run Server

#### Development Mode (with nodemon):
```bash
npm run dev
```

#### Production Build & Start:
```bash
npm run build
npm start
```

## Endpoints Summary

- **Health Check**: `GET /health`
- **Swagger Docs**: `GET /api/docs`
- **Auth**: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`
- **User Profile**: `GET /api/v1/users/me`, `PUT /api/v1/users/me`
- **Menstrual & Predictions**: `POST /api/v1/menstrual`, `GET /api/v1/menstrual`, `PUT /api/v1/menstrual/:id`, `DELETE /api/v1/menstrual/:id`
- **Symptoms**: `POST /api/v1/symptoms`, `GET /api/v1/symptoms`, `PUT /api/v1/symptoms/:id`, `DELETE /api/v1/symptoms/:id`
- **Emergency Contacts**: `POST /api/v1/emergency`, `GET /api/v1/emergency`, `PUT /api/v1/emergency/:id`, `DELETE /api/v1/emergency/:id`
- **SOS Alerts**: `POST /api/v1/sos`, `GET /api/v1/sos`
- **Assistant Chat**: `POST /api/v1/assistant/chat`, `GET /api/v1/assistant/history`, `DELETE /api/v1/assistant/chat/:id`
- **Notifications**: `GET /api/v1/notifications`, `PUT /api/v1/notifications/:id/read`
- **Wellness Challenges**: `GET /api/v1/wellness`, `POST /api/v1/wellness`, `PUT /api/v1/wellness/:id`
