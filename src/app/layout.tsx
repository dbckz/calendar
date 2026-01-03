import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Planner",
  description: "Plan your day with Google Calendar, Asana, and ad-hoc tasks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
