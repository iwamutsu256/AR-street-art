type SpinnerSize = "sm" | "md" | "lg";
type SpinnerTone = "neutral" | "primary" | "inverse" | "success";

type SpinnerProps = {
  className?: string;
  label?: string;
  size?: SpinnerSize;
  tone?: SpinnerTone;
};

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "size-5",
  md: "size-8",
  lg: "size-11 border-[3px]",
};

const toneClasses: Record<SpinnerTone, string> = {
  neutral: "border-[rgba(108,98,85,0.22)] border-t-fg",
  primary: "border-[rgba(182,76,45,0.24)] border-t-primary",
  inverse: "border-[rgba(255,248,244,0.3)] border-t-fg-inverse",
  success: "border-[rgba(22,101,52,0.3)] border-t-success",
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
      className={joinClassNames("inline-grid justify-items-center gap-3", className)}
      role={label ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className={joinClassNames(
          "inline-block animate-spin rounded-full border-2 border-solid",
          sizeClasses[size],
          toneClasses[tone],
        )}
      />
      {label ? (
        <p className="m-0 text-center text-sm font-bold leading-6 text-inherit">
          {label}
        </p>
      ) : null}
    </div>
  );
}
