import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interactive Quantum Error Correction Simulator",
  description:
    "Phase-2 prototype: a configurable environment for simulating multiple quantum noise models and evaluating QEC performance — Shor, Steane, 5-qubit, repetition and surface codes with Monte Carlo performance analysis.",
  keywords: ["Quantum Error Correction", "QEC", "Surface Code", "Shor Code", "Steane Code", "Quantum Simulator", "MWPM"],
  authors: [
    { name: "K. Devendra Reddy" },
    { name: "Shaik Muzzammil" },
    { name: "D. Guna Samhith" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <div className="flex min-h-screen flex-col">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
