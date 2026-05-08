# Cropt

A delightful image cropper optimized for both mobile and desktop use.

* Includes TypeScript definitions.
* Published as a native ES module.
* Zero dependencies.
* Originally based on [Croppie](https://github.com/Foliotek/Croppie), but rewritten in TypeScript with a simpler API and lots of bug fixes and polish.

## Installation

```sh
npm install cropt
```

## Usage

1. Include the `src/cropt.css` stylesheet on your page.
2. Add a `<div>` element with a unique ID to your HTML to hold the Cropt instance.
3. Import Cropt and instantiate it with a reference to the `<div>` element and an object for options.
4. Bind to an image URL.

```html
<div id="cropper"></div>
```

```javascript
import { Cropt } from "cropt";
import "cropt/src/cropt.css";

let croptEl = document.getElementById('cropper');
let cropt = new Cropt(croptEl, {
    viewport: { width: 250, height: 250 },
});
cropt.bind("path/to/image.jpg");
```

### Binding from a file input

To let users pick an image from their device, bind from a file `<input>` element's `change` event using `URL.createObjectURL()`:

```html
<input type="file" id="fileInput" accept="image/*" />
```

```javascript
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    cropt.bind(url).then(() => URL.revokeObjectURL(url));
});
```

The object URL can be revoked after binding because Cropt has already loaded the image data into the DOM at that point.

### Uploading the cropped image

Use `toBlob()` to get the cropped image as a `Blob`, then send it to your server with `fetch`:

```javascript
async function upload() {
    const blob = await cropt.toBlob(500, "image/webp"); // longest side scaled to 500px

    const body = new FormData();
    body.append('image', blob, 'crop.webp');

    await fetch('/upload', { method: 'POST', body });
}
```

### Sizing

The Cropt boundary defaults to 320px wide and 320px high.
To customize this, override the `.cropt-container .cr-boundary` width and height via CSS.

## Options

### `mouseWheelZoom`

Type: `"off" | "on" | "ctrl"`  
Default value: `"on"`

If set to `"off"`, the mouse wheel cannot be used to zoom in and out of the image.
If set to `"ctrl"`, the mouse wheel will only zoom in and out while the CTRL key is pressed.

### `viewport`

Type: `{ width: number, height: number, borderRadius: string }`  
Default value: `{ width: 220, height: 220, borderRadius: "0px" }`

Defines the size and shape of the crop box.
For a circle shape, set the border radius to `"50%"`.

### `enableResize`

Type: `boolean`  
Default value: `false`

If set to `true`, resize handles are shown on the edges of the viewport, allowing the user to adjust its size.

### `zoomerInputClass`

Type: `string`  
Default value: `"cr-slider"`

Optionally set a different class on the zoom range input to customize styling (e.g. set to `"form-range"` when using Bootstrap).

## Methods

### `bind(src: string, state: CroptState | number | null = null): Promise<void>`

Takes an image URL as the first argument. Returns a `Promise` which resolves when the image has been loaded and state is initialized.

The optional second argument can be:
- A `CroptState` object (returned by `getState()`) to restore a previously saved crop position, zoom, and viewport size.
- A `number` to set only the initial zoom level.

### `getState(): CroptState`

Returns the current crop state as a `CroptState` object with fields `x`, `y`, `zoom`, `width`, and `height`.
This can be stored alongside the original image and later passed to `bind()` to restore the crop position, zoom level, and viewport size.

```javascript
// Save state when the user is done cropping
const state = cropt.getState();

// Later, restore the same crop position on the same image
cropt.bind("path/to/image.jpg", state);
```

### `destroy(): void`

Deconstructs a Cropt instance and removes the elements from the DOM.

### `refresh(): void`

Recalculate points for the image. Necessary if the instance was bound while hidden, or if it has been hidden and re-shown.

### `toCanvas(size: number | null = null): Promise<HTMLCanvasElement>`

Returns a `Promise` resolving to an `HTMLCanvasElement` object for the cropped image.
If `size` is specified, the cropped image will be scaled with its longest side set to this value.

### `toBlob(size: number | null = null, type = "image/webp", quality = 1): Promise<Blob>`

Returns a `Promise` resolving to a `Blob` object for the cropped image.
If `size` is specified, the cropped image will be scaled with its longest side set to this value.
The `type` and `quality` parameters are passed directly to the corresponding
[`HTMLCanvasElement.toBlob()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) method parameters.

### `setOptions(options: CroptOptions): void`

Allows options to be dynamically changed on an existing Cropt instance.

### `setZoom(value: number): void`

Set the zoom of a Cropt instance. The value must be between 0 and 1, and is clamped to the min/max zoom calculated for the current image.

## Visibility and binding

Cropt is dependent on its container being visible when the bind method is called.
This can be an issue when your component is inside a modal that isn't shown. Consider the Bootstrap modal, for example:

```javascript
const cropEl = document.getElementById('my-cropt');
const c = new Cropt(cropEl, opts);
const myModal = document.getElementById('my-modal');

myModal.addEventListener('shown.bs.modal', () => {
    c.bind("my/image.jpg");
});
```

If your Cropt instance is inside a modal, make sure `bind()` is called after the modal finishes opening.

If a Cropt instance needs to be hidden and then re-shown, call the `refresh()` method to recalculate properties for the displayed image.

## Browser support

Cropt is tested in the following browsers:

* Firefox
* Safari
* Chrome
* Edge

Cropt should also work in any other modern browser using an engine based on Gecko, WebKit, or Chromium.

## License

MIT
