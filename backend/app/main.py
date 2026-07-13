import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_routes
from app.api import dm as dm_routes
from app.api import photos as photo_routes
from app.api import rooms as room_routes
from app.api import users as user_routes
from app.core import redis as redis_client
from app.core.config import get_settings
from app.core.ratelimit import message_limiter
from app.core.scheduler import CleanupScheduler
from app.realtime import manager


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # One shared Redis client powers both the pub/sub fan-out and the
        # message rate limiter. None when REDIS_URL is unset/unreachable —
        # both consumers then degrade to in-process behavior.
        client = await redis_client.startup(settings.redis_url)
        message_limiter.use_redis(client)
        await manager.startup(client)
        # Hourly message-expiration sweep. Lives in-process and restarts with
        # the app; Postgres remains the source of truth.
        cleanup_scheduler = CleanupScheduler(settings)
        cleanup_scheduler.start()
        try:
            yield
        finally:
            await cleanup_scheduler.stop()
            await manager.shutdown()
            await redis_client.shutdown()

    app = FastAPI(
        title="Hyperlocal Chat API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "env": settings.app_env}

    app.include_router(auth_routes.router)
    app.include_router(user_routes.router)
    app.include_router(room_routes.router)
    app.include_router(room_routes.ws_router)
    app.include_router(dm_routes.router)
    app.include_router(dm_routes.list_router)
    app.include_router(dm_routes.ws_router)
    app.include_router(photo_routes.router)
    return app


app = create_app()
