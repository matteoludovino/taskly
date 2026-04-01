import type { Metadata } from 'next';
import { Work_Sans } from 'next/font/google';
import './globals.css';

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Taskly - Seu app de tarefas',
  description: 'Seu to-do app dinâmico.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.12.0-2/css/all.min.css"
          integrity="sha256-46r060N2LrChLLb5zowXQ72/iKKNiw/lAmygmHExk/o="
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('todo_theme')||'dark';document.body&&(document.body.className=t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${workSans.className} dark`}>{children}</body>
    </html>
  );
}
