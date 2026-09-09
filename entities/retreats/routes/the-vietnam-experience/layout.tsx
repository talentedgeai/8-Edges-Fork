// The route's stylesheets are imported by the mount in app/, not here: the
// utilities-scope check resolves reachable sheets from the layout chain under
// app/, and the cascade order against app/styles/* is part of the page.
export default function TheVietnamExperienceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
