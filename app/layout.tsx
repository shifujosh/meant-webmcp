import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meant",
  description:
    "Make what you mean. A conversational creative editor for precise, editable work.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

const DRAFT_PROTOCOL_REVISION = "meant-conversational-composition-v3";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><meta content={DRAFT_PROTOCOL_REVISION} name="meant-draft-revision" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
