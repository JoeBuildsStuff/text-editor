import { SignalHigh } from "lucide-react";

export function LowMediumHighIcon({
  className,
  level,
}: {
  className?: string;
  level?: 1 | 2 | 3;
}) {
  return <SignalHigh className={className} data-level={level} />;
}
