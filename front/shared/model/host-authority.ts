export const HOST_SECURITY_PURGE_CODES = [
  "HOST_AUTHORITY_REVOKED",
  "MEMBERSHIP_SUSPENDED",
  "CROSS_CLUB_SCOPE",
] as const;

export type HostSecurityPurgeCode = (typeof HOST_SECURITY_PURGE_CODES)[number];

export function isHostSecurityPurgeCode(code: string): code is HostSecurityPurgeCode {
  return (HOST_SECURITY_PURGE_CODES as readonly string[]).includes(code);
}
