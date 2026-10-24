import Image from "next/image";

export function BrandIdentity({ subtitle = "Operaciones", priority = false }: { subtitle?: string; priority?: boolean }) {
  return <div className="brand">
    <span className="brand-mark brand-logo-mark" aria-hidden="true">
      <Image
        className="brand-logo-image"
        src="/brand/lk-logo.jpeg"
        alt=""
        width={64}
        height={64}
        sizes="44px"
        priority={priority}
      />
    </span>
    <span className="brand-copy">
      <strong>LK INNOVACION</strong>
      <span>{subtitle}</span>
    </span>
  </div>;
}
