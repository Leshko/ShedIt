import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShedIt — Shed Planner',
  description:
    'Design a shed with a custom height for every wall, then export framing plans, a cut list and a shopping list.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
