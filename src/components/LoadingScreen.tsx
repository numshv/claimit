export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#fbf6ef] flex flex-col items-center justify-center z-50 px-10 pb-[90px]">
      <div className="relative flex items-center justify-center w-[74px] h-[74px] mb-[38px]">
        <div className="absolute inset-0 bg-[#d6ecee] opacity-50 rounded-full" />
        <div className="w-[30px] h-[30px] border-[3px] border-[#11808a] rounded-full animate-spin border-t-transparent" />
      </div>
      <p className="text-[21px] font-semibold text-[#2b2620] text-center leading-[29.4px] max-w-[180px] mb-[14px]">
        ClaimIt AI is analyzing your situation…
      </p>
      <p className="text-[15px] text-[#7a6f62] text-center leading-[23.25px] max-w-[218px]">
        Matching your situation with available assistance programs
      </p>
    </div>
  );
}
