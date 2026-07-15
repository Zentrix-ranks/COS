import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZENTRIX OS · Content Operating System',
  description: 'Mission Control for the Zentrix Content Operating System (COS).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
