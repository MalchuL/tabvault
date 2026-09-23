import type { ServerCapability } from "@/domain/server/synchronization";

type CapabilityIssueProps = {
  capability?: ServerCapability | null;
};

/**
 * Show a blocked server capability with the operator-facing fix.
 *
 * @param capability - Unavailable capability from `/api/v1/capabilities`.
 */
export function CapabilityIssue({ capability }: CapabilityIssueProps) {
  if (!capability || capability.available || !capability.error) return null;
  return (
    <div
      role="status"
      className="mt-3 border-l-2 border-[#c95f46] bg-[#fff6f2] px-2.5 py-2"
    >
      <p className="text-[12px] leading-5 text-[#8a4a38]">{capability.error}</p>
      {capability.fix && (
        <p className="mt-1.5 text-[11px] leading-5 text-[#6f675d]">
          {capability.fix}
        </p>
      )}
    </div>
  );
}
