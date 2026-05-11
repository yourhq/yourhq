"""Data transforms — convert API responses into markdown and SourceItem fields.

Each provider has different response shapes. Keep all parsing and rendering
logic here so `read.py` stays focused on API orchestration.
"""

from __future__ import annotations
