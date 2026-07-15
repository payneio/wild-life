"""Main application for personal-api."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from personal_api.auth import BearerAuthMiddleware
from personal_api.config import settings
from personal_api.routers import (
    calendar,
    core,
    goals,
    history,
    knowledge,
    locations,
    merge,
    metrics,
    notes,
    organizations,
    people,
    reviews,
    routines,
    stream,
    tags,
    tasks,
    tracking,
)
from personal_api.routers import health as health_routes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    settings.ensure_data_dir()
    yield


app = FastAPI(
    title="personal-api",
    description="Personal API — single-user CRM/Calendar/Journal/Planner backend",
    version="0.1.0",
    lifespan=lifespan,
)

# Auth added first so it sits *inside* CORS: CORS handles preflight, then the
# bearer check runs on real requests. (Last-added middleware is outermost.)
app.add_middleware(BearerAuthMiddleware, token=settings.token)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint (unauthenticated — used by castle readiness)."""
    return {"status": "ok"}


app.include_router(core.router)
app.include_router(tasks.router)
app.include_router(people.router)
app.include_router(organizations.router)
app.include_router(locations.router)
app.include_router(merge.router)
app.include_router(routines.router)
app.include_router(goals.router)
app.include_router(metrics.router)
app.include_router(calendar.router)
app.include_router(notes.router)
app.include_router(notes.images_router)
app.include_router(tracking.router)
app.include_router(reviews.router)
app.include_router(knowledge.router)
app.include_router(tags.router)
app.include_router(health_routes.router)
app.include_router(history.router)
app.include_router(stream.router)


def run() -> None:
    """Run the application with uvicorn."""
    uvicorn.run(
        "personal_api.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
