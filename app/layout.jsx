import { DM_Sans, Rye } from 'next/font/google';
import './globals.css';
import MusicControl from '@/components/MusicControl';

const display = Rye({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'Last Cell',
  description: 'Move in secret, fire at once, outlast a shrinking arena. Free multiplayer, no sign-in.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#271b3d',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <MusicControl />
      </body>
    </html>
  );
}
