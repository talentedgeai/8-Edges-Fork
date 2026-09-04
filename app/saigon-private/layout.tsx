import '@/app/styles/utilities.css'

// Loads the shared .u-* layout utilities after globals.css so the reserve
// form can use them instead of inline styles.
export default function SaigonPrivateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
