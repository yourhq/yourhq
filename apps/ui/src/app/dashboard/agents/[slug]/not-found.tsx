import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AgentNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="rounded-full bg-muted/50 p-3">
        <Bot className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-[13px] font-medium text-foreground">
          Agent not found
        </p>
        <p className="text-[11px] text-muted-foreground">
          This agent may have been removed or you don&apos;t have access.
        </p>
      </div>
      <Link href="/dashboard/agents">
        <Button variant="outline" size="sm" className="h-7 text-[11px]">
          Back to agents
        </Button>
      </Link>
    </div>
  );
}
