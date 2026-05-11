from gateway.plugins.sdk import BasePlugin, PluginEvent, PluginResponse


class Handler(BasePlugin):

    def on_event(self, event: PluginEvent) -> PluginResponse | None:
        self.ctx.logger.info(f"Received {event.event_type}: {event.entity_id}")
        return None
