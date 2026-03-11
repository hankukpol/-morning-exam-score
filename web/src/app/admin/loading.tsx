export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-8 p-6 sm:p-8 lg:p-10">
      <div className="space-y-3">
        <div className="h-7 w-28 rounded-full bg-forest/10" />
        <div className="h-10 w-64 rounded-2xl bg-ink/10" />
        <div className="h-5 w-full max-w-2xl rounded-2xl bg-ink/10" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-ink/10 bg-white p-5">
            <div className="h-4 w-24 rounded-full bg-ink/10" />
            <div className="mt-4 h-10 w-20 rounded-2xl bg-ink/10" />
            <div className="mt-3 h-4 w-full rounded-2xl bg-ink/10" />
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="h-6 w-40 rounded-2xl bg-ink/10" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-ink/10 px-4 py-4">
              <div className="h-4 w-28 rounded-full bg-ink/10" />
              <div className="mt-2 h-4 w-full rounded-full bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
