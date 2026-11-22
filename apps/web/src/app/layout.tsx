import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";

const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Taskly · Quadros em tempo real",
  description: "Quadros Kanban colaborativos: todo mundo no mesmo quadro, vendo as mudanças na hora.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={workSans.variable}>
      <body>{children}</body>
    </html>
  );
}
