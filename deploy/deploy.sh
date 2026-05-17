#!/usr/bin/env bash
set -euo pipefail

# Simple deploy script for Ubuntu VPS using Docker Compose
# Usage: ./deploy/deploy.sh pull-up

COMPOSE_FILES="-f docker-compose.prod.yml"

function pull_images() {
  echo "Pulling images..."
  docker compose ${COMPOSE_FILES} pull
}

function up() {
  echo "Starting services..."
  docker compose ${COMPOSE_FILES} up -d --remove-orphans
}

function down() {
  echo "Stopping services..."
  docker compose ${COMPOSE_FILES} down
}

function migrate_schema() {
  # Apply schema.sql if present
  if [ -f ./schema.sql ]; then
    DB_CONTAINER=$(docker compose ${COMPOSE_FILES} ps -q db)
    if [ -n "$DB_CONTAINER" ]; then
      echo "Applying schema.sql to Postgres container $DB_CONTAINER"
      docker cp ./schema.sql ${DB_CONTAINER}:/schema.sql
      docker exec -i ${DB_CONTAINER} psql -U rs_user -d redirect_service -f /schema.sql
    else
      echo "DB container not found; skipping schema migration"
    fi
  fi
}

case ${1:-} in
  pull-up)
    pull_images
    up
    migrate_schema
    ;;
  up)
    up
    ;;
  down)
    down
    ;;
  migration)
    migrate_schema
    ;;
  *)
    echo "Usage: $0 {pull-up|up|down|migration}"
    exit 2
    ;;
esac
