# Changelog

## [1.2.1] - 2026-05-08
### Changed
- Improved min/max zoom limits when the viewport is resized.
- Expanded readme with examples for binding from a file input and uploading the cropped image.


## [1.2.0] - 2026-05-07
### Added
- Support for dragging at the same time as pinch zooming.
- CSS progress spinner while loading a bound image.

### Changed
- `enableResize` now allows resizing both width and height simultaneously, with a minimum size so the viewport can always be dragged.
- Improved zoom speed on touchpads.
- Optimized image dragging and centering for smoother rendering.

### Fixed
- Laggy/jumpy pinch zooming in Firefox (caused by https://bugzil.la/1729465).
- Broken image icon appearing before an image was bound ([#7](https://github.com/devtheorem/cropt/issues/7)).


## [1.1.1] - 2026-04-30
### Added
- `enableResize` option: when set to `true`, resize handles are shown on the viewport edges allowing the user to adjust its size ([#9](https://github.com/devtheorem/cropt/issues/9)).
- `CroptState` interface with fields `x`, `y`, `zoom`, `width`, and `height` representing a saved crop state.
- `getState()` method to retrieve the current crop state.
- `bind()` now accepts a `CroptState` object as its second argument to restore zoom, position, and viewport dimensions ([#3](https://github.com/devtheorem/cropt/issues/3), [#10](https://github.com/devtheorem/cropt/issues/10)). Passing a number is still supported for backwards compatibility.

### Changed
- Refreshed demo site to demonstrate the `enableResize` option and saving/restoring crop state.

> [!NOTE]  
> Version 1.1.0 was skipped due to a bug with resize handle touchscreen behavior.


## [1.0.2] - 2026-01-16
### Fixed
- Incorrect step value for range input.


## [1.0.1] - 2026-01-13
### Fixed
- Janky zoom behavior caused by incorrect center point calculation ([#6]).
- Zooming out all the way now works as expected with large images ([#6]).
- Zoom limit now auto-updates when dynamically changing the viewport size.


## [1.0.0] - 2024-12-01
### Changed
- Replaced `viewport.type` option with `viewport.borderRadius`.
This option takes a string containing a CSS length or percentage, and defaults to `"0px"`.
To upgrade code that used the `"circle"` viewport type, instead set the border radius to `"50%"`.


## [0.9.1] - 2024-11-07
### Changed
- Removed unnecessary variables.
- Code is now formatted with Prettier.


## [0.9.0] - 2024-10-23
### Fixed
- Cropt now clamps image drags to the viewport boundary, rather than ignoring the delta if it would go past the boundary. This fixes unexpected gaps between the image and viewport edges. ([#5](https://github.com/devtheorem/cropt/pull/5)).


## [0.8.9] - 2024-06-26
### Fixed
- Image content is no longer doubled when resizing a large image with transparency ([#1](https://github.com/devtheorem/cropt/pull/1)).


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

[#6]: https://github.com/devtheorem/cropt/issues/6
[1.2.1]: https://github.com/devtheorem/cropt/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/devtheorem/cropt/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/devtheorem/cropt/compare/v1.0.2...v1.1.1
[1.0.2]: https://github.com/devtheorem/cropt/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/devtheorem/cropt/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/devtheorem/cropt/compare/v0.9.1...v1.0.0
[0.9.1]: https://github.com/devtheorem/cropt/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/devtheorem/cropt/compare/v0.8.9...v0.9.0
[0.8.9]: https://github.com/devtheorem/cropt/compare/v0.8.8...v0.8.9
[0.8.8]: https://github.com/devtheorem/cropt/compare/v0.8.6...v0.8.8
[0.8.6]: https://github.com/devtheorem/cropt/compare/v0.8.4...v0.8.6
[0.8.4]: https://github.com/devtheorem/cropt/releases/tag/v0.8.4
