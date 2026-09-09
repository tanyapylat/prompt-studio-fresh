import type { TextareaHTMLAttributes } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number;
  maxHeight?: number;
  collapsedMaxHeight?: number;
};

export function AutoGrowTextarea({
  minHeight = 58,
  maxHeight = 220,
  collapsedMaxHeight,
  onFocus,
  onBlur,
  className,
  ...props
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Deliberately scoped to what actually affects this textarea's own size — with no dependency
  // array, this would force a synchronous height-reset-then-remeasure on *every* AutoGrowTextarea
  // on the page on every unrelated re-render anywhere in the tree (e.g. an accordion elsewhere
  // toggling open/closed), which is expensive and was observable as the whole page's scroll
  // position jumping around whenever there were several of these mounted at once (a long Prompt's
  // messages, most commonly).
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const activeMaxHeight = !focused && collapsedMaxHeight ? collapsedMaxHeight : maxHeight;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, activeMaxHeight))}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > activeMaxHeight && (focused || collapsedMaxHeight === undefined) ? "auto" : "hidden";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, focused, minHeight, maxHeight, collapsedMaxHeight]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      data-slot="auto-grow-textarea"
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      className={cn(
        "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-[height] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
    />
  );
}
