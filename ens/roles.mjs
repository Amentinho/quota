// Role bit constants, copied from verified on-chain source, not guessed:
// RegistryRolesLib.sol (PermissionedRegistry) and PermissionedResolverLib.sol
// (PermissionedResolverImpl), both on Sepolia. See CLAUDE.md for the
// addresses these were pulled from and how.

export const REGISTRY_ROLES = {
  REGISTRAR: 1n << 0n,
  REGISTRAR_ADMIN: (1n << 0n) << 128n,
  SET_PARENT: 1n << 8n,
  SET_PARENT_ADMIN: (1n << 8n) << 128n,
  UNREGISTER: 1n << 12n,
  UNREGISTER_ADMIN: (1n << 12n) << 128n,
  RENEW: 1n << 16n,
  RENEW_ADMIN: (1n << 16n) << 128n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_SUBREGISTRY_ADMIN: (1n << 20n) << 128n,
  SET_RESOLVER: 1n << 24n,
  SET_RESOLVER_ADMIN: (1n << 24n) << 128n,
};

export const RESOLVER_ROLES = {
  SET_ADDR: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_TEXT_ADMIN: (1n << 4n) << 128n,
};

// QUOTA-specific: not part of RegistryRolesLib, deliberately placed on an
// unused nybble slot (10) of PermissionedRegistry's role space. EAC roles
// are generic -- any contract using EnhancedAccessControl can define its
// own bits in an unused slot, which is exactly what a "MINTER" role scoped
// to a season name needs. QuotaAnchor checks this directly against the
// season's registry.
export const MINTER_ROLE = 1n << 40n;
export const MINTER_ROLE_ADMIN = MINTER_ROLE << 128n;

export function bitmap(...roles) {
  return roles.reduce((acc, r) => acc | r, 0n);
}
