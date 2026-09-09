export type Status = "online" | "offline" | "recently" | "week" | "month" | "empty";

// One poll of one user. t = poll time, wo = exact last-seen (offline), ex = online-until (online).
export type Sample = {
  t: number;
  s: Status;
  wo: number | null;
  ex: number | null;
  src?: string;
};

// A derived online interval. `end === null` means currently online.
export type Session = {
  id: string;
  start: number;
  startExact: boolean;
  end: number | null;
  endExact: boolean;
};

// A stretch with no polls (collector was down / GitHub delayed the job).
export type Gap = { from: number; to: number };

export type TargetMeta = {
  id: string;
  username?: string;
  name: string;
  note?: string;
  addedAt?: string;
};
