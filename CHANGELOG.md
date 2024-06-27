# Changelog

## [0.8.9] - 2024-06-26

### Fixed
- Image content is no longer doubled when resizing a large image with transparency ([#1]).

## [0.8.8] - 2023-11-21

### Fixed
- Correctly handle uncached pointer move events.
    - Resolves janky behavior in Safari when a pinch zoom is initiated with one pointer outside the preview image.

### Changed
- Slightly increased default boundary and viewport size.


## [0.8.6] - 2023-11-14

### Changed
- For browsers that don't support WebP output (Safari), fall back to JPEG instead of PNG when `quality < 1` to avoid unexpectedly large files.


## [0.8.4] - 2023-11-12

This is the initial pre-release after forking from [Foliotek/Croppie](https://github.com/Foliotek/Croppie) v2.6.5.

### Added
- `zoomerInputClass` option to customize the range input class.
- TypeScript type definitions are now included.
- `setOptions()` method to dynamically change options on a Cropt instance.

### Fixed
- Ability to move and zoom viewport via the keyboard.
- Broken transform state when zooming while dragging (including image getting stuck outside viewport).

### Changed
- No longer depends on Exif.js library.
- Published as a native ES module.
- Rewrote image scaling algorithm for higher quality results.
- Replaced `result()` method with separate `toCanvas()` and `toBlob()` methods.
- Default format for `toBlob` is now `"image/webp"`.
- Migrated from deprecated `mousewheel` and `DOMMouseScroll` events to standard `wheel` events.
- Unified handling of mouse/touch dragging and pinch zooming via pointer events.
- `mouseWheelZoom` option is now consistently a string.

### Removed
- jQuery API and legacy polyfills.
- Option to set crop points when calling `bind()` (set zoom instead).
- `update` callback and events.
- `get()` method.
- Option to output cropped image as a circle shape with a white background.
- Unnecessary `customClass` option (set directly on the bound element instead).
- Experimental `enforceBoundary` option (boundaries are always enforced now).
- `enableOrientation` option.
- `enableZoom` option (zooming is always enabled now, though mouse wheel behavior can be customized).
- `boundary` width/height options (customize via CSS instead).
- `enableResize` option.
- `showZoomer` option (hide via CSS instead if desired).

[#1]: https://github.com/theodorejb/cropt/pull/1
[Unreleased]: https://github.com/theodorejb/cropt/compare/v0.8.9...HEAD
[0.8.9]: https://github.com/theodorejb/cropt/compare/v0.8.8...v0.8.9
[0.8.8]: https://github.com/theodorejb/cropt/compare/v0.8.6...v0.8.8
[0.8.6]: https://github.com/theodorejb/cropt/compare/v0.8.4...v0.8.6
[0.8.4]: https://github.com/theodorejb/cropt/releases/tag/v0.8.4
