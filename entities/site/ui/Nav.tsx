'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  // On the retreat funnel, the persistent nav CTA feeds the checkout instead of
  // competing with it (Book a Conversation → a different destination).
  const onRetreatFunnel = pathname?.startsWith('/saigon-private') ?? false
  const ctaHref = onRetreatFunnel ? '/reserve/saigon-private' : '/contact'
  const ctaLabel = onRetreatFunnel ? 'Reserve a retreat' : 'Book a Conversation'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => {
      setServicesOpen(false)
      setResourcesOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const toggleMenu = () => setMenuOpen((v) => !v)

  const hamburgerStyle = (i: number) => {
    if (!menuOpen) return {}
    if (i === 0) return { transform: 'rotate(45deg) translate(5px, 5px)' }
    if (i === 1) return { opacity: 0 }
    return { transform: 'rotate(-45deg) translate(5px, -5px)' }
  }

  return (
    <>
      <nav
        id="navbar"
        className={scrolled ? 'is-scrolled' : undefined}
      >
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">
              <Image src="/logo.png" alt="Edge8" width={120} height={36} className="site-logo-36" priority />
            </Link>

            <ul className="nav-links">
              <li
                className={servicesOpen ? 'open' : ''}
                onMouseEnter={() => setServicesOpen(true)}
                onMouseLeave={() => setServicesOpen(false)}
              >
                <button
                  className="has-dropdown"
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    setServicesOpen((v) => !v)
                  }}
                >
                  Services <span className="dropdown-icon">▾</span>
                </button>
                <div className="dropdown">
                  <Link href="/your-first-ai-hire">Your First AI Hire</Link>
                  <Link href="/caio-leadership">CAIO Leadership</Link>
                  <Link href="/global-staffing">Global Staffing</Link>
                  <Link href="/training-and-certification">Training &amp; Certification</Link>
                </div>
              </li>

              <li><Link href="/ai-programs">AI Programs</Link></li>
              <li><Link href="/saigon-private">Retreat</Link></li>
              <li
                className={resourcesOpen ? 'open' : ''}
                onMouseEnter={() => setResourcesOpen(true)}
                onMouseLeave={() => setResourcesOpen(false)}
              >
                <button
                  className="has-dropdown"
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    setResourcesOpen((v) => !v)
                  }}
                >
                  Resources <span className="dropdown-icon">▾</span>
                </button>
                <div className="dropdown">
                  <Link href="/8-edges-app">8 Edges Operating System</Link>
                  <Link href="/blog">Blog</Link>
                  <Link href="/workflows">Workflows</Link>
                </div>
              </li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/careers">Careers</Link></li>
            </ul>

            <Link href={ctaHref} className="btn btn-primary nav-cta">
              {ctaLabel}
            </Link>

            <button
              className="nav-hamburger"
              id="hamburger"
              aria-label="Menu"
              onClick={toggleMenu}
            >
              <span style={hamburgerStyle(0)} />
              <span style={hamburgerStyle(1)} />
              <span style={hamburgerStyle(2)} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} id="mobileMenu">
        <MobileAccordion label="Services" id="mobileServicesAccordion">
          <Link href="/your-first-ai-hire" onClick={() => setMenuOpen(false)}>Your First AI Hire</Link>
          <Link href="/caio-leadership" onClick={() => setMenuOpen(false)}>CAIO Leadership</Link>
          <Link href="/global-staffing" onClick={() => setMenuOpen(false)}>Global Staffing</Link>
          <Link href="/training-and-certification" onClick={() => setMenuOpen(false)}>Training &amp; Certification</Link>
        </MobileAccordion>

        <Link href="/ai-programs" onClick={() => setMenuOpen(false)}>AI Programs</Link>
        <Link href="/saigon-private" onClick={() => setMenuOpen(false)}>Retreat</Link>
        <MobileAccordion label="Resources" id="mobileResourcesAccordion">
          <Link href="/8-edges-app" onClick={() => setMenuOpen(false)}>8 Edges Operating System</Link>
          <Link href="/blog" onClick={() => setMenuOpen(false)}>Blog</Link>
          <Link href="/workflows" onClick={() => setMenuOpen(false)}>Workflows</Link>
        </MobileAccordion>
        <Link href="/about" onClick={() => setMenuOpen(false)}>About</Link>
        <Link href="/careers" onClick={() => setMenuOpen(false)}>Careers</Link>
        <Link href={ctaHref} className="btn btn-primary" onClick={() => setMenuOpen(false)}>
          {ctaLabel}
        </Link>
      </div>
    </>
  )
}

function MobileAccordion({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`mobile-accordion${open ? ' open' : ''}`} id={id}>
      <button
        className="mobile-accordion-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {label} <span className="mobile-accordion-icon">▾</span>
      </button>
      <div className="mobile-accordion-panel">{children}</div>
    </div>
  )
}
