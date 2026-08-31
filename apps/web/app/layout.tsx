import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Inter, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import Providers from './_components/Providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const metadata = {
  title: 'POD — Vehicle Tracking',
  description: 'Import & delivery tracking for POD',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body style={{ margin: 0, fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
