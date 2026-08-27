export default function CRMLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-hs-line rounded-lg" />
        <div className="h-4 w-64 bg-hs-line/70 rounded" />
      </div>
      <div className="h-12 bg-white border border-hs-line rounded-xl" />
      <div className="bg-white border border-hs-line rounded-xl overflow-hidden">
        <div className="h-10 bg-hs-bg border-b border-hs-line" />
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-5 bg-hs-line/60 rounded" style={{ width: `${70 - i * 6}%` }} />)}
        </div>
      </div>
    </div>
  )
}
