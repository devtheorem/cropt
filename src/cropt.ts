declare global {
    interface Blob {
        width?: number;
        height?: number;
    }
}

function debounce<T extends Function>(func: T, wait: number) {
    let timer: number | undefined;
    return (...args: any) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), wait);
    };
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // important to avoid CORS when using external pictures
        
        img.onload = () => {
            resolve(img);
        };
        img.onerror = reject;
        img.src = src;
    });
}

function getInitialElements() {
    return {
        boundary: document.createElement("div"),
        viewport: document.createElement("div"),
        preview: document.createElement("img"),
        overlay: document.createElement("div"),
        controls: document.createElement("div"),
        resizeHandleRight: document.createElement("div"),
        resizeHandleBottom: document.createElement("div"),
        toolBar: document.createElement("div"),
        zoomer: document.createElement("input"),
        rotateLeft: document.createElement("button"),
        rotateRight: document.createElement("button"),
    };
}

function getArrowKeyDeltas(key: string): [number, number] | null {
    switch (key) {
        case "ArrowLeft": return [2, 0];
        case "ArrowUp": return [0, 2];
        case "ArrowRight": return [-2, 0];
        case "ArrowDown": return [0, -2];
        default: return null;
    }
}

function clampDelta(innerDiff: number, delta: number, outerDiff: number) {
    return Math.round(Math.max(Math.min(innerDiff, delta), outerDiff));
}

function canvasSupportsWebP() {
    // https://caniuse.com/mdn-api_htmlcanvaselement_toblob_type_parameter_webp
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
}

type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};

export interface CroptOptions {
    mouseWheelZoom: "off" | "on" | "ctrl";
    viewport: {
        width: number;
        height: number;
        borderRadius: string;
    };
    zoomerInputClass: string;
    enableZoomSlider?: boolean; // show the physical slider (pinch zoom will work regardless)
    enableKeypress?: boolean; // listen to arrow keys
    resizeBars?: boolean; // allow on-picture resize bars
    enableRotateBtns?: boolean; // passing in rotation will work regardless, but no btns will be visible
    transparencyColor?: string; // what color to show behind transparency colors (or if converting to jpeg)
}
interface CropPoints {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

class Cropt {
    element: HTMLElement;
    elements: {
        boundary: HTMLDivElement;
        viewport: HTMLDivElement;
        preview: HTMLImageElement;
        overlay: HTMLDivElement;
        controls: HTMLDivElement;
        resizeHandleRight: HTMLDivElement;
        resizeHandleBottom: HTMLDivElement;
        toolBar: HTMLDivElement;
        zoomer: HTMLInputElement;
        rotateLeft: HTMLButtonElement;
        rotateRight: HTMLButtonElement;
    };
    options: CroptOptions = {
        mouseWheelZoom: "on",
        viewport: {
            width: 0, height: 0,
            borderRadius: "0px",
        },
        zoomerInputClass: "cr-slider",
        enableZoomSlider: true,
        enableKeypress: false,
        resizeBars: false,
        enableRotateBtns: false,
    };
    // active settings 
    #maxZoom = 0.85; // up to 1 possible
    #viewportMinWidth = 50; // for adjustable, min viewport width
    #viewportMinHeight = 50; 

