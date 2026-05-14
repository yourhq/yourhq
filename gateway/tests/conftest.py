import os
import sys

# Ensure daemon modules are importable
_gw = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(_gw, "daemons"))
sys.path.insert(0, _gw)
sys.path.insert(0, os.path.join(_gw, "connectors"))
sys.path.insert(0, os.path.join(_gw, "embedder"))
sys.path.insert(0, os.path.join(_gw, "plugins"))
# Allow `from gateway.plugins.sdk import ...` style imports
sys.path.insert(0, os.path.join(_gw, ".."))

# Set required env vars so modules can import without crashing
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("GATEWAY_ID", "test-gateway")
