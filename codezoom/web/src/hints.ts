// What the Focus box's Hint parts and member tags list when hovered.

import type { BypassedInterface, FocusDuplicate, TypeSwitch } from "../../src/shared/types";

/** The Focus's Duplicates (ADR 0009), Bypassed interfaces and Type switches (ADR 0011) to list, any of them. */
export interface FocusHints {
  duplicates?: FocusDuplicate[];
  bypassed?: BypassedInterface[];
  switches?: TypeSwitch[];
}
