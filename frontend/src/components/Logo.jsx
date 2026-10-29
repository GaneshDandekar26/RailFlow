export default function Logo({ className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#2F6BFF" />
        <path d="M10 26 L14 6 M22 26 L18 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M11.4 20h9.2M12.6 14h6.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[26px] font-semibold leading-none tracking-tight text-ink">
        RailFlow
      </span>
    </div>
  );
}
