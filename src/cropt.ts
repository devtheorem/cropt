class Transform {
    x: number;
    y: number;
    scale: number;

    constructor(x: number, y: number, scale: number) {
        this.x = x;
        this.y = y;
        this.scale = scale;
    }

    toString() {
        return `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    }

    static parse(img: HTMLImageElement) {
        const values = img.style.transform.split(") ");
        const translate = values[0].substring("translate".length + 1).split(",");
        const scale = values.length > 1 ? values[1].substring(6) : "1";
        const x = translate.length > 1 ? translate[0] : "0";
        const y = translate.length > 1 ? translate[1] : "0";

        return new Transform(parseFloat(x), parseFloat(y), parseFloat(scale));
    }
}

class TransformOrigin {
    x: number;
    y: number;

    constructor(el?: HTMLImageElement) {
        if (!el || !el.style.transformOrigin) {
            this.x = 0;
            this.y = 0;
            return;
        }

        const [x, y] = el.style.transformOrigin.split(" ");
        this.x = parseFloat(x) || 0;
        this.y = parseFloat(y) || 0;
    }

    toString() {
        return this.x + "px " + this.y + "px";
    }
}

function debounce<T extends Function>(func: T, wait: number) {
    let timer: number | undefined;
    return (...args: any) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), wait);
    };
}

function setZoomerVal(value: number, zoomer: HTMLInputElement) {
    const zMin = parseFloat(zoomer.min);
    const zMax = parseFloat(zoomer.max);

    zoomer.value = Math.max(zMin, Math.min(zMax, value)).toFixed(3);
}

function loadImage(src: string): Promise<HTMLImageElement> {
    const img = new Image();

    return new Promise(function (resolve, reject) {
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
        zoomerWrap: document.createElement("div"),
        zoomer: document.createElement("input"),
    };
}

function getArrowKeyDeltas(key: string): [number, number] {
    if (key === "ArrowLeft") {
        return [2, 0];
    } else if (key === "ArrowUp") {
        return [0, 2];
    } else if (key === "ArrowRight") {
        return [-2, 0];
    } else {
        return [0, -2];
    }
}

function clampDelta(innerDiff: number, delta: number, outerDiff: number) {
    return Math.max(Math.min(innerDiff, delta), outerDiff);
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
}

interface CropPoints {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export class Cropt {
    element: HTMLElement;
    elements: {
        boundary: HTMLDivElement;
        viewport: HTMLDivElement;
        preview: HTMLImageElement;
        overlay: HTMLDivElement;
        zoomerWrap: HTMLDivElement;
        zoomer: HTMLInputElement;
    };
    options: CroptOptions = {
        mouseWheelZoom: "on",
        viewport: {
            width: 220,
            height: 220,
            borderRadius: "0px",
        },
        zoomerInputClass: "cr-slider",
    };
    #boundZoom: number | undefined = undefined;
    #scale = 1;
    #keyDownHandler: ((ev: KeyboardEvent) => void) | null = null;
    #zoomInputHandler: (() => void) | null = null;
    #wheelHandler: ((ev: WheelEvent) => void) | null = null;
    #updateOverlayDebounced = debounce(() => {
        this.#updateOverlay();
    }, 100);

    constructor(element: HTMLElement, options: RecursivePartial<CroptOptions>) {
        if (element.classList.contains("cropt-container")) {
            throw new Error("Cropt is already initialized on this element");
        }

        if (options.viewport) {
            options.viewport = { ...this.options.viewport, ...options.viewport };
        }

        this.options = { ...this.options, ...options } as CroptOptions;
        this.element = element;
        this.element.classList.add("cropt-container");

        this.elements = getInitialElements();
        this.elements.zoomerWrap.classList.add("cr-slider-wrap");
        this.elements.boundary.classList.add("cr-boundary");
        this.elements.viewport.classList.add("cr-viewport");
        this.elements.overlay.classList.add("cr-overlay");

        this.elements.viewport.setAttribute("tabindex", "0");
        this.#setPreviewAttributes(this.elements.preview);

        this.elements.boundary.appendChild(this.elements.preview);
        this.elements.boundary.appendChild(this.elements.viewport);
        this.elements.boundary.appendChild(this.elements.overlay);

        this.elements.zoomer.type = "range";
        this.elements.zoomer.step = "0.001";
        this.elements.zoomer.value = "1";
        this.elements.zoomer.setAttribute("aria-label", "zoom");

        this.element.appendChild(this.elements.boundary);
        this.element.appendChild(this.elements.zoomerWrap);
        this.elements.zoomerWrap.appendChild(this.elements.zoomer);

        this.#setOptionsCss();
        this.#initDraggable();
        this.#initializeZoom();
    }

    /**
     * Bind an image from an src string.
     * Returns a Promise which resolves when the image has been loaded and state is initialized.
     */
    bind(src: string, zoom: number | undefined = undefined) {
        if (!src) {
            throw new Error("src cannot be empty");
        }

        this.#boundZoom = zoom;

        return loadImage(src).then((img) => {
            this.#replaceImage(img);
            this.#updatePropertiesFromImage();
        });
    }

    #getPoints() {
        const imgData = this.elements.preview.getBoundingClientRect();
        const vpData = this.elements.viewport.getBoundingClientRect();
        const oWidth = this.elements.viewport.offsetWidth;
        const oHeight = this.elements.viewport.offsetHeight;
        const widthDiff = (vpData.width - oWidth) / 2;
        const heightDiff = (vpData.height - oHeight) / 2;
        const left = vpData.left - imgData.left;
        const top = vpData.top - imgData.top;

        return {
            left: this.#getPoint(left),
            top: this.#getPoint(top),
            right: this.#getPoint(left + oWidth + widthDiff),
            bottom: this.#getPoint(top + oHeight + heightDiff),
        };
    }

    #getPoint(pos: number) {
        return Math.round(Math.max(0, pos / this.#scale));
    }

    /**
     * Returns a Promise resolving to an HTMLCanvasElement object for the cropped image.
     * If size is specified, the image will be scaled with its longest side set to size.
     */
    toCanvas(size: number | null = null) {
        const vpRect = this.elements.viewport.getBoundingClientRect();
        const ratio = vpRect.width / vpRect.height;
        const points = this.#getPoints();
        let width = points.right - points.left;
        let height = points.bottom - points.top;

        if (size !== null) {
            if (ratio > 1) {
                width = size;
                height = size / ratio;
            } else {
                height = size;
                width = size * ratio;
            }
        }

        return Promise.resolve(this.#getCanvas(points, width, height));
    }

    toBlob(size: number | null = null, type = "image/webp", quality = 1): Promise<Blob> {
        if (type === "image/webp" && quality < 1 && !canvasSupportsWebP()) {
            type = "image/jpeg";
        }

        return new Promise((resolve, reject) => {
            this.toCanvas(size).then((canvas) => {
                canvas.toBlob(
                    (blob) => {
                        if (blob === null) {
                            reject("Canvas blob is null");
                        } else {
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
        this.#updatePropertiesFromImage();
    }

    setOptions(options: RecursivePartial<CroptOptions>) {
        const curWidth = this.options.viewport.width;
        const curHeight = this.options.viewport.height;

        // if (options.viewport) {
        //     options.viewport = { ...this.options.viewport, ...options.viewport };
        // }

        // changed: removed structuredClone: slow, and would fail passing functions in options
        this.options = { ...this.options, ...options } as CroptOptions;
        this.#setOptionsCss();

        if (
            this.options.viewport.width !== curWidth ||
            this.options.viewport.height !== curHeight
        ) {
            this.#updateZoomLimits();
        }
    }

    setZoom(value: number) {
        setZoomerVal(value, this.elements.zoomer);
        const event = new Event("input");
        this.elements.zoomer.dispatchEvent(event); // triggers this.#onZoom call
    }

    destroy() {
        if (this.#keyDownHandler) {
            document.removeEventListener("keydown", this.#keyDownHandler);
        }
        if (this.#zoomInputHandler) {
            this.elements.zoomer.removeEventListener("input", this.#zoomInputHandler);
        }
        if (this.#wheelHandler) {
            this.elements.boundary.removeEventListener("wheel", this.#wheelHandler);
        }
        this.element.removeChild(this.elements.boundary);
        this.element.classList.remove("cropt-container");
        this.element.removeChild(this.elements.zoomerWrap);
        this.elements = getInitialElements();
    }

    #setOptionsCss() {
        this.elements.zoomer.className = this.options.zoomerInputClass;
        const viewport = this.elements.viewport;
        viewport.style.borderRadius = this.options.viewport.borderRadius;
        viewport.style.width = this.options.viewport.width + "px";
        viewport.style.height = this.options.viewport.height + "px";
    }

    #getUnscaledCanvas(p: CropPoints) {
        const sWidth = p.right - p.left;
        const sHeight = p.bottom - p.top;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (ctx === null) {
            throw new Error("Canvas context cannot be null");
        }

        canvas.width = sWidth;
        canvas.height = sHeight;
        const el = this.elements.preview;
        ctx.drawImage(el, p.left, p.top, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

        return canvas;
    }

    #getCanvas(points: CropPoints, width: number, height: number) {
        const oc = this.#getUnscaledCanvas(points);
        const octx = oc.getContext("2d");
        const buffer = document.createElement("canvas");
        const bctx = buffer.getContext("2d");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = width;
        canvas.height = height;

        if (ctx === null || octx === null || bctx === null) {
            throw new Error("Canvas context cannot be null");
        }

        let cur = {
            width: oc.width,
            height: oc.height,
        };

        while (cur.width * 0.5 > canvas.width) {
            // step down size by one half for smooth scaling
            let curWidth = cur.width;
            let curHeight = cur.height;

            cur = {
                width: Math.floor(cur.width * 0.5),
                height: Math.floor(cur.height * 0.5),
            };

            // write oc to buffer
            buffer.width = curWidth;
            buffer.height = curHeight;
            bctx.clearRect(0, 0, buffer.width, buffer.height);
            bctx.drawImage(oc, 0, 0);

            // clear oc
            octx.clearRect(0, 0, curWidth, curHeight);

            octx.drawImage(buffer, 0, 0, curWidth, curHeight, 0, 0, cur.width, cur.height);
        }

        ctx.drawImage(oc, 0, 0, cur.width, cur.height, 0, 0, canvas.width, canvas.height);
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
        const transform = Transform.parse(this.elements.preview);

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

            this.elements.overlay.addEventListener("pointermove", pointerMove);
            this.elements.overlay.addEventListener("pointerup", pointerUp);
            this.elements.overlay.addEventListener("pointerout", pointerUp);
        };

        let keyDown = (ev: KeyboardEvent) => {
            if (document.activeElement !== this.elements.viewport) {
                return;
            }

            if (ev.shiftKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
                ev.preventDefault();
                let zoomVal = parseFloat(this.elements.zoomer.value);
                let stepVal = ev.key === "ArrowUp" ? 0.01 : -0.01;
                this.setZoom(zoomVal + stepVal);
            } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key)) {
                ev.preventDefault();
                let [deltaX, deltaY] = getArrowKeyDeltas(ev.key);
                this.#assignTransformCoordinates(deltaX, deltaY);
            }
        };

        this.elements.overlay.addEventListener("pointerdown", pointerDown);
        document.addEventListener("keydown", keyDown);
        this.#keyDownHandler = keyDown;
    }

    #initializeZoom() {
        let change = () => {
            this.#onZoom();
        };

        let scroll = (ev: WheelEvent) => {
            const optionVal = this.options.mouseWheelZoom;
            let delta = 0;

            if (optionVal === "off" || (optionVal === "ctrl" && !ev.ctrlKey)) {
                return;
            } else if (ev.deltaY) {
                delta = (ev.deltaY * -1) / 2000;
            }

            ev.preventDefault();
            this.setZoom(this.#scale + delta * this.#scale);
        };

        this.elements.zoomer.addEventListener("input", change);
        this.elements.boundary.addEventListener("wheel", scroll);
        this.#zoomInputHandler = change;
        this.#wheelHandler = scroll;
    }

    #onZoom() {
        const transform = Transform.parse(this.elements.preview);
        const origin = new TransformOrigin(this.elements.preview);

        let applyCss = () => {
            this.elements.preview.style.transform = transform.toString();
            this.elements.preview.style.transformOrigin = origin.toString();
        };

        this.#scale = parseFloat(this.elements.zoomer.value);
        transform.scale = this.#scale;
        applyCss();

        const boundaries = this.#getVirtualBoundaries();
        const transBoundaries = boundaries.translate;
        const oBoundaries = boundaries.origin;

        if (transform.x >= transBoundaries.maxX) {
            origin.x = oBoundaries.minX;
            transform.x = transBoundaries.maxX;
        }

        if (transform.x <= transBoundaries.minX) {
            origin.x = oBoundaries.maxX;
            transform.x = transBoundaries.minX;
        }

        if (transform.y >= transBoundaries.maxY) {
            origin.y = oBoundaries.minY;
            transform.y = transBoundaries.maxY;
        }

        if (transform.y <= transBoundaries.minY) {
            origin.y = oBoundaries.maxY;
            transform.y = transBoundaries.minY;
        }

        applyCss();
        this.#updateOverlayDebounced();
    }

    #replaceImage(img: HTMLImageElement) {
        this.#setPreviewAttributes(img);
        if (this.elements.preview.parentNode) {
            this.elements.preview.parentNode.replaceChild(img, this.elements.preview);
        }
        this.elements.preview = img;
    }

    #setPreviewAttributes(preview: HTMLImageElement) {
        preview.classList.add("cr-image");
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

    #updatePropertiesFromImage() {
        if (!this.#isVisible()) {
            return;
        }

        const preview = this.elements.preview;
        const transformReset = new Transform(0, 0, 1);
        preview.style.transform = transformReset.toString();
        preview.style.transformOrigin = new TransformOrigin().toString();

        this.#updateZoomLimits();
        transformReset.scale = this.#scale;
        preview.style.transform = transformReset.toString();
        preview.style.transformOrigin = new TransformOrigin().toString();

        this.#centerImage();
        this.#updateOverlay();
    }

    #updateCenterPoint(transform: Transform) {
        const vpData = this.elements.viewport.getBoundingClientRect();
        const data = this.elements.preview.getBoundingClientRect();
        const curPos = new TransformOrigin(this.elements.preview);

        const top = vpData.top - data.top + vpData.height / 2;
        const left = vpData.left - data.left + vpData.width / 2;
        const center = {
            x: left / this.#scale,
            y: top / this.#scale,
        };

        transform.x -= (center.x - curPos.x) * (1 - this.#scale);
        transform.y -= (center.y - curPos.y) * (1 - this.#scale);

        this.elements.preview.style.transform = transform.toString();
        this.elements.preview.style.transformOrigin = center.x + "px " + center.y + "px";
    }

    #updateZoomLimits() {
        const img = this.elements.preview;
        const vpData = this.elements.viewport.getBoundingClientRect();
        const minZoom = Math.max(
            vpData.width / img.naturalWidth,
            vpData.height / img.naturalHeight,
        );

        let maxZoom = 0.85;
        if (minZoom >= maxZoom) {
            maxZoom += minZoom;
        }

        this.elements.zoomer.min = minZoom.toFixed(3);
        this.elements.zoomer.max = maxZoom.toFixed(3);
        let zoom = this.#boundZoom;

        if (zoom === undefined) {
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

        this.#updateCenterPoint(new Transform(x, y, this.#scale));
    }
}
