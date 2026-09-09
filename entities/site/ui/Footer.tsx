import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-top">
          <div>
            <div className="footer-logo">
              <Image src="/logo-white.png" alt="Edge8" width={100} height={32} className="site-logo-32" />
            </div>
            <p className="footer-desc">
              AI Leadership, Automation &amp; Global Talent Solutions. Helping organizations become Tech-Forward and achieve 8x efficiency.
            </p>
            <div className="footer-social">
              <a href="https://www.linkedin.com/company/edge8ai/" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                LinkedIn
              </a>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Services</div>
            <div className="footer-links">
              <Link href="/your-first-ai-hire">Your First AI Hire</Link>
              <Link href="/caio-leadership">CAIO Leadership</Link>
              <Link href="/global-staffing">Global Staffing</Link>
              <Link href="/training-and-certification">Training &amp; Certification</Link>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Case Studies</div>
            <div className="footer-links">
              <Link href="/ai-programs">AI Programs</Link>
            </div>
            <div className="footer-col-title footer-col-title--gap">Company</div>
            <div className="footer-links">
              <Link href="/about">About</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/workflows">Workflows</Link>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Contact</div>
            <div className="footer-contact">
              <div className="footer-contact-item">
                <div className="footer-contact-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <a href="mailto:dave@edge8.ai">dave@edge8.ai</a>
              </div>
              <div className="footer-contact-item">
                <div className="footer-contact-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.16a16 16 0 006.93 6.93l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div>
                  <div>+84 90 995 8581</div>
                  <div>+1 206 395 8872</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copy">© 2026 by Edge8. All rights reserved.</div>
          <div className="footer-bottom-links">
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/eula">Terms of Service</Link>
            <a href="/llms.txt" title="Site map for LLMs and AI search engines">llms.txt</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
