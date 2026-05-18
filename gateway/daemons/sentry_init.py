"""Shared Sentry initialization for gateway daemons.

Sentry is only active when SENTRY_DSN is set (hosted mode only).
The Python SDK is a complete no-op when DSN is absent.
"""

import os


def init_sentry(daemon_name: str) -> None:
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return

    runtime_mode = os.environ.get("RUNTIME_MODE", "")
    if runtime_mode not in ("hosted", "e2b"):
        return

    try:
        import sentry_sdk
    except ImportError:
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=f"gateway-{daemon_name}",
        traces_sample_rate=0,
        send_default_pii=False,
        before_send=_before_send,
    )
    sentry_sdk.set_tag("gateway_id", os.environ.get("GATEWAY_ID", "default"))
    sentry_sdk.set_tag("tenant_id", os.environ.get("TENANT_ID", ""))
    sentry_sdk.set_tag("daemon_name", daemon_name)
    sentry_sdk.set_tag("runtime_mode", os.environ.get("RUNTIME_MODE", "unknown"))


def capture(exc: Exception) -> None:
    """Capture an exception if Sentry is available."""
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except ImportError:
        pass


def _before_send(event, hint):
    exc_info = hint.get("exc_info")
    if exc_info:
        _, exc_value, _ = exc_info
        msg = str(exc_value) if exc_value else ""

        if "Connection is already closed" in msg:
            return None
        if "Handshake status" in msg and "101" not in msg:
            return None
        if isinstance(exc_value, (ConnectionResetError, TimeoutError)):
            return None
        if "urlopen error" in msg and ("timed out" in msg or "Connection refused" in msg):
            return None

    return event
