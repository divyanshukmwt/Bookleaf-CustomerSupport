// What the draft's validation status does and does not tell an admin. Pure so it can be unit-tested.
// A generated draft is never described as "verified": at best it "passed automated checks".
import type { Draft } from './types';

export type VerificationLevel = 'NONE' | 'WITHHELD' | 'FLAGGED' | 'PASSED' | 'NOT_CHECKED';

export interface Verification {
  level: VerificationLevel;
  label: string;
  detail: string;
  warnings: string[];
}

export const CHECKS_SCOPE =
  'Automated checks compare amounts, dates, ISBNs and copy counts in the draft with the database facts, and flag unknown timelines or a missing next step. They do not judge tone or completeness, so read the draft against the facts before sending.';

export function verificationFor(draft: Draft | null): Verification {
  if (!draft || draft.status !== 'COMPLETED') {
    return { level: 'NONE', label: 'No draft to check', detail: 'Nothing has been generated yet.', warnings: [] };
  }
  const warnings = (draft.validationIssues ?? []).map((i) => i.message);
  switch (draft.validationStatus) {
    case 'REJECTED':
      return { level: 'WITHHELD', label: 'Withheld: contradicts the database', detail: 'The draft conflicted with the database facts and is not shown.', warnings };
    case 'FLAGGED':
      return { level: 'FLAGGED', label: 'Needs review', detail: 'Automated checks raised warnings. Review them before sending.', warnings };
    case 'PASSED':
      return { level: 'PASSED', label: 'Passed automated checks', detail: 'This is not a guarantee that the reply is correct.', warnings };
    default:
      // e.g. an "insufficient information" placeholder: nothing was validated
      return { level: 'NOT_CHECKED', label: 'Not checked', detail: 'No reply text was validated for this draft.', warnings };
  }
}
