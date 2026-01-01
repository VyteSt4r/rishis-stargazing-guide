import '../styles/globals.css'
import { ReactNode } from 'react'
import QueryProvider from '../components/QueryProvider'

export const metadata = {
  title: 'Stargazer',
  description: 'Personal Digital Observatory — connect with the night sky'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <main className="min-h-screen w-full bg-space">
            {children}
          </main>
        </QueryProvider>
      </body>
    </html>
  )
}
