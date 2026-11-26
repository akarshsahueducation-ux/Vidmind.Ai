import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VidMind AI — Turn Every Video Into Knowledge",
  description:
    "Transform YouTube videos into structured summaries, interactive AI courses, RAG video chat, notes, quizzes, flashcards, and knowledge graphs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07090f] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
