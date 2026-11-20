type AuthResult<T> = {
  data: { user: T | null };
  error: { name: string; message: string } | null;
};

export function getOptionalAuthUser<T>(result: AuthResult<T>, context: string): T | null {
  if (result.error?.name === "AuthSessionMissingError") return null;
  if (result.error) throw new Error(`Could not verify the signed-in account for ${context}: ${result.error.message}`);
  return result.data.user;
}
