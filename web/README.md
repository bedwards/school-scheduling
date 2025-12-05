# School Scheduler Web App

Web interface for the School Scheduling System, deployed on Cloudflare (Workers + Pages + D1).

## Security Notice

**IMPORTANT: This app handles student PII (Personally Identifiable Information)**

- NEVER commit real student data to git
- NEVER commit `.dev.vars` or any secrets
- All data is stored in D1 and protected by authentication
- Audit logs track all data access

## Quick Start

```bash
# Install dependencies
npm install

# Copy secrets template
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your JWT_SECRET

# Create D1 database (first time only)
wrangler d1 create school-scheduler-db
# Update wrangler.toml with the database_id

# Run migrations
npm run db:migrate:local

# Start development server
npm run dev
```

## Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# Set production secrets
wrangler secret put JWT_SECRET
```

## Project Structure

```
web/
├── src/
│   ├── api/          # Hono API routes (Workers)
│   ├── app/          # React frontend
│   │   ├── components/
│   │   ├── context/
│   │   └── pages/
│   ├── auth/         # JWT & password utilities
│   ├── db/           # Database helpers
│   ├── scheduler/    # Scheduling algorithm
│   ├── shared/       # Shared types
│   └── worker.ts     # Worker entry point
├── migrations/       # D1 SQL migrations
├── public/           # Static assets
│   └── images/       # UI images
└── wrangler.toml     # Cloudflare config
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret for signing JWTs | Yes |
| `ENVIRONMENT` | `development` or `production` | No |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

### Schools (requires auth)
- `GET /api/schools` - List schools
- `POST /api/schools` - Create school
- `GET /api/schools/:id` - Get school

### Data (requires auth + school access)
- `GET /api/schools/:id/students`
- `GET /api/schools/:id/teachers`
- `GET /api/schools/:id/courses`
- `GET /api/schools/:id/rooms`
- `GET /api/schools/:id/schedules`
- `POST /api/schools/:id/schedules/generate`
