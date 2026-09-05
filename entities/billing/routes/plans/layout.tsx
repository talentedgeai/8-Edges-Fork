// The stylesheets this route needs — including the entity's own plans.css —
// are imported by the thin app/plans layout, in the order the cascade expects:
// two of them live under app/, and an entity never reaches into app/ (design
// §3 rule 3). What belongs to billing is the layout itself.
export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
