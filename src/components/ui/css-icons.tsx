import * as React from "react";

import { cn } from "@/lib/utils";

type CssIconProps = React.HTMLAttributes<HTMLSpanElement> & {
  size?: number;
};

function IconBox({ className, children, size: _size, ...props }: CssIconProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center text-current",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Chevron({
  className,
  direction,
  ...props
}: CssIconProps & { direction: "down" | "left" | "right" | "up" }) {
  const rotation =
    direction === "down"
      ? "rotate-45"
      : direction === "up"
        ? "rotate-[225deg]"
        : direction === "left"
          ? "rotate-[135deg]"
          : "rotate-[-45deg]";

  return (
    <IconBox className={className} {...props}>
      <span className={cn("block size-2 border-b-2 border-r-2 border-current", rotation)} />
    </IconBox>
  );
}

function Arrow({ className, direction, ...props }: CssIconProps & { direction: "left" | "right" }) {
  const arrowhead = direction === "left" ? "rotate-[135deg]" : "rotate-[-45deg]";
  const offset = direction === "left" ? "left-1" : "right-1";

  return (
    <IconBox className={className} {...props}>
      <span className="block h-0.5 w-3 rounded-full bg-current" />
      <span
        className={cn("absolute size-1.5 border-b-2 border-r-2 border-current", offset, arrowhead)}
      />
    </IconBox>
  );
}

export function ArrowLeft(props: CssIconProps) {
  return <Arrow direction="left" {...props} />;
}

export function ArrowRight(props: CssIconProps) {
  return <Arrow direction="right" {...props} />;
}

export function Check({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="-mt-0.5 block h-2.5 w-1.5 rotate-45 border-b-2 border-r-2 border-current" />
    </IconBox>
  );
}

export function ChevronDown(props: CssIconProps) {
  return <Chevron direction="down" {...props} />;
}

export function ChevronUp(props: CssIconProps) {
  return <Chevron direction="up" {...props} />;
}

export function ChevronLeft(props: CssIconProps) {
  return <Chevron direction="left" {...props} />;
}

export function ChevronRight(props: CssIconProps) {
  return <Chevron direction="right" {...props} />;
}

export const ChevronDownIcon = ChevronDown;
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRightIcon = ChevronRight;

export function Circle({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="block size-2 rounded-full border border-current bg-current" />
    </IconBox>
  );
}

export function GripVertical({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="grid grid-cols-2 gap-0.5">
        {[0, 1, 2, 3, 4, 5].map((dot) => (
          <span key={dot} className="block size-0.5 rounded-full bg-current" />
        ))}
      </span>
    </IconBox>
  );
}

export function Minus({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="block h-0.5 w-3 rounded-full bg-current" />
    </IconBox>
  );
}

export function MoreHorizontal({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="block size-1 rounded-full bg-current" />
        ))}
      </span>
    </IconBox>
  );
}

export function PanelLeft({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={cn("size-4", className)} {...props}>
      <span className="absolute inset-0 rounded-sm border border-current" />
      <span className="absolute left-1 top-1 h-2 w-px rounded-full bg-current" />
    </IconBox>
  );
}

export function Search({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="block size-2.5 rounded-full border-2 border-current" />
      <span className="absolute bottom-0.5 right-0.5 h-1.5 w-0.5 -rotate-45 rounded-full bg-current" />
    </IconBox>
  );
}

export function X({ className, ...props }: CssIconProps) {
  return (
    <IconBox className={className} {...props}>
      <span className="absolute block h-0.5 w-3 rotate-45 rounded-full bg-current" />
      <span className="absolute block h-0.5 w-3 -rotate-45 rounded-full bg-current" />
    </IconBox>
  );
}
