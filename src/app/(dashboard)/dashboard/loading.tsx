export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-hs-line rounded-md" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-24 bg-white border border-hs-line rounded-xl" />)}
      </div>
      <div className="h-64 bg-white border border-hs-line rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-56 bg-white border border-hs-line rounded-xl" />)}
      </div>
    </div>
  )
}
