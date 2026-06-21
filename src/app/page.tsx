import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-b from-[#edf5f4] to-background flex flex-col items-center justify-between px-7 pt-0 pb-10">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
        <div className="bg-[#11808a] w-[60px] h-[60px] rounded-[22px] flex items-center justify-center mb-2">
          <div className="w-[31px] h-[31px] flex items-center justify-center rotate-45">
            <div className="w-[22px] h-[22px] border-[3px] border-white rounded-full" />
          </div>
        </div>
        <h1 className="text-[42px] font-bold text-[#2b2620] tracking-[-0.84px] leading-none">
          ClaimIt
        </h1>
        <p className="text-[18px] text-[#7a6f62] leading-[27px] max-w-[235px]">
          Tell us your situation, we'll find the right support
        </p>
      </div>

      <div className="w-full flex flex-col items-center gap-[22px]">
        <Link
          href="/chat"
          className="w-full bg-[#11808a] text-white text-[17px] font-semibold rounded-[18px] py-[17px] text-center block hover:bg-[#0e6e76] active:bg-[#0c5f66] transition-colors"
        >
          Get Started
        </Link>
        <p className="text-[13px] text-[#a89c8c]">
          Free · No data stored
        </p>
      </div>
    </div>
  );
}