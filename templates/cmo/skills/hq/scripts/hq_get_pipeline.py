#!/usr/bin/env python3
"""Fetch pipeline stages for an entity type."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--entity-type", default="contact")
args = ap.parse_args()

stages = api_get(
    "pipeline_stages",
    {
        "entity_type": f"eq.{args.entity_type}",
        "order": "sort_order.asc",
        "select": "stage_key,label,color,is_terminal,is_default",
    },
)
output({"entity_type": args.entity_type, "count": len(stages), "stages": stages})
