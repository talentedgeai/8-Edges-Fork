'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Nav from './Nav'
import Footer from './Footer'

// Routes that render standalone, without the site nav/footer (e.g. full-screen decks, the /admin CRM, the /team portal).
const BARE_ROUTES = ['/blueprints/team-onboarding', '/reserve', '/admin', '/team', '/portal', '/surveys']

export default function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const bare = BARE_ROUTES.some((route) => pathname?.startsWith(route))

  return (
    <>
      {!bare && <Nav />}
      {children}
      {!bare && <Footer />}
    </>
  )
}
