import { useState } from "react";
import { cn } from "@/lib/utils";
import { TaskList } from "./TaskList";

export function TasksPage() {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex animate-fade-up items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Tasks</h1>
          <p className="mt-1 text-sm text-ink-400">{scope === "mine" ? "Assigned to you." : "Across the matters you can open."}</p>
        </div>
        <div className="inline-flex rounded-xl bg-ink-50 p-1">
          {(["mine", "all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={cn("rounded-lg px-3 py-1.5 text-sm transition-all", scope === s ? "bg-white font-medium text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-700")}>
              {s === "mine" ? "Mine" : "Everyone"}
            </button>
          ))}
        </div>
      </div>
      <TaskList key={scope} scope={scope} />
    </div>
  );
}
