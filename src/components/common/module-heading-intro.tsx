"use client";

type ModuleHeadingIntroProps = {
  title: string;
  eyebrow: string;
  description: string;
  color?: string;
};

export function ModuleHeadingIntro({ title }: ModuleHeadingIntroProps) {
  return (
    <div className="module-heading-intro">
      <div className="module-title-row">
        <h1>{title}</h1>
      </div>
    </div>
  );
}
