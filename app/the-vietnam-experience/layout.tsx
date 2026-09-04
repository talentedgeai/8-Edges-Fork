import '@/app/styles/utilities.css'

// Loads the shared .u-* layout utilities after globals.css for the
// experience components (sliders, placeholder images).
export default function VietnamExperienceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