    #scale = 1;
    #rotation = 0;
    #clearRotationBlob = false; // when we create intermittent blobs (ex. rotate), must clear
    // when displaying in UI or experting to jpeg, use this color for transparency sections
    #transparencyColor = '#fff';
    #abortController = new AbortController();
    #updateOverlayDebounced = debounce(() => {
        this.#updateOverlay();
    }, 100);

    constructor(element: HTMLElement, options: RecursivePartial<CroptOptions>) {
        if (element.classList.contains("cropt-container")) {
            throw new Error("Cropt appears initialized (element has 'cropt-container' class). Aborting.");
        }

        if (options.viewport) {
            options.viewport = { ...this.options.viewport, ...options.viewport };

            // set default width/height if none / too-small
            if (!options.viewport?.width || options.viewport.width < 100) options.viewport.width = element.clientWidth - 60;
            if (!options.viewport?.height || options.viewport.height < 100) options.viewport.height = element.clientHeight - 60;
        }
        
        // changed: removed structuredClone: slow, and would fail passing functions in options
        this.options = { ...this.options, ...options } as CroptOptions;
        if( this.options.transparencyColor ) this.#transparencyColor = this.options.transparencyColor;
        this.element = element;
        this.element.classList.add("cropt-container");

        this.elements = getInitialElements();
        this.elements.toolBar.classList.add("cr-toolbar-wrap");
        this.elements.boundary.classList.add("cr-boundary");
        this.elements.viewport.classList.add("cr-viewport");
        this.elements.overlay.classList.add("cr-overlay");
        this.elements.controls.classList.add("cr-controls");

        this.elements.viewport.setAttribute("tabindex", "0");
        this.#setPreviewAttributes(this.elements.preview);

        this.elements.boundary.appendChild(this.elements.preview);
        this.elements.boundary.appendChild(this.elements.viewport);
        this.elements.boundary.appendChild(this.elements.overlay);
        this.elements.boundary.appendChild(this.elements.controls);
        this.#setupControlOverlay();

        if (this.options.enableRotateBtns) {
            this.elements.rotateLeft.type = "button";
            this.elements.rotateLeft.innerHTML = "↺";
            this.elements.rotateLeft.setAttribute("aria-label", "rotate left");
            this.elements.rotateLeft.classList.add("cr-rotate-btn", "cr-rotate-left");

            this.elements.rotateRight.type = "button";
            this.elements.rotateRight.innerHTML = "↻";
            this.elements.rotateRight.setAttribute("aria-label", "rotate right");
            this.elements.rotateRight.classList.add("cr-rotate-btn", "cr-rotate-right");

            this.elements.toolBar.appendChild(this.elements.rotateLeft);
            this.elements.toolBar.appendChild(this.elements.rotateRight);
        }

        this.elements.zoomer.type = "range";
        this.elements.zoomer.step = "0.001";
        this.elements.zoomer.value = "1";
        // zooming can happen with pinch, however when slider enabled, it is visible, otherwise unseen
        if (this.options.enableZoomSlider) { 
            this.elements.zoomer.className = this.options.zoomerInputClass;
            this.elements.zoomer.setAttribute("aria-label", "zoom");
            this.elements.toolBar.appendChild(this.elements.zoomer);
        }

        this.element.appendChild(this.elements.boundary);
        this.element.appendChild(this.elements.toolBar);
        if (this.elements.toolBar.childNodes.length ) {
            // there's something in toolbar, so show it, and adjust height of picture-box
            this.element.style.setProperty('--cropt-toolbar', '32px');
        } else {
            this.element.style.setProperty('--cropt-toolbar', '0px');
        }

        this.#setViewportCss();
        this.#initDraggable();
        this.#initializeZoom();
        this.#initializeRotate();
    }

    /**
     * Bind an image from an src string.
     * Passing in preset transform/viewport parameters will restore to those
     * Returns a Promise which resolves when the image has been loaded and state is initialized.
     */
    bind(
        src: string,
        preset?:
            | number
            | {
                  transform: {
                      x: number;
                      y: number;
                      scale: number;
                      rotate: number;
                      origin: { x: number; y: number };
                  };
                  viewport: { width: number; height: number; borderRadius: string };
              },
    ) {
        if (!src) {
            throw new Error("src cannot be empty");
        }

        return loadImage(src).then(async (img) => {
            this.#replaceImage(img); // force-replace image node (prevents caching, etc)

            if (typeof preset === "object" && preset?.transform) {
                if (preset?.viewport)
                    this.setOptions({ viewport: preset.viewport });

                // defer restore to next frame (after layout)
                setTimeout(async () => {
                    // Apply rotation first (physically rotates the image)
                    if (preset.transform?.rotate) {
                        await this.setRotation(preset.transform.rotate);
                    }
                    const zoom = preset.transform?.scale || null;
                    this.#updateZoomLimits(zoom);

                    // Finally, override to custom preview positioning
                    this.#transformPreview(preset.transform);
                    this.#updateOverlay();
                }, 0);
            } else {
                // passed-in number, so simply zoom level
                const zoom = Number(preset) || null;
                this.#initPropertiesFromImage(zoom);
            }
        });
    }

    #getPoints() {
        const getPoint = (pos: number) => Math.round(Math.max(0, pos / this.#scale));

        const imgData = this.elements.preview.getBoundingClientRect();
        const vpData = this.elements.viewport.getBoundingClientRect();
        const oWidth = this.elements.viewport.offsetWidth;
        const oHeight = this.elements.viewport.offsetHeight;
        const widthDiff = (vpData.width - oWidth) / 2;
        const heightDiff = (vpData.height - oHeight) / 2;
        const left = vpData.left - imgData.left;
        const top = vpData.top - imgData.top;

        return {
            left: getPoint(left),
            top: getPoint(top),
            right: getPoint(left + oWidth + widthDiff),
            bottom: getPoint(top + oHeight + heightDiff),
            width: getPoint(oWidth + widthDiff),
            height: getPoint(oHeight + heightDiff),
        };
    }

    /**
     * Returns:
     * crop { x, y, width, height }: the crop rectangle for image cropping outside Cropt
     * transform: adjustments to re-create placement of image in viewport (ex. continue editing)
     * viewport: the active viewport size + borderRadius used (in case it's system adjusted)
     */
    get() {
        const p = this.#getPoints();
        let crop = {
            x: p.left,
            y: p.top,
            width: p.width,
            height: p.height,
        };

        // adjust (x,y) depending on rotation to match orientation AFTER rotation
        const origW = this.elements.preview.naturalWidth;
        const origH = this.elements.preview.naturalHeight;
        if (this.#rotation === 90 || this.#rotation === 270) {
            // 90 degrees so switch W x H -> H x W, then adjust coords
            crop.width = p.height;
            crop.height = p.width;
            if (this.#rotation === 90) {
                crop.x = p.top;
                crop.y = origW - p.left - p.width;
            } else {
                crop.x = origH - p.top - p.height;
                crop.y = p.left;
            }
        } else if( this.#rotation === 180 ) {
            crop.x = origW - p.left - p.width;
            crop.y = origH - p.top - p.height;
        }
        crop.x = Math.max(0,crop.x); // sometimes calcs -1 or -3, clamp it to 0.
        crop.y = Math.max(0,crop.y);

        return {
            crop,
            transform: this.#transformPreview(),
            viewport: {
                width: Math.round(this.options.viewport.width),
                height: Math.round(this.options.viewport.height),
                borderRadius: this.options.viewport.borderRadius,
            },
        };
    }

    /**
     * Returns a Promise resolving to an HTMLCanvasElement object for the cropped image.
     * If size is POSTIVE: the image will be SCALED with its longest side set to size.
     * If size is NEGATIVE: it will only SHRINK it if it exceeds size (never enlarge it)
     * Otherwise (size = null), actual-size cropped area is returned
     */
    toCanvas(size: number | null = null, type: string = '') {
        const points = this.#getPoints();
        const shrinkOnly = size && size < 0;
        if( size && shrinkOnly ) size = -size; // make positive
        let finalWidth = points.width;
        let finalHeight = points.height;

        // resize only if size passed in (if negative only shrink if sides exceed final)
        if (size && (!shrinkOnly || finalWidth > size || finalHeight > size)) {        
            const vpRect = this.elements.viewport.getBoundingClientRect();
            const ratio = vpRect.width / vpRect.height;

            if (ratio > 1) {
                finalWidth = size;
                finalHeight = size / ratio;
            } else {
                finalHeight = size;
                finalWidth = size * ratio;
            }
        }

        return Promise.resolve(this.#getCanvas(points, finalWidth, finalHeight, type));
    }

    toBlob(size: number | null = null, type = "image/webp", quality = 1): Promise<Blob> {
        if (type === "image/webp" && quality < 1 && !canvasSupportsWebP()) {
            type = "image/jpeg";
        }

        return new Promise((resolve, reject) => {
            this.toCanvas(size,type).then((canvas) => {
                canvas.toBlob(
                    (blob) => {
                        if (blob === null) {
                            reject("Canvas blob is null");
                        } else {
                            // add in this meta-data to blob
                            blob.width = canvas.width;
                            blob.height = canvas.height;
                            resolve(blob);
                        }
                    },
                    type,
                    quality,
                );
            });
        });
    }

    refresh() {
        this.#initPropertiesFromImage();
    }

    setOptions(options: RecursivePartial<CroptOptions>) {
        const curWidth = this.options.viewport.width;
        const curHeight = this.options.viewport.height;
        const viewport = this.options.viewport;

        if (options.viewport) {
            options.viewport = { ...viewport, ...options.viewport };
        }

        this.options = { ...this.options, ...options } as CroptOptions;
        this.#setViewportCss();

        // if viewport dimensions unchanged, don't change zoom
        if (viewport.width === curWidth && viewport.height === curHeight) return;
        
        this.#updateZoomLimits();
    }

    setZoom(value: number) {
        const zoomer = this.elements.zoomer;
        const zMin = parseFloat(zoomer.min);
        const zMax = parseFloat(zoomer.max);
        zoomer.value = Math.max(zMin, Math.min(zMax, value)).toFixed(3);
        this.#onZoom();
    }

    async setRotation(degrees: number) {
        if (degrees === undefined) return;

        // Normalize to 0, 90, 180, 270
        const normalizedDegrees = ((degrees % 360) + 360) % 360;
        const deltaRotation = normalizedDegrees - this.#rotation;

        if (deltaRotation === 0) return; // No change

        this.#rotation = normalizedDegrees;

        // Physically rotate the image by drawing it on a rotated canvas
        await this.#rotateImage(deltaRotation);
        // reset the properties (zoom, etc)
        this.#initPropertiesFromImage();
    }

    async #rotateImage(degrees: number) {
        const img = this.elements.preview;
        const bitmap = await createImageBitmap(img);

        // For 90 or 270 degree rotations, swap width and height
        const isRotated90 = Math.abs(degrees % 180) === 90;
        const canvas = document.createElement("canvas");
        canvas.width = isRotated90 ? bitmap.height : bitmap.width;
        canvas.height = isRotated90 ? bitmap.width : bitmap.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");

        // Rotate and draw
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        bitmap.close(); // Free memory

        // Convert to blob and update img src
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
                // "image/png",
                "image/webp", 1
            );
        });

        if (this.#clearRotationBlob) URL.revokeObjectURL(img.src);
        img.src = URL.createObjectURL(blob);
        await img.decode(); // Wait for decode without onload event
        // set a flag so we delete this blob if changing src or destroy
        this.#clearRotationBlob = true;
    }

    destroy() {
        this.#abortController.abort();

        // Clean up blob URL if we created it internally (ex. for rotation)
        if (this.#clearRotationBlob) URL.revokeObjectURL(this.elements.preview.src);

        this.element.removeChild(this.elements.boundary);
        this.element.classList.remove("cropt-container");
        this.element.removeChild(this.elements.toolBar);
        this.elements = getInitialElements();
    }

    // adjust preview tranform styles (& transformOrigin)
    // NOTE: rotate is handled by physically rotating the image (saves many recalculations)
    #transformPreview(data?: {
        x?: number;
        y?: number;
        scale?: number;
        origin?: { x?: number; y?: number };
    }): { x: number; y: number; scale: number; rotate: number; origin: { x: number; y: number } } {
        const el = this.elements.preview;

        const parseOrigin = (): { x: number; y: number } => {
            const [oxStr, oyStr] = (el.style.transformOrigin || "0px 0px").split(" ");
            return {
                x: parseFloat(oxStr) || 0,
                y: parseFloat(oyStr) || 0,
            };
        };

        // apply the data given
        if (data !== undefined) {
            const { x = 0, y = 0, scale = 1 } = data;
            el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

            // Only set transformOrigin if provided
            if (data.origin !== undefined) {
                const ox = data.origin.x ?? 0;
                const oy = data.origin.y ?? 0;
                el.style.transformOrigin = `${ox}px ${oy}px`;
            }

            return { x, y, scale, rotate: this.#rotation, origin: parseOrigin() };
        }

        // no data so PARSE current element and pass out
        const str = el.style.transform || "";
        let x = 0,
            y = 0,
            scale = 1;

        for (const action of ["translate", "scale"]) {
            const regex = new RegExp(`${action}\s*\\(([^)]+)\\)`);
            const match = str.match(regex);

            if (match) {
                const value = match[1].trim();

                if (action === "translate") {
                    const [xStr, yStr] = value.split(",").map((v) => v.trim());
                    x = Math.round(parseFloat(xStr)) || 0;
                    y = yStr !== undefined ? Math.round(parseFloat(yStr)) || 0 : x;
                } else if (action === "scale") {
                    scale = parseFloat(value) || 1;
                }
            }
        }

        return { x, y, scale, rotate: this.#rotation, origin: parseOrigin() };
    }

    #setViewportCss() {
        if (!this.elements?.viewport) return;
        const viewport = this.elements.viewport;
        viewport.style.borderRadius = this.options.viewport?.borderRadius || "50%";
        viewport.style.width = (this.options.viewport?.width || 100) + "px";
        viewport.style.height = (this.options.viewport?.height || 100) + "px";

        // whenever viewport changes - need to move controls overlayed!
        this.#updateControlHandlePositions(); 
    }

    #setupControlOverlay() {
        // currently only resize, if off, nothing to do
        if (!this.options.resizeBars) return;

        const { resizeHandleRight, resizeHandleBottom } = this.elements;

        // Style right handle - 44px touch zone with 10px visual indicator
        resizeHandleRight.classList.add("cr-resize-handle", "cr-resize-handle-right");
        const resizeHandleRightGrabber = document.createElement("div");
        resizeHandleRightGrabber.classList.add("cr-resize-handle-grabber");
        resizeHandleRight.appendChild(resizeHandleRightGrabber);

        // Style bottom handle - 44px touch zone with 10px visual indicator
        resizeHandleBottom.classList.add("cr-resize-handle", "cr-resize-handle-bottom");
        const resizeHandleBottomGrabber = document.createElement("div");
        resizeHandleBottomGrabber.classList.add("cr-resize-handle-grabber");
        resizeHandleBottom.appendChild(resizeHandleBottomGrabber);

        // Append to controls layer (sibling to viewport and overlay)
        this.elements.controls.appendChild(resizeHandleRight);
        this.elements.controls.appendChild(resizeHandleBottom);

        // Initialize resize handlers
        this.#initControlHandlers();
        // Hack - delay setup for UI layout to finalize (for larger images esp)
        setTimeout( ()=> this.#updateControlHandlePositions(), 200 );
    }

    #updateControlHandlePositions() {
        if (!this.options.resizeBars) return;

        const { resizeHandleRight, resizeHandleBottom, viewport, boundary } = this.elements;
        const width = this.options.viewport.width;
        const height = this.options.viewport.height;
        const handleSize = 44; // Touch zone size

        // Get viewport position relative to boundary
        const vpRect = viewport.getBoundingClientRect();
        const boundRect = boundary.getBoundingClientRect();
        const vpLeft = vpRect.left - boundRect.left;
        const vpTop = vpRect.top - boundRect.top;

        // Position right handle (middle of right edge of viewport)
        // Center the 44px handle on the edge
        resizeHandleRight.style.left = `${vpLeft + width - handleSize / 2}px`;
        resizeHandleRight.style.top = `${vpTop + height / 2 - handleSize / 2}px`;

        // Position bottom handle (middle of bottom edge of viewport)
        // Center the 44px handle on the edge
        resizeHandleBottom.style.left = `${vpLeft + width / 2 - handleSize / 2}px`;
        resizeHandleBottom.style.top = `${vpTop + height - handleSize / 2}px`;
    }

    #initControlHandlers() {
        // Right handle - adjusts width
        let rightStartX = 0;
        let rightStartWidth = 0;

        const rightPointerMove = (ev: PointerEvent) => {
            ev.preventDefault();
            const deltaX = ev.pageX - rightStartX;
            const maxWidth = Math.floor(this.elements.boundary.clientWidth * 0.95);
            const newWidth = Math.min(maxWidth, Math.max(this.#viewportMinWidth, rightStartWidth + deltaX));

            this.options.viewport.width = newWidth;
            this.#setViewportCss();
        };

        const rightPointerUp = () => {
            document.removeEventListener("pointermove", rightPointerMove);
            document.removeEventListener("pointerup", rightPointerUp);
        };

        const rightPointerDown = (ev: PointerEvent) => {
            if (ev.button !== 0) return; // Only left mouse button
            ev.preventDefault();
            ev.stopPropagation();

            rightStartX = ev.pageX;
            rightStartWidth = this.options.viewport.width;

            document.addEventListener("pointermove", rightPointerMove, {
                signal: this.#abortController.signal,
            });
            document.addEventListener("pointerup", rightPointerUp, {
                signal: this.#abortController.signal,
            });
        };

        this.elements.resizeHandleRight.addEventListener("pointerdown", rightPointerDown, {
            signal: this.#abortController.signal,
        });

        // Bottom handle - adjusts height
        let bottomStartY = 0;
        let bottomStartHeight = 0;

        const bottomPointerMove = (ev: PointerEvent) => {
            ev.preventDefault();
            const deltaY = ev.pageY - bottomStartY;
            const maxHeight = Math.floor(this.elements.boundary.clientHeight * 0.95);
            const newHeight = Math.min(maxHeight, Math.max(this.#viewportMinHeight, bottomStartHeight + deltaY));

            this.options.viewport.height = newHeight;
            this.#setViewportCss();
        };

        const bottomPointerUp = () => {
            document.removeEventListener("pointermove", bottomPointerMove);
            document.removeEventListener("pointerup", bottomPointerUp);
        };

        const bottomPointerDown = (ev: PointerEvent) => {
            if (ev.button !== 0) return; // Only left mouse button
            ev.preventDefault();
            ev.stopPropagation();

            bottomStartY = ev.pageY;
            bottomStartHeight = this.options.viewport.height;

            document.addEventListener("pointermove", bottomPointerMove, {
                signal: this.#abortController.signal,
            });
            document.addEventListener("pointerup", bottomPointerUp, {
                signal: this.#abortController.signal,
            });
        };

        this.elements.resizeHandleBottom.addEventListener("pointerdown", bottomPointerDown, {
            signal: this.#abortController.signal,
        });
    }

    #getUnscaledCanvas(p: CropPoints) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (ctx === null) {
            throw new Error("Canvas context cannot be null");
        }

        canvas.width = p.width;
        canvas.height = p.height;
        const el = this.elements.preview;
        ctx.drawImage(el, p.left, p.top, p.width, p.height, 0, 0, canvas.width, canvas.height);

        return canvas;
    }
    
    #getCanvas(points: CropPoints, finalWidth: number, finalHeight: number, type: string) {
        // cannot draw from a canvas into itself while resizing — it causes visual corruption
        // ping-pong oc -> buffer -> oc ....
        console.time('getCanvas')
        const oc = this.#getUnscaledCanvas(points);
        const octx = oc.getContext("2d");
        const buffer = document.createElement("canvas");
        const bctx = buffer.getContext("2d");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = finalWidth;
        canvas.height = finalHeight;

        if (ctx === null || octx === null || bctx === null) {
            throw new Error("Canvas context cannot be null");
        }
        
        let to = {
            width: oc.width,
            height: oc.height,
        };

        while (to.width > canvas.width * 2) {
            let w = to.width;
            let h = to.height;

            // buffer: copy oc (oc -> buffer)
            buffer.width = w;
            buffer.height = h;
            bctx.clearRect(0, 0, buffer.width, buffer.height);
            bctx.drawImage(oc, 0, 0);

            to = {
                width: Math.floor(w / 2),
                height: Math.floor(h / 2),
            };
            // clear oc 
            octx.clearRect(0, 0, w, h);
            // oc: copy 1/2-size buffer (buffer -> oc/2) -- half-size for smooth scaling
            octx.drawImage(buffer, 0, 0, w, h, 0, 0, to.width, to.height);
        }

        // if jpeg we fill with transparencyColor in case the canvas has alpha
        if (type === 'image/jpeg') {
            ctx.fillStyle = this.#transparencyColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(oc, 0, 0, to.width, to.height, 0, 0, canvas.width, canvas.height);
        
        oc.width = oc.height = 0; // ios hint to free
        buffer.width = buffer.height = 0;
        console.timeEnd('getCanvas')
        return canvas;
    }

    #getVirtualBoundaries() {
        const scale = this.#scale;
        const viewport = this.elements.viewport.getBoundingClientRect();
        const centerFromBoundaryX = this.elements.boundary.clientWidth / 2;
        const centerFromBoundaryY = this.elements.boundary.clientHeight / 2;
        const imgRect = this.elements.preview.getBoundingClientRect();
        const halfWidth = viewport.width / 2;
        const halfHeight = viewport.height / 2;

        const maxX = (halfWidth / scale - centerFromBoundaryX) * -1;
        const maxY = (halfHeight / scale - centerFromBoundaryY) * -1;
        const originMinX = (1 / scale) * halfWidth;
        const originMinY = (1 / scale) * halfHeight;

        return {
            translate: {
                maxX: maxX,
                minX: maxX - (imgRect.width * (1 / scale) - viewport.width * (1 / scale)),
                maxY: maxY,
                minY: maxY - (imgRect.height * (1 / scale) - viewport.height * (1 / scale)),
            },
            origin: {
                maxX: imgRect.width * (1 / scale) - originMinX,
                minX: originMinX,
                maxY: imgRect.height * (1 / scale) - originMinY,
                minY: originMinY,
            },
        };
    }

    #assignTransformCoordinates(deltaX: number, deltaY: number) {
        const imgRect = this.elements.preview.getBoundingClientRect();
        const vpRect = this.elements.viewport.getBoundingClientRect();
        const transform = this.#transformPreview();

        transform.y += clampDelta(vpRect.top - imgRect.top, deltaY, vpRect.bottom - imgRect.bottom);
        transform.x += clampDelta(vpRect.left - imgRect.left, deltaX, vpRect.right - imgRect.right);

        this.#updateCenterPoint(transform);
        this.#updateOverlayDebounced();
    }

    #initDraggable() {
        let originalX = 0;
        let originalY = 0;
        let pEventCache: PointerEvent[] = [];
        let origPinchDistance = 0;

        let pointerMove = (ev: PointerEvent) => {
            ev.preventDefault();
            const cacheIndex = pEventCache.findIndex((cEv) => cEv.pointerId === ev.pointerId);

            if (cacheIndex === -1) {
                // can occur when pinch gesture initiated with one pointer outside
                // the overlay and then moved inside (particularly in Safari).
                return;
            } else {
                pEventCache[cacheIndex] = ev; // update cached event
            }

            if (pEventCache.length === 2) {
                let touch1 = pEventCache[0];
                let touch2 = pEventCache[1];
                let dist = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);

                if (origPinchDistance === 0) {
                    origPinchDistance = dist / this.#scale;
                }

                this.setZoom(dist / origPinchDistance);
                return;
            } else if (origPinchDistance !== 0) {
                return; // ignore single pointer movement after pinch zoom
            }

            this.#assignTransformCoordinates(ev.pageX - originalX, ev.pageY - originalY);
            originalX = ev.pageX;
            originalY = ev.pageY;
        };

        let pointerUp = (ev: PointerEvent) => {
            const cacheIndex = pEventCache.findIndex((cEv) => cEv.pointerId === ev.pointerId);

            if (cacheIndex !== -1) {
                pEventCache.splice(cacheIndex, 1);
            }

            if (pEventCache.length === 0) {
                this.elements.overlay.removeEventListener("pointermove", pointerMove);
                this.elements.overlay.removeEventListener("pointerup", pointerUp);
                this.elements.overlay.removeEventListener("pointerout", pointerUp);

                this.#setDragState(false, this.elements.preview);
                origPinchDistance = 0;
            }
        };

        let pointerDown = (ev: PointerEvent) => {
            if (ev.button) {
                return; // non-left mouse button press
            }

            ev.preventDefault();
            pEventCache.push(ev);
            this.elements.overlay.setPointerCapture(ev.pointerId);

            if (pEventCache.length > 1) {
                return; // ignore additional pointers
            }

            originalX = ev.pageX;
            originalY = ev.pageY;
            this.#setDragState(true, this.elements.preview);

            this.elements.overlay.addEventListener("pointermove", pointerMove, {
                signal: this.#abortController.signal,
            });
            this.elements.overlay.addEventListener("pointerup", pointerUp, {
                signal: this.#abortController.signal,
            });
            this.elements.overlay.addEventListener("pointerout", pointerUp, {
                signal: this.#abortController.signal,
            });
        };

        this.elements.overlay.addEventListener("pointerdown", pointerDown, {
            signal: this.#abortController.signal,
        });

        if (!this.options.enableKeypress) return;

        const keyDown = (ev: KeyboardEvent) => {
            // for user-input fields we skip
            if ( document.activeElement &&
                ["INPUT", "TEXTAREA", "SELECT", "BUTTON"]
                .includes(document.activeElement.nodeName)) return;

            const deltaXY = getArrowKeyDeltas(ev.key);
            if (deltaXY === null) return; // only care about arrow keys

            if (ev.shiftKey && deltaXY[1]) {
                ev.preventDefault();
                const zoomVal = parseFloat(this.elements.zoomer.value);
                this.setZoom(zoomVal + deltaXY[1]*0.005); // +/-2 *.005 = +/-0.01
            } else {
                ev.preventDefault();
                this.#assignTransformCoordinates(deltaXY[0], deltaXY[1]);
            }
        };

        document.addEventListener("keydown", keyDown, { signal: this.#abortController.signal });
    }

    #initializeZoom() {
        if (this.options.enableZoomSlider) {
            this.elements.zoomer.addEventListener("input", ()=>this.#onZoom(), {
                signal: this.#abortController.signal,
            });
        }
        
        if (this.options.mouseWheelZoom === "off") return;

        const scroll = (ev: WheelEvent) => {
            const optionVal = this.options.mouseWheelZoom;
            let delta = 0;

            if (optionVal === "ctrl" && !ev.ctrlKey) {
                return;
            } else if (ev.deltaY) {
                delta = (ev.deltaY * -1) / 2000;
            }

            ev.preventDefault();
            this.setZoom(this.#scale + delta * this.#scale);
        };

        this.elements.boundary.addEventListener("wheel", scroll, {
            signal: this.#abortController.signal,
        });
    }

    #onZoom() {
        const transform = this.#transformPreview();
        this.#scale = parseFloat(this.elements.zoomer.value);
        transform.scale = this.#scale;

        const boundaries = this.#getVirtualBoundaries();
        const transBoundaries = boundaries.translate;
        const oBoundaries = boundaries.origin;

        if (transform.x >= transBoundaries.maxX) {
            transform.origin.x = oBoundaries.minX;
            transform.x = transBoundaries.maxX;
        }

        if (transform.x <= transBoundaries.minX) {
            transform.origin.x = oBoundaries.maxX;
            transform.x = transBoundaries.minX;
        }

        if (transform.y >= transBoundaries.maxY) {
            transform.origin.y = oBoundaries.minY;
            transform.y = transBoundaries.maxY;
        }

        if (transform.y <= transBoundaries.minY) {
            transform.origin.y = oBoundaries.maxY;
            transform.y = transBoundaries.minY;
        }

        this.#transformPreview(transform);
        this.#updateOverlayDebounced();
    }

    #initializeRotate() {
        if (!this.options.enableRotateBtns) return;

        this.elements.rotateLeft.addEventListener(
            "click",
            () => this.setRotation(this.#rotation - 90),
            { signal: this.#abortController.signal },
        );
        this.elements.rotateRight.addEventListener(
            "click",
            () => this.setRotation(this.#rotation + 90),
            { signal: this.#abortController.signal },
        );
    }

    #replaceImage(img: HTMLImageElement) {
        this.#setPreviewAttributes(img);

        // replace whole child node with new one - prevents caching issues, attach listeners, etc.
        if (this.elements.preview.parentNode) {
            this.elements.preview.parentNode.replaceChild(img, this.elements.preview);
        }
        this.elements.preview = img;
    }

    #setPreviewAttributes(preview: HTMLImageElement) {
        preview.classList.add("cr-image");
        preview.style.background = this.#transparencyColor; // if transparency want this color to show
        preview.setAttribute("alt", "preview");
        this.#setDragState(false, preview);
    }

    #setDragState(isDragging: boolean, preview: HTMLImageElement) {
        preview.setAttribute("aria-grabbed", isDragging.toString());
        this.elements.boundary.setAttribute("aria-dropeffect", isDragging ? "move" : "none");
    }

    #isVisible() {
        return this.elements.preview.offsetParent !== null;
    }

    #updateOverlay() {
        const boundRect = this.elements.boundary.getBoundingClientRect();
        const imgData = this.elements.preview.getBoundingClientRect();
        const overlay = this.elements.overlay;

        overlay.style.width = imgData.width + "px";
        overlay.style.height = imgData.height + "px";
        overlay.style.top = `${imgData.top - boundRect.top}px`;
        overlay.style.left = `${imgData.left - boundRect.left}px`;
    }

    #initPropertiesFromImage(zoom: number | null = null) {
        if (!this.#isVisible()) return;

        // resets values to calculate zoom limits
        const transformReset = { x: 0, y: 0, scale: 1, origin: { x: 0, y: 0 } };
        this.#transformPreview(transformReset);
        this.#updateZoomLimits(zoom);

        transformReset.scale = this.#scale;
        this.#transformPreview(transformReset);
        this.#centerImage();
        this.#updateOverlay();
    }

    #updateCenterPoint(transform: {
        x: number;
        y: number;
        scale: number;
        origin?: { x: number; y: number };
    }) {
        const vpData = this.elements.viewport.getBoundingClientRect();
        const data = this.elements.preview.getBoundingClientRect();
        const { origin } = this.#transformPreview();

        const top = vpData.top - data.top + vpData.height / 2;
        const left = vpData.left - data.left + vpData.width / 2;
        const center = {
            x: Math.round(left / this.#scale),
            y: Math.round(top / this.#scale),
        };

        transform.x = Math.round(transform.x - (center.x - (origin.x ?? 0)) * (1 - this.#scale));
        transform.y = Math.round(transform.y - (center.y - (origin.y ?? 0)) * (1 - this.#scale));

        this.#transformPreview({ ...transform, origin: center });
    }

    #updateZoomLimits(zoom: number | null = null) {
        const img = this.elements.preview;
        const vpData = this.elements.viewport.getBoundingClientRect();
        const minZoom = Math.max(
            vpData.width / img.naturalWidth,
            vpData.height / img.naturalHeight,
        );

        let maxZoom = this.#maxZoom;
        if (minZoom >= maxZoom) {
            maxZoom += minZoom;
        }

        this.elements.zoomer.min = minZoom.toFixed(3);
        this.elements.zoomer.max = maxZoom.toFixed(3);

        if (zoom === null) {
            const bData = this.elements.boundary.getBoundingClientRect();
            zoom = Math.max(bData.width / img.naturalWidth, bData.height / img.naturalHeight);
        }

        this.setZoom(zoom);
    }

    #centerImage() {
        const imgDim = this.elements.preview.getBoundingClientRect();
        const vpDim = this.elements.viewport.getBoundingClientRect();
        const boundDim = this.elements.boundary.getBoundingClientRect();

        const vpLeft = vpDim.left - boundDim.left;
        const vpTop = vpDim.top - boundDim.top;
        const x = vpLeft - (imgDim.width - vpDim.width) / 2;
        const y = vpTop - (imgDim.height - vpDim.height) / 2;

        this.#updateCenterPoint({ x, y, scale: this.#scale });
    }
}

export default Cropt;