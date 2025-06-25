// import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthContext";

export const metadata = {
  title: "Bondiver",
  description: "Where friendships buzz and bloom",
  icons: {
    icon: '/bondiverLogo.svg',
    shortcut: '/bondiverLogo.svg',
    apple: '/bondiverLogo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
          <AuthProvider>
            {children}
          </AuthProvider>
      </body>
    </html>
  );
}

