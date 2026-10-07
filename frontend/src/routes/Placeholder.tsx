export function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </div>
  );
}
