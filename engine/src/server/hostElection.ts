import { Member } from "../states/types"
/**
 * Elect best host based on priority:
 * 1. Higher RAM
 * 2. Higher CPU cores
 * 3. Higher Battery
 * 4. Earlier joinOrder
 * 5. deviceId (final deterministic tie-breaker)
 */
export function electHost(members: Member[]): string {
  if (members.length === 0) {
    throw new Error("NO_MEMBERS");
  }

  const sorted = [...members].sort((a, b) => {

    // 1️⃣ Higher RAM wins
    const ramA = a.ramMB ?? 0;
    const ramB = b.ramMB ?? 0;
    if (ramA !== ramB) {
      return ramB - ramA;
    }

    // 2️⃣ Higher CPU cores wins
    const cpuA = a.cpuCores ?? 0;
    const cpuB = b.cpuCores ?? 0;
    if (cpuA !== cpuB) {
      return cpuB - cpuA;
    }

    // 3️⃣ Higher battery level wins
    const batteryA = a.batteryLevel ?? 0;
    const batteryB = b.batteryLevel ?? 0;
    if (batteryA !== batteryB) {
      return batteryB - batteryA;
    }

    // 4️⃣ Earlier joinOrder wins
    if (a.joinOrder !== b.joinOrder) {
      return a.joinOrder - b.joinOrder;
    }

    // 5️⃣ Final deterministic tie-breaker
    return a.deviceId.localeCompare(b.deviceId);
  });

  return sorted[0].deviceId;
}