# nourish — meal tracking website

A personal meal planning and nutrition tracking app. Manage recipes, plan your week, and see a macro breakdown of your eating habits.

---

## Self-hosting with Docker

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2

### 1. Create a `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  api:
    image: justin8912/meal-tracking-website-api:latest
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      PORT: "3000"
      HOST: 0.0.0.0
      CORS_ORIGIN: ${CORS_ORIGIN:-*}
      USDA_API_KEY: ${USDA_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${API_PORT:-8100}:3000"
    restart: unless-stopped

  web:
    image: justin8912/meal-tracking-website-ui:latest
    environment:
      API_BASE_URL: ${API_BASE_URL:-http://localhost:8100}
    depends_on:
      - api
    ports:
      - "${WEB_PORT:-8090}:8080"
    restart: unless-stopped

volumes:
  pgdata:
```

### 2. Create a `.env` file

```env
# Postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme
POSTGRES_DB=mealtracking

# API
USDA_API_KEY=          # optional — see note below
CORS_ORIGIN=*
API_PORT=8100

# Web — set to the address your browser uses to reach the API
API_BASE_URL=http://localhost:8100
WEB_PORT=8090
```

> **USDA ingredient search** is optional. Without a key the search returns unavailable and you fall back to adding custom ingredients. Free key: https://fdc.nal.usda.gov/api-key-signup.html

> **Remote access** (accessing from another device on your network): replace `localhost` in `API_BASE_URL` with your server's IP or hostname, e.g. `http://192.168.1.10:8100`.

### 3. Start

```bash
docker compose pull   # pull latest images
docker compose up -d  # start in background
```

The app is available at **http://localhost:8090** (or `WEB_PORT` if you changed it).

### Updating

```bash
docker compose pull
docker compose up -d
```

### Stopping

```bash
docker compose down        # stop containers, keep data
docker compose down -v     # stop containers and delete database
```
