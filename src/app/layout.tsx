import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'AI Debug Assistant', description: 'Local troubleshooting workbench' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
