#!/usr/bin/env python3
"""Fetch custom field definitions for an entity type."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--entity-type", default="contact")
args = ap.parse_args()

fields = api_get(
    "field_definitions",
    {
        "entity_type": f"eq.{args.entity_type}",
        "is_active": "eq.true",
        "order": "field_group.asc.nullsfirst,sort_order.asc",
        "select": "field_key,field_type,label,field_group,required,options,description",
    },
)
output({"entity_type": args.entity_type, "count": len(fields), "fields": fields})
