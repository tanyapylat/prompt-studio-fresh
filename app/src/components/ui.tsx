import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  accent: "bg-slate-800 text-white border-slate-800",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/20",
  secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm shadow-slate-900/5",
  ghost: "hover:bg-slate-100 text-slate-700",
  danger: "bg-rose-600 hover:bg-rose-500 text-white",
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Standard frame for every full-page section. Fluid so large monitors are actually used, with a
 * generous cap so tables don't stretch into unreadable rows on ultrawide displays.
 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("mx-auto w-full max-w-[1600px] px-6 py-8 2xl:px-8", className)}>{children}</div>
  );
}

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx("rounded-2xl border border-slate-200 bg-white", className)}
    >
      {children}
    </div>
  );
}

export function IconButton({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </button>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-sky-500",
        props.className,
      )}
    />
  );
}

type AutoGrowTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number;
  maxHeight?: number;
  collapsedMaxHeight?: number;
};

export function AutoGrowTextArea({
  minHeight = 58,
  maxHeight = 220,
  collapsedMaxHeight,
  onFocus,
  onBlur,
  className,
  ...props
}: AutoGrowTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const activeMaxHeight = !focused && collapsedMaxHeight ? collapsedMaxHeight : maxHeight;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, activeMaxHeight))}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > activeMaxHeight && (focused || collapsedMaxHeight === undefined) ? "auto" : "hidden";
  });

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      className={clsx(
        "w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-[height] focus:border-sky-500",
        className,
      )}
    />
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-sky-500",
        props.className,
      )}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-12 backdrop-blur-sm">
      <div
        className={clsx(
          "w-full rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10",
          widths[width],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Avatar({ name, initials, size = "sm" }: { name: string; initials: string; size?: "sm" | "md" }) {
  return (
    <span
      title={name}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-700",
        size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs",
      )}
    >
      {initials}
    </span>
  );
}
