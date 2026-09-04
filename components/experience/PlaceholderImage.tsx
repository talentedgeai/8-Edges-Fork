import Image from "next/image";

// A framed image slot for the experience sub-pages. When `src` is given it
// renders the real photo (cover-fit, with a frame + soft navy scrim so bright
// daylight shots sit on the dark theme). Without `src` it falls back to a
// labelled placeholder where a photo will go.

export function PlaceholderImage({
  label,
  src,
  alt,
  aspect = "16 / 9",
  maxWidth,
  className,
  style,
}: {
  label: string;
  /** When provided, renders this image instead of the placeholder. */
  src?: string;
  /** Alt text for the real image. Falls back to `label` (minus "Photo: "). */
  alt?: string;
  /** CSS aspect-ratio value, e.g. "16 / 9" or "4 / 5". */
  aspect?: string;
  /** Optional max width, e.g. "28rem". */
  maxWidth?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls = [src ? "xp-ph xp-ph--photo" : "xp-ph", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ aspectRatio: aspect, maxWidth, ...style }}>
      {src ? (
        <Image
          src={src}
          alt={alt ?? label.replace(/^Photo:\s*/i, "")}
          fill
          sizes="(max-width: 800px) 100vw, 720px"
          style={{ objectFit: "cover" }}
        />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
