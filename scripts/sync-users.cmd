@echo off
REM Sync local SQLite users to PostgreSQL (set DATABASE_URL first).
cd /d "%~dp0.."
if "%DATABASE_URL%"=="" (
  echo Set DATABASE_URL first, e.g.:
  echo   set DATABASE_URL=postgresql://user:pass@host:5432/postgres?sslmode=require
  exit /b 1
)
node scripts/sync-users-to-postgres.mjs
