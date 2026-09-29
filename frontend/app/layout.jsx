import './globals.css';

export const metadata = {
  title: 'Social Tree // Chatter',
  description: 'Minimalist Node-Based Social Graph & Friend Relationship Tree',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
