# Changelog

## v1.0.1 - 2026-06-28

### Changed
- Release tooling: `--init`/`--clean-runs` now also purges GHCR packages.

### Fixed
- Publishing the public mirror now authenticates GitHub pushes correctly (the source repo's SSH command is propagated to the mirror clone).

## v1.0.0 - 2026-06-28

### Added

- Initial public release.
