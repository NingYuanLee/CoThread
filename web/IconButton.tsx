import React from "react";
import { RefreshCw } from "lucide-react";

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: React.ReactNode;
};

/** Shared compact control for page tools and modal title bars. */
export function IconButton({
  label,
  icon,
  className = "",
  title,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`overlay-icon-button ${className}`.trim()}
      aria-label={props["aria-label"] ?? label}
      title={title ?? label}
    >
      {icon}
    </button>
  );
}

export function RefreshButton({
  label = "刷新",
  pending = false,
  ...props
}: Omit<IconButtonProps, "icon" | "label"> & { label?: string; pending?: boolean }) {
  return (
    <IconButton
      {...props}
      label={label}
      aria-busy={pending || undefined}
      icon={
        <RefreshCw
          size={16}
          strokeWidth={1.8}
          className={pending ? "overlay-icon-spinning" : undefined}
          aria-hidden="true"
        />
      }
    />
  );
}
