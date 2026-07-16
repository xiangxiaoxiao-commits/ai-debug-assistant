import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'AI Memory Service', description: 'Local-first memory for AI agents' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
