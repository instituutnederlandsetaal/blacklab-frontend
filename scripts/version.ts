export default class Version {
  private static readonly versionRegex = /^(\d+)\.(\d+)\.(\d+)(-SNAPSHOT)?$/;

  protected constructor(public major: number, public minor: number, public patch: number, public snapshot: boolean) {}
  static fromString(version: string): Version {
    const m = version.match(Version.versionRegex);
    if (!m) throw new Error(`Invalid version: '${version}'`);
    return new Version(Number(m[1]), Number(m[2]), Number(m[3]), !!m[4]);
  }
  static clone(version: Version): Version {
    return new Version(version.major, version.minor, version.patch, version.snapshot);
  }
  static fromObject(obj: { major: number; minor: number; patch: number; snapshot?: boolean }): Version {
    return new Version(obj.major, obj.minor, obj.patch, !!obj.snapshot);
  }

  toString() {
    return `${this.major}.${this.minor}.${this.patch}${this.snapshot ? '-SNAPSHOT' : ''}`;
  }

  static highestVersion(v1: Version, v2: Version): Version {
    if (v1.major !== v2.major) return v1.major > v2.major ? v1 : v2;
    if (v1.minor !== v2.minor) return v1.minor > v2.minor ? v1 : v2;
    if (v1.patch !== v2.patch) return v1.patch > v2.patch ? v1 : v2;
    return v1.snapshot ? v2 : v1; // return non-snapshot version
  }

  static equals(v1: Version, v2: Version): boolean {
    return v1.major === v2.major && v1.minor === v2.minor && v1.patch === v2.patch && v1.snapshot === v2.snapshot;
  }

  static isVersionString(str: string): boolean {
    return Version.versionRegex.test(str);
  }

  nextMinorSnapshot(): Version { return new Version(this.major, this.minor + 1, 0, true); }
  nextPatchSnapshot(): Version { return new Version(this.major, this.minor, this.patch + 1, true); }
  nextMajorSnapshot(): Version { return new Version(this.major + 1, 0, 0, true); }
  nonSnapshotVersion(): Version { return new Version(this.major, this.minor, this.patch, false);}
}