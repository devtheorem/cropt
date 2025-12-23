# Cropt - lightweight JavaScript image cropper

Originally based on [Foliotek/Croppie](https://github.com/Foliotek/Croppie), but rewritten as a modern ES module with a simpler API, higher quality image scaling, and numerous other improvements. 

## Installation

```
npm install cropt
```

## Running Demo

```
npm run prepare
npm start
```

## Usage

1. Include the `src/cropt.css` stylesheet on your page.
2. Add a `div` element to your HTML to hold the Cropt instance.
3. Import Cropt and bind it to an image:

```javascript
import { Cropt } from "cropt";

let c = new Cropt(document.getElementById('demo'), options);
c.bind("path/to/image.jpg");
```

### Sizing

The Cropt boundary defaults to 320px wide and 320px high.
To customize this, override the `.cropt-container .cr-boundary` width and height via CSS.

## Options

### `mouseWheelZoom`

Type: `"off" | "on" | "ctrl"`  
Default value: `"on"`

If set to `"off"`, the mouse wheel cannot be used to zoom in and out of the image. If set to `"ctrl"`, the mouse wheel will only zoom in and out while the CTRL key is pressed.

### `viewport`

Type: `{ width: number, height: number, borderRadius: string }`  
Default value: `{ width: 220, height: 220, borderRadius: "0px" }`

Defines the size and shape of the crop box.
For a circle shape, set the border radius to `"50%"`.

### `zoomerInputClass`

Type: `string`  
Default value: `"cr-slider"`

Optionally set a different class on the zoom range input to customize styling (e.g. set to `"form-range"` when using Bootstrap).

### `resizeBars`

Type: `boolean`
Default value: `false`

Optionally to show resize handles (grab-bars) to adjust the viewport width/height.

## Methods

### `bind(src: string, preset: number | { transform, viewport }): Promise<void>`

Takes an image URL as the first argument, and an optional initial zoom value OR preset restore data for image placement in viewport. Returns a `Promise` which resolves when the image has been loaded and state is initialized.

### `destroy(): void`

Deconstructs a Cropt instance and removes the elements from the DOM.

### `refresh(): void`

Recalculate points for the image. Necessary if the instance was initially bound to a hidden element.

### `toCanvas(size: number | null = null): Promise<HTMLCanvasElement>`

Returns a `Promise` resolving to an `HTMLCanvasElement` object for the cropped image. If `size` is specified, the cropped image will be scaled with its longest side set to this value.

### `toBlob(size: number | null = null, type = "image/webp", quality = 1): Promise<Blob>`

Returns a Promise resolving to a `Blob` object for the cropped image. If `size` is specified, the cropped image will be scaled with its longest side set to this value. The `type` and `quality` parameters are passed directly to the corresponding [HTMLCanvasElement.toBlob()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) method parameters.

### `get(): { crop: { left, top, right, bottom }, transform: { x, y, scale, rotate, origin: {x, y}}, viewport: { width, height, borderRadius } }`
Returns information about the current crop state (all `numbers`):

- crop: Crop coordinates on the original image (left, top, right, bottom in pixels). (Note: if rotation present, image must be rotated FIRST then crop coordinates will apply)
- transform: Information for re-placement of image within viewport
- viewport: Final viewport dimensions and styling (width, height, borderRadius)

Useful for server-side cropping or saving user selections.

### `setOptions(options: CroptOptions): void`

Allows options to be dynamically changed on an existing Cropt instance.

### `setZoom(value: number): void`

Set the zoom of a Cropt instance. The value must be between 0 and 1, and is restricted to the min/max set by Cropt.

### `setRotation(value: number): void`

Set a rotation factor (0, 90, 180, 270) to the image.

## Visibility and binding

Cropt is dependent on its container being visible when the bind method is called. This can be an issue when your component is inside a modal that isn't shown. Consider the Bootstrap modal, for example:

```javascript
const cropEl = document.getElementById('my-cropt');
const c = new Cropt(cropEl, opts);
const myModal = document.getElementById('my-modal');

myModal.addEventListener('shown.bs.modal', () => {
    c.bind("my/image.jpg");
});
```

If you have issues getting the correct result, and your Cropt instance is shown inside a modal, try taking it out of the modal and see if the issue persists. If not, make sure that your bind method is called after the modal finishes opening.

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


