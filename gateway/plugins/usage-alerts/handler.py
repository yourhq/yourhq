from gateway.plugins.sdk import BasePlugin, PluginEvent, PluginResponse


class Handler(BasePlugin):
    def on_event(self, event: PluginEvent) -> PluginResponse | None:
        if event.event_type == "budget.exceeded":
            agent_id = event.payload.get("agent_id", "unknown")
            spent = event.payload.get("spent_usd", 0)
            limit = event.payload.get("monthly_limit_usd", 0)
            self.ctx.logger.warning(f"Agent {agent_id} exceeded budget: ${spent:.2f} / ${limit:.2f}")
            return PluginResponse(log_message=f"Agent {agent_id} exceeded budget (${spent:.2f}/${limit:.2f})")

        if event.event_type == "usage.recorded":
            agent_id = event.payload.get("agent_id")
            if not agent_id:
                return None

            threshold = self.ctx.config.get("warn_at_percent", 80)
            budgets = self.ctx.supabase.query(
                "agent_budgets",
                {
                    "agent_id": f"eq.{agent_id}",
                    "select": "spent_usd,monthly_limit_usd",
                    "limit": "1",
                },
            )
            if not budgets:
                return None

            budget = budgets[0]
            limit_usd = budget.get("monthly_limit_usd", 0)
            if not limit_usd:
                return None

            spent_usd = budget.get("spent_usd", 0)
            pct = (spent_usd / limit_usd) * 100

            if pct < threshold:
                return None

            state_key = f"warned_{agent_id}"
            already_warned = self.ctx.state.get(state_key, scope_kind="agent", scope_id=agent_id)
            if already_warned:
                return None

            self.ctx.state.set(state_key, True, scope_kind="agent", scope_id=agent_id)
            self.ctx.logger.warning(f"Agent {agent_id} at {pct:.0f}% of budget (${spent_usd:.2f}/${limit_usd:.2f})")
            return PluginResponse(log_message=f"Agent {agent_id} at {pct:.0f}% of budget")

        return None
