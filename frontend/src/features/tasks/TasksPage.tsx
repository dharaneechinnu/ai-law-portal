import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { PageHero, Tabs } from "@/components/ui/page";
import { api } from "@/services/api";
import type { Task } from "@/types";
import { TaskList } from "./TaskList";

export function TasksPage() {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const open = useQuery({ queryKey: ["tasks", "", scope, "open"], queryFn: () => api<Task[]>(`/tasks?status=open&scope=${scope}`) });
  const done = useQuery({ queryKey: ["tasks", "", scope, "done"], queryFn: () => api<Task[]>(`/tasks?status=done&scope=${scope}`) });
  const nOpen = open.data?.length ?? 0;
  const nDone = done.data?.length ?? 0;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const overdue = (open.data ?? []).filter((t) => t.due_at && new Date(t.due_at) < start).length;
  const pct = nOpen + nDone ? Math.round((nDone / (nOpen + nDone)) * 100) : 0;
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={ListChecks} eyebrow="Work" title="Tasks"
        sub={`${nOpen} open${overdue ? `, ${overdue} overdue` : ""}. ${scope === "mine" ? "Assigned to you." : "Across the matters you can open."}`}>
        <div className="mt-4 w-full max-w-md">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-night-200"><span>{nDone} done</span><span>{pct}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-snow/10">
            <div key={`${scope}${pct}`} className="h-full origin-left animate-grow rounded-full bg-gradient-to-r from-brass-300 to-brass-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </PageHero>
      <Tabs label="Whose tasks" value={scope} onChange={setScope} items={[["mine", "Mine"], ["all", "Everyone"]]} />
      <div className="rounded-[20px] border border-ink-100 bg-white p-4 md:p-5">
        <TaskList key={scope} scope={scope} />
      </div>
    </div>
  );
}
