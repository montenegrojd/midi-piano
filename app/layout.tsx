import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Piano Practice",
  description: "Record and track piano practice takes against Faber method book pieces.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
