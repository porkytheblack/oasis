/**
 * Semantic Version Utilities
 *
 * Provides parsing, comparison, and validation functions for semantic versions.
 * Follows the Semantic Versioning 2.0.0 specification: https://semver.org/
 */

/**
 * Represents a parsed semantic version
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
}

/**
 * Regular expression for parsing semantic versions
 * Captures: major, minor, patch, prerelease (optional), build metadata (optional)
 */
const SEMVER_REGEX =
  /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

/**
 * Parses a version string into its semantic version components.
 *
 * @param version - The version string to parse (e.g., "1.2.3", "1.0.0-beta.1")
 * @returns The parsed SemVer object, or null if the version is invalid
 *
 * @example
 * parseSemver("1.2.3") // { major: 1, minor: 2, patch: 3, prerelease: [], build: [] }
 * parseSemver("2.0.0-alpha.1") // { major: 2, minor: 0, patch: 0, prerelease: ["alpha", "1"], build: [] }
 * parseSemver("invalid") // null
 */
export function parseSemver(version: string): SemVer | null {
  const match = SEMVER_REGEX.exec(version.trim());
  if (!match) {
    return null;
  }

  const [, majorStr, minorStr, patchStr, prereleaseStr, buildStr] = match;

  // These are guaranteed to exist by the regex match
  const major = parseInt(majorStr!, 10);
  const minor = parseInt(minorStr!, 10);
  const patch = parseInt(patchStr!, 10);

  // Validate that parsing produced valid numbers
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    prerelease: prereleaseStr ? prereleaseStr.split(".") : [],
    build: buildStr ? buildStr.split(".") : [],
  };
}

/**
 * Compares two prerelease identifier arrays.
 * Rules per SemVer spec:
 * 1. When comparing, identifiers are compared from left to right
 * 2. Numeric identifiers are compared as integers
 * 3. Alphanumeric identifiers are compared lexically
 * 4. Numeric identifiers always have lower precedence than alphanumeric
 * 5. A larger set of identifiers has higher precedence if all preceding are equal
 * 6. A version with a prerelease has lower precedence than a normal version
 *
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
function comparePrereleaseIdentifiers(a: string[], b: string[]): number {
  // A version without prerelease has higher precedence
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // a is release, b is prerelease
  if (b.length === 0) return -1; // a is prerelease, b is release

  const maxLength = Math.max(a.length, b.length);

  for (let i = 0; i < maxLength; i++) {
    const identA = a[i];
    const identB = b[i];

    // If one side runs out of identifiers, the longer one has higher precedence
    if (identA === undefined) return -1;
    if (identB === undefined) return 1;

    const numA = parseInt(identA, 10);
    const numB = parseInt(identB, 10);
    const isNumA = !isNaN(numA) && identA === numA.toString();
    const isNumB = !isNaN(numB) && identB === numB.toString();

    if (isNumA && isNumB) {
      // Both numeric: compare as integers
      if (numA < numB) return -1;
      if (numA > numB) return 1;
    } else if (isNumA && !isNumB) {
      // Numeric always has lower precedence than alphanumeric
      return -1;
    } else if (!isNumA && isNumB) {
      // Alphanumeric always has higher precedence than numeric
      return 1;
    } else {
      // Both alphanumeric: compare lexically
      if (identA < identB) return -1;
      if (identA > identB) return 1;
    }
  }

  return 0;
}

/**
 * Compares two semantic versions.
 *
 * @param a - First version to compare
 * @param b - Second version to compare
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 *
 * @example
 * compareSemver({ major: 1, minor: 0, patch: 0, prerelease: [], build: [] },
 *               { major: 2, minor: 0, patch: 0, prerelease: [], build: [] }) // -1
 * compareSemver({ major: 1, minor: 0, patch: 0, prerelease: ["alpha"], build: [] },
 *               { major: 1, minor: 0, patch: 0, prerelease: [], build: [] }) // -1
 */
export function compareSemver(a: SemVer, b: SemVer): -1 | 0 | 1 {
  // Compare major version
  if (a.major < b.major) return -1;
  if (a.major > b.major) return 1;

  // Compare minor version
  if (a.minor < b.minor) return -1;
  if (a.minor > b.minor) return 1;

  // Compare patch version
  if (a.patch < b.patch) return -1;
  if (a.patch > b.patch) return 1;

  // Compare prerelease identifiers (build metadata is ignored for precedence)
  const prereleaseComparison = comparePrereleaseIdentifiers(a.prerelease, b.prerelease);
  if (prereleaseComparison < 0) return -1;
  if (prereleaseComparison > 0) return 1;

  return 0;
}

/**
 * Determines if the candidate version is newer than the current version.
 *
 * @param currentVersion - The version string currently installed
 * @param candidateVersion - The version string to check
 * @returns true if candidateVersion > currentVersion, false otherwise
 *
 * @example
 * isNewerVersion("1.0.0", "1.0.1") // true
 * isNewerVersion("1.0.0", "0.9.0") // false
 * isNewerVersion("1.0.0-alpha", "1.0.0") // true (release is newer than prerelease)
 * isNewerVersion("invalid", "1.0.0") // false
 */
export function isNewerVersion(currentVersion: string, candidateVersion: string): boolean {
  const current = parseSemver(currentVersion);
  const candidate = parseSemver(candidateVersion);

  // If either version is invalid, we cannot determine if there's an update
  if (!current || !candidate) {
    return false;
  }

  return compareSemver(candidate, current) > 0;
}

/**
 * Validates that a string is a valid semantic version.
 *
 * @param version - The version string to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * isValidSemver("1.0.0") // true
 * isValidSemver("1.0.0-beta.1+build.123") // true
 * isValidSemver("v1.0.0") // false (no 'v' prefix support)
 * isValidSemver("1.0") // false (missing patch)
 */
export function isValidSemver(version: string): boolean {
  return parseSemver(version) !== null;
}

/**
 * Formats a SemVer object back to a string.
 *
 * @param semver - The SemVer object to format
 * @returns The formatted version string
 *
 * @example
 * formatSemver({ major: 1, minor: 2, patch: 3, prerelease: [], build: [] }) // "1.2.3"
 * formatSemver({ major: 1, minor: 0, patch: 0, prerelease: ["beta", "1"], build: ["001"] }) // "1.0.0-beta.1+001"
 */
export function formatSemver(semver: SemVer): string {
  let result = `${semver.major}.${semver.minor}.${semver.patch}`;

  if (semver.prerelease.length > 0) {
    result += `-${semver.prerelease.join(".")}`;
  }

  if (semver.build.length > 0) {
    result += `+${semver.build.join(".")}`;
  }

  return result;
}

/**
 * Sorts an array of version strings in descending order (newest first).
 *
 * @param versions - Array of version strings to sort
 * @returns New array sorted in descending order, invalid versions at the end
 *
 * @example
 * sortVersionsDescending(["1.0.0", "2.0.0", "1.5.0"]) // ["2.0.0", "1.5.0", "1.0.0"]
 */
export function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((a, b) => {
    const semverA = parseSemver(a);
    const semverB = parseSemver(b);

    // Invalid versions go to the end
    if (!semverA && !semverB) return 0;
    if (!semverA) return 1;
    if (!semverB) return -1;

    // Descending order (negate the comparison)
    return -compareSemver(semverA, semverB);
  });
}
