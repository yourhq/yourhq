import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HqLogo } from "@/components/shared/hq-logo";

export default function NewWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-5 lg:h-16 lg:px-8">
        <HqLogo size={24} className="text-foreground" />
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to dashboard
        </Link>
      </header>
      <main className="flex flex-1 justify-center overflow-y-auto px-5 pb-24 lg:px-8">
        {children}
      </main>
    </div>
  );
}
