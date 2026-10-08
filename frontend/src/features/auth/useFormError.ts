import { useState } from "react";
import { errorMessage } from "@/services/api";

/** Error message plus an attempt counter that drives the shake animation. */
export function useFormError() {
  const [state, setState] = useState({ message: "", attempt: 0 });
  return {
    ...state,
    fail: (e: unknown) => setState((s) => ({ message: typeof e === "string" ? e : errorMessage(e), attempt: s.attempt + 1 })),
    clear: () => setState((s) => ({ ...s, message: "" })),
  };
}
