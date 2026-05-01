import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { HqConfigProvider } from "@/lib/projects/hq-config-provider";
import { readActiveProjectPublic } from "@/lib/projects/server";
import { getOrCreateGatewayAuthToken } from "@/lib/projects/gateway-auth-token";
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
  void getOrCreateGatewayAuthToken().catch((err) => {
    console.warn("[gateway-auth-token] init failed:", (err as Error).message);
  });

  const project = await readActiveProjectPublic();
  const hqConfig = project
    ? {
        projectId: project.id,
        url: project.url,
        anonKey: project.anonKey,
        label: project.label,
        emoji: project.emoji,
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
            {children}
            <Toaster />
          </ThemeProvider>
        </HqConfigProvider>
      </body>
    </html>
  );
}
