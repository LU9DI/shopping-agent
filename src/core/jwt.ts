import jwt from "jsonwebtoken";
import crypto from "node:crypto";

export type AuthPayload = { sub: string; role?: string };

const secrets = () =>
  [process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS]
    .filter((v): v is string => !!v?.trim())
    .map((v) => v.trim());

export function requireJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return secret;
}

export function signAccessToken(payload: AuthPayload) {
  return jwt.sign(payload, requireJwtSecret(), { expiresIn: 604800 });
}

export function verifyAccessToken(token: string) {
  // Fail closed on invalid current configuration before parsing attacker-controlled tokens.
  requireJwtSecret();

  let last: unknown;
  for (const secret of secrets()) {
    if (secret.length < 32) continue;
    try {
      return jwt.verify(token, secret) as jwt.JwtPayload & AuthPayload;
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("invalid token");
}

export function generateJwtSecret() {
  return crypto.randomBytes(48).toString("base64url");
}
