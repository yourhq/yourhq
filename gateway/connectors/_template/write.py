from __future__ import annotations

from connectors.base import ActionDefinition, BaseActionProvider


class ExampleActionProvider(BaseActionProvider):
    def list_actions(self) -> list[ActionDefinition]:
        return [
            ActionDefinition(
                name="create_item",
                label="Create item",
                description="Create a new item in Example Service.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Item title"},
                        "content": {"type": "string", "description": "Markdown body"},
                        "parent_id": {"type": "string", "description": "Parent container ID"},
                    },
                    "required": ["title"],
                },
            ),
        ]

    def execute(self, action: str, params: dict, creds: dict) -> dict:
        if action == "create_item":
            # Call the provider API to create the item.
            # Return a dict with at least {"ok": True, "id": "..."}.
            raise NotImplementedError
        raise ValueError(f"Unknown action: {action}")
