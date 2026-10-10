// Types and helpers for the evaluation quick-login. The accounts come from the API, which only answers
// when DEMO_LOGIN=true; nothing here is hardcoded, so no credential is ever shipped in the client bundle.
import { api } from './api';

export interface DemoAccount { email: string; name: string; role: 'AUTHOR' | 'ADMIN'; description: string; password: string }
export interface DemoAccountsResponse { note: string; accounts: DemoAccount[] }

/** null when evaluation mode is off (the API answers 404) or unreachable: the login page then looks normal. */
export async function fetchDemoAccounts(): Promise<DemoAccountsResponse | null> {
  try {
    const r = await api<DemoAccountsResponse>('/auth/demo-accounts');
    return r.accounts.length > 0 ? r : null;
  } catch {
    return null; // 404 (disabled), rate limited, or offline: behave like a normal login page
  }
}

export const ROLE_LABEL: Record<DemoAccount['role'], string> = { AUTHOR: 'Author', ADMIN: 'Admin / Support staff' };
