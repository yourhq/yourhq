import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeApplier } from "@/components/theme-applier";
import { HqConfigProvider } from "@/lib/workspaces/hq-config-provider";
import { readActiveWorkspacePublic } from "@/lib/workspaces/server";
import { getOrCreateGatewayAuthToken } from "@/lib/workspaces/gateway-auth-token";
import { PostHogPageview } from "./posthog-pageview";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "HQ",
  description: "Your HQ — agent operations platform.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HQ",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (process.env.DEPLOYMENT_MODE !== "hosted") {
    void getOrCreateGatewayAuthToken().catch((err) => {
      console.warn("[gateway-auth-token] init failed:", (err as Error).message);
    });
  }

  const workspace = await readActiveWorkspacePublic();
  const hqConfig = workspace
    ? {
        workspaceId: workspace.id,
        url: workspace.url,
        anonKey: workspace.anonKey,
        label: workspace.label,
        emoji: workspace.emoji,
      }
    : null;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <HqConfigProvider config={hqConfig}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <PostHogPageview />
            <ThemeApplier />
            {children}
            <Toaster />
          </ThemeProvider>
        </HqConfigProvider>
      </body>
    </html>
  );
}
