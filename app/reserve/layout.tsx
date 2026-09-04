import Link from "next/link";
import '@/app/styles/utilities.css'
import Image from "next/image";

export default function ReserveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-reserve-shell">
      <header className="site-reserve-header">
        <Link href="/" className="site-reserve-logo" aria-label="Edge8 home">
          <Image src="/logo.png" alt="Edge8" width={110} height={32} className="site-logo-30" priority />
        </Link>
        <Link href="/saigon-private" className="site-reserve-back">
          <span aria-hidden>←</span> Back to retreat details
        </Link>
      </header>
      {children}
    </div>
  );
}
