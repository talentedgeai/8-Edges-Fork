// Brand palette for renderers that cannot read CSS custom properties:
// Open Graph images (Satori), QR codes, and HTML email sent to external
// inboxes. Everything rendered in the browser must use the tokens in
// app/styles/tokens.css instead — this file mirrors §1 of that file and
// must be kept in sync with it. `npm run check:tokens` allows raw colours
// only there and here.
export const PALETTE = {
  dark: "#101014",
  blue: "#287BE8",
  blueHover: "#1D6AD4",
  blueBright: "#3B8CF5",
  mint: "#6FF2C1",
  mintBright: "#2EDBBB",
  white: "#FFFFFF",
  canvas: "#F5F6F8",
  line: "#E6E6E6",
  inkBody: "#797c82",
  muted: "#9CA3AF",
  greyMid: "#6B7280",
  violet: "#7A5CFA",
} as const;
