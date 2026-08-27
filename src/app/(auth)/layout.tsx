import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hs-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logos/hohenstein-farbe.png" alt="hohenstein consulting solutions" width={480} height={165}
            priority className="h-12 w-auto mx-auto object-contain" />
          <p className="font-display font-semibold text-hs-text mt-4 text-lg">Hohenstein Suite</p>
          <p className="text-hs-text-2 text-[13px] mt-0.5">CRM · E&A-Rechnung · Aufgaben · Demo</p>
        </div>
        {children}
        <p className="text-center font-mono text-[10.5px] text-hs-tertiary mt-8 flex items-center justify-center gap-1.5">
          powered by
          <Image src="/logos/icp-lockup-inline-navy.svg" alt="ICP Solutions" width={2000} height={432} className="h-[18px] w-auto object-contain" />
        </p>
      </div>
    </div>
  )
}
