export function AnimatedBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <div className="breathe-blob absolute -left-[10%] top-[-15%] h-[60vw] w-[60vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(37,99,235,0.55), rgba(37,99,235,0) 65%)",
          filter: "blur(80px)",
          animationDelay: "0s",
        }}
      />
      <div className="breathe-blob absolute right-[-15%] top-[20%] h-[55vw] w-[55vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.45), rgba(59,130,246,0) 70%)",
          filter: "blur(90px)",
          animationDelay: "-3s",
        }}
      />
      <div className="breathe-blob absolute left-[15%] bottom-[-20%] h-[70vw] w-[70vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(29,78,216,0.5), rgba(29,78,216,0) 65%)",
          filter: "blur(100px)",
          animationDelay: "-6s",
        }}
      />
      <div className="breathe-blob absolute right-[20%] bottom-[10%] h-[40vw] w-[40vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.35), rgba(96,165,250,0) 70%)",
          filter: "blur(70px)",
          animationDelay: "-9s",
        }}
      />
    </div>
  );
}
