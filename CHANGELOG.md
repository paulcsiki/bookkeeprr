# Changelog

## v1.0.3 - 2026-06-28

This release contains only internal CI/build changes with no user-facing impact.

_No user-facing changes in this release; it contains internal build and release-pipeline maintenance only._

## v1.0.2 - 2026-06-28

### Added
- Multi-architecture container images: the web app image now runs natively on both `amd64` and `arm64` hosts.

## v1.0.1 - 2026-06-28

### Changed
- Release tooling: `--init`/`--clean-runs` now also purges GHCR packages.

### Fixed
- Publishing the public mirror now authenticates GitHub pushes correctly (the source repo's SSH command is propagated to the mirror clone).

## v1.0.0 - 2026-06-28

### Added

- Initial public release.
