type SpinnerSize = "sm" | "md" | "lg";
type SpinnerTone = "neutral" | "primary" | "inverse" | "success";

type SpinnerProps = {
  className?: string;
  label?: string;
  size?: SpinnerSize;
  tone?: SpinnerTone;
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function Spinner({
  className,
  label,
  size = "md",
  tone = "primary",
}: SpinnerProps) {
  return (
    <div
      aria-live={label ? "polite" : undefined}
      className={joinClassNames("spinner-shell", className)}
      role={label ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className={joinClassNames(
          "spinner",
          `spinner--${size}`,
          `spinner--${tone}`,
        )}
      />
      {label ? <p className="spinner-label">{label}</p> : null}
    </div>
  );
}
