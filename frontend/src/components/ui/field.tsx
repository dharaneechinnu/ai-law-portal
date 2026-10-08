import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  hint?: ReactNode;
}

/** Labelled input with an optional leading icon; password inputs get a show/hide toggle. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, icon, hint, type = "text", className, id, ...props }, ref) => {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputId = id ?? `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-800">{label}</label>
      <div className="group relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-300 transition-colors group-focus-within:text-brass-600">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && show ? "text" : type}
          className={cn(
            "h-11 w-full rounded-xl border border-ink-100 bg-white px-3 text-sm text-ink-900 shadow-sm outline-none transition",
            "placeholder:text-ink-300 hover:border-ink-200 focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25",
            "disabled:bg-ink-50 disabled:text-ink-400",
            icon && "pl-10",
            isPassword && "pr-11",
          )}
          {...props}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-2 my-auto grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-ink-50 hover:text-ink-600">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {hint && <div className="text-xs text-ink-400">{hint}</div>}
    </div>
  );
});
Field.displayName = "Field";
