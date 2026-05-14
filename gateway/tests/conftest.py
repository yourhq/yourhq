import os
import sys

# Ensure daemon modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "daemons"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "connectors"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "embedder"))

# Set required env vars so modules can import without crashing
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("GATEWAY_ID", "test-gateway")
