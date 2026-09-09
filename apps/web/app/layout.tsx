import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import Providers from './_components/Providers';
import './globals.css';

// Body text. Plus Jakarta Sans rather than Inter: Inter is the default of
// every enterprise dashboard and reads as impersonal. This keeps the app
// credible — it produces audit evidence — while taking the starch out.
// Headings and KPI numbers stay on Space Grotesk; the contrast between a warm
// body face and a technical display face is what gives the UI its character.
const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const metadata = {
  title: 'POD — Vehicle Tracking',
  description: 'Import & delivery tracking for POD',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${grotesk.variable}`}>
      <body style={{ margin: 0, fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
