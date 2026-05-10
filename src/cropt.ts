class Transform {
    constructor(
        public x: number,
        public y: number,
        public scale: number,
    ) {}

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
        this.x = parseFloat(x);
        this.y = parseFloat(y);
    }

    toString() {
        return this.x + "px " + this.y + "px";
    }
}

function setZoomerVal(value: number, zoomer: HTMLInputElement) {
    const zMin = parseFloat(zoomer.min);
    const zMax = parseFloat(zoomer.max);

    zoomer.value = Math.max(zMin, Math.min(zMax, value)).toString();
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

const arrowKeyDeltas: Record<string, [number, number]> = {
    ArrowLeft: [2, 0],
    ArrowUp: [0, 2],
    ArrowRight: [-2, 0],
    ArrowDown: [0, -2],
};

function clampDelta(innerDiff: number, delta: number, outerDiff: number) {
    return Math.max(Math.min(innerDiff, delta), outerDiff);
}

interface AxisBounds {
    translateMin: number;
    translateMax: number;
    originMin: number;
    originMax: number;
}

function clampAxis(val: number, curOrigin: number, bounds: AxisBounds): [number, number] {
    if (val >= bounds.translateMax) return [bounds.translateMax, bounds.originMin];
    if (val <= bounds.translateMin) return [bounds.translateMin, bounds.originMax];
    return [val, curOrigin];
}

function canvasSupportsWebP() {
    // https://caniuse.com/mdn-api_htmlcanvaselement_toblob_type_parameter_webp
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
}

type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};

export interface CroptState {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
}

export interface CroptOptions {
    mouseWheelZoom: "off" | "on" | "ctrl";
    viewport: {
        width: number;
        height: number;
        borderRadius: string;
    };
    enableResize: boolean;
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
        enableResize: false,
        zoomerInputClass: "cr-slider",
    };
    #boundZoom: number | null = null;
    #scale = 1;
    #vpRelRect = {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        boundWidth: 0,
        boundHeight: 0,
    };
    #keyDownHandler: ((ev: KeyboardEvent) => void) | null = null;
    #resizeHandles: HTMLDivElement | null = null;
    #vpWidth = 0;
    #vpHeight = 0;
    constructor(element: HTMLElement, options: RecursivePartial<CroptOptions>) {
        if (element.classList.contains("cropt-container")) {
            throw new Error("Cropt is already initialized on this element");
        }

        this.#mergeOptions(options);
        this.#vpWidth = this.options.viewport.width;
        this.#vpHeight = this.options.viewport.height;
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
        this.elements.zoomer.step = "any";
        this.elements.zoomer.value = "1";
        this.elements.zoomer.setAttribute("aria-label", "zoom");

        this.element.appendChild(this.elements.boundary);
        this.element.appendChild(this.elements.zoomerWrap);
        this.elements.zoomerWrap.appendChild(this.elements.zoomer);

        this.#setOptionsCss();
        this.#initDraggable();
        this.#initializeZoom();

        if (this.options.enableResize) {
            this.#initResizeHandles();
        }
    }

    /**
     * Bind an image from an src string, and optionally restore saved state.
     * Returns a Promise which resolves when the image has been loaded and state is initialized.
     */
    bind(src: string, state: CroptState | number | null = null) {
        if (!src) {
            throw new Error("src cannot be empty");
        }

        // continue accepting a number as the second parameter for backwards compatibility
        const stateIsZoom = typeof state === "number";
        this.#boundZoom = stateIsZoom ? state : (state?.zoom ?? null);
        this.elements.boundary.classList.add("cr-loading");

        return loadImage(src).then((img) => {
            this.elements.boundary.classList.remove("cr-loading");
            this.#replaceImage(img);
            if (state !== null && !stateIsZoom) {
                this.#vpWidth = state.width;
                this.#vpHeight = state.height;
                this.#setOptionsCss();
            }
            this.#updatePropertiesFromImage();
            if (state !== null && !stateIsZoom) {
                const points = this.#getPoints();
                this.#assignTransformCoordinates(
                    (points.left - state.x) * this.#scale,
                    (points.top - state.y) * this.#scale,
                );
            }
        });
    }

    /**
     * Returns the current crop state, which can be passed to bind() to restore it later.
     */
    getState(): CroptState {
        const points = this.#getPoints();
        return {
            x: points.left,
            y: points.top,
            zoom: this.#scale,
            width: this.#vpWidth,
            height: this.#vpHeight,
        };
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

    async toBlob(size: number | null = null, type = "image/webp", quality = 1): Promise<Blob> {
        if (type === "image/webp" && quality < 1 && !canvasSupportsWebP()) {
            type = "image/jpeg";
        }

        const canvas = await this.toCanvas(size);
        return new Promise((resolve, reject) => {
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
    }

    refresh() {
        this.#updatePropertiesFromImage();
    }

    #mergeOptions(options: RecursivePartial<CroptOptions>) {
        const viewport = { ...this.options.viewport, ...options.viewport };
        this.options = { ...this.options, ...(options as CroptOptions), viewport };
    }

    setOptions(options: RecursivePartial<CroptOptions>) {
        const curWidth = this.#vpWidth;
        const curHeight = this.#vpHeight;
        const hadResize = this.options.enableResize;

        this.#mergeOptions(options);
        if (options.viewport?.width !== undefined) this.#vpWidth = this.options.viewport.width;
        if (options.viewport?.height !== undefined) this.#vpHeight = this.options.viewport.height;
        this.#setOptionsCss();
        this.#cacheViewportRect();

        if (this.options.enableResize && !hadResize) {
            this.#initResizeHandles();
        } else if (!this.options.enableResize && hadResize) {
            this.#removeResizeHandles();
        }

        if (this.#vpWidth !== curWidth || this.#vpHeight !== curHeight) {
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
        this.#removeResizeHandles();
        this.element.removeChild(this.elements.boundary);
        this.element.classList.remove("cropt-container");
        this.element.removeChild(this.elements.zoomerWrap);
        this.elements = getInitialElements();
    }

    #setOptionsCss() {
        this.elements.zoomer.className = this.options.zoomerInputClass;
        const viewport = this.elements.viewport;
        viewport.style.borderRadius = this.options.viewport.borderRadius;
        viewport.style.width = this.#vpWidth + "px";
        viewport.style.height = this.#vpHeight + "px";
        if (this.#resizeHandles) {
            this.#resizeHandles.style.width = this.#vpWidth + "px";
            this.#resizeHandles.style.height = this.#vpHeight + "px";
        }
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

    #getVirtualBoundaries(): { x: AxisBounds; y: AxisBounds } {
        const scale = this.#scale;
        const vp = this.#vpRelRect;
        const natWidth = this.elements.preview.naturalWidth;
        const natHeight = this.elements.preview.naturalHeight;
        const originMinX = vp.width / 2 / scale;
        const originMinY = vp.height / 2 / scale;
        const translateMaxX = vp.boundWidth / 2 - originMinX;
        const translateMaxY = vp.boundHeight / 2 - originMinY;

        return {
            x: {
                translateMin: translateMaxX - natWidth + 2 * originMinX,
                translateMax: translateMaxX,
                originMin: originMinX,
                originMax: natWidth - originMinX,
            },
            y: {
                translateMin: translateMaxY - natHeight + 2 * originMinY,
                translateMax: translateMaxY,
                originMin: originMinY,
                originMax: natHeight - originMinY,
            },
        };
    }

    #assignTransformCoordinates(deltaX: number, deltaY: number) {
        const transform = Transform.parse(this.elements.preview);
        const curOrigin = new TransformOrigin(this.elements.preview);
        const scale = this.#scale;
        const vp = this.#vpRelRect;

        const imgRelTop = curOrigin.y * (1 - scale) + transform.y;
        const imgRelLeft = curOrigin.x * (1 - scale) + transform.x;
        const imgRelBottom = imgRelTop + this.elements.preview.naturalHeight * scale;
        const imgRelRight = imgRelLeft + this.elements.preview.naturalWidth * scale;

        const clampY = clampDelta(vp.top - imgRelTop, deltaY, vp.bottom - imgRelBottom);
        const clampX = clampDelta(vp.left - imgRelLeft, deltaX, vp.right - imgRelRight);
        transform.y += clampY;
        transform.x += clampX;

        this.elements.preview.style.transform = transform.toString();
    }

    #cacheViewportRect() {
        const vpRect = this.elements.viewport.getBoundingClientRect();
        const boundRect = this.elements.boundary.getBoundingClientRect();
        this.#vpRelRect = {
            top: vpRect.top - boundRect.top,
            left: vpRect.left - boundRect.left,
            bottom: vpRect.bottom - boundRect.top,
            right: vpRect.right - boundRect.left,
            width: vpRect.width,
            height: vpRect.height,
            boundWidth: boundRect.width,
            boundHeight: boundRect.height,
        };
    }

    #initDraggable() {
        let originalX = 0;
        let originalY = 0;
        let pEventCache: PointerEvent[] = [];
        let lastPinchDist = 0;
        let lastMidX = 0;
        let lastMidY = 0;
        let pendingDeltaX = 0;
        let pendingDeltaY = 0;
        let rafId = 0;

        let flushPending = () => {
            this.#assignTransformCoordinates(pendingDeltaX, pendingDeltaY);
            pendingDeltaX = 0;
            pendingDeltaY = 0;
        };

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
                const [p0, p1] = pEventCache;
                const dist = Math.hypot(p0.clientX - p1.clientX, p0.clientY - p1.clientY);
                const midX = (p0.clientX + p1.clientX) / 2;
                const midY = (p0.clientY + p1.clientY) / 2;
                if (lastPinchDist > 0) {
                    this.setZoom(this.#scale * (dist / lastPinchDist));
                    this.#assignTransformCoordinates(midX - lastMidX, midY - lastMidY);
                }
                lastPinchDist = dist;
                lastMidX = midX;
                lastMidY = midY;
                return;
            } else if (lastPinchDist !== 0) {
                return; // ignore single pointer movement after pinch zoom
            }

            pendingDeltaX += ev.pageX - originalX;
            pendingDeltaY += ev.pageY - originalY;
            originalX = ev.pageX;
            originalY = ev.pageY;

            if (rafId === 0) {
                rafId = requestAnimationFrame(() => {
                    rafId = 0;
                    flushPending();
                });
            }
        };

        let pointerUp = (ev: PointerEvent) => {
            const cacheIndex = pEventCache.findIndex((cEv) => cEv.pointerId === ev.pointerId);

            if (cacheIndex !== -1) {
                pEventCache.splice(cacheIndex, 1);
            }

            // First finger lifted during a pinch: reset pinch state and anchor the
            // remaining finger so pointermove resumes drag from its current position
            if (pEventCache.length < 2 && lastPinchDist !== 0) {
                lastPinchDist = 0;
                if (pEventCache.length === 1) {
                    originalX = pEventCache[0].pageX;
                    originalY = pEventCache[0].pageY;
                }
            }

            if (pEventCache.length === 0) {
                this.elements.overlay.removeEventListener("pointermove", pointerMove);
                this.elements.overlay.removeEventListener("pointerup", pointerUp);
                this.elements.overlay.removeEventListener("pointercancel", pointerUp);

                if (rafId !== 0) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                    if (pendingDeltaX !== 0 || pendingDeltaY !== 0) {
                        flushPending();
                    }
                }

                this.#setDragState(false, this.elements.preview);
                lastPinchDist = 0;
            }
        };

        let pointerDown = (ev: PointerEvent) => {
            if (ev.button || pEventCache.length >= 2) {
                return; // non-left mouse button press or already tracking 2 touch points
            }

            // Don't call preventDefault() in pointerdown, since this causes Firefox to only
            // emit pointermove events for subsequent pointers when the first one isn't moving,
            // which breaks pinch-zooming (https://bugzil.la/1729465). touch-action:none and
            // user-select:none on the overlay already prevent scrolling and text selection.
            pEventCache.push(ev);
            this.elements.overlay.setPointerCapture(ev.pointerId);

            if (pEventCache.length > 1) {
                // second touch point: initialize pinch distance and midpoint, skip drag start
                const p0 = pEventCache[0];
                lastPinchDist = Math.hypot(p0.pageX - ev.pageX, p0.pageY - ev.pageY);
                lastMidX = (p0.clientX + ev.clientX) / 2;
                lastMidY = (p0.clientY + ev.clientY) / 2;
                return;
            }

            originalX = ev.pageX;
            originalY = ev.pageY;
            this.#setDragState(true, this.elements.preview);

            this.elements.overlay.addEventListener("pointermove", pointerMove);
            this.elements.overlay.addEventListener("pointerup", pointerUp);
            this.elements.overlay.addEventListener("pointercancel", pointerUp);
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
                let [deltaX, deltaY] = arrowKeyDeltas[ev.key];
                this.#assignTransformCoordinates(deltaX, deltaY);
            }
        };

        this.elements.overlay.addEventListener("pointerdown", pointerDown);
        document.addEventListener("keydown", keyDown);
        this.#keyDownHandler = keyDown;
    }

    #initResizeHandles() {
        if (this.#resizeHandles) return;

        const container = document.createElement("div");
        container.classList.add("cr-resize-handles");
        container.style.width = this.#vpWidth + "px";
        container.style.height = this.#vpHeight + "px";

        for (const dir of ["n", "e", "s", "w"]) {
            const handle = document.createElement("div");
            handle.classList.add("cr-handle", `cr-handle-${dir}`);
            container.appendChild(handle);
            this.#initHandleDrag(handle, dir);
        }

        this.elements.boundary.appendChild(container);
        this.#resizeHandles = container;
    }

    #removeResizeHandles() {
        if (!this.#resizeHandles) return;
        this.elements.boundary.removeChild(this.#resizeHandles);
        this.#resizeHandles = null;
    }

    #initHandleDrag(handle: HTMLDivElement, direction: string) {
        handle.addEventListener("pointerdown", (ev: PointerEvent) => {
            if (ev.button) return;
            ev.preventDefault();
            ev.stopPropagation();

            const origX = ev.pageX;
            const origY = ev.pageY;
            const origW = this.#vpWidth;
            const origH = this.#vpHeight;
            const minSize = 60;

            handle.setPointerCapture(ev.pointerId);

            const isHoriz = direction === "e" || direction === "w";
            const sign = direction === "e" || direction === "s" ? 1 : -1;

            let pendingEv: PointerEvent | null = null;
            let rafId = 0;

            const flushPending = () => {
                if (pendingEv === null) return;
                const ev = pendingEv;
                pendingEv = null;

                const [pointerDelta, origSize, maxSize] = isHoriz
                    ? [ev.pageX - origX, origW, this.options.viewport.width]
                    : [ev.pageY - origY, origH, this.options.viewport.height];
                const newSize = Math.round(
                    Math.max(minSize, Math.min(maxSize, origSize + 2 * sign * pointerDelta)),
                );

                if (isHoriz) {
                    this.#vpWidth = newSize;
                } else {
                    this.#vpHeight = newSize;
                }

                this.#setOptionsCss();
                this.#cacheViewportRect();
                this.#setZoomRange();
                this.setZoom(this.#scale);
            };

            const onMove = (ev: PointerEvent) => {
                ev.preventDefault();
                pendingEv = ev;

                if (rafId === 0) {
                    rafId = requestAnimationFrame(() => {
                        rafId = 0;
                        flushPending();
                    });
                }
            };

            const ac = new AbortController();
            const onUp = () => {
                if (rafId !== 0) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                    flushPending();
                }
                ac.abort();
            };
            handle.addEventListener("pointermove", onMove, { signal: ac.signal });
            handle.addEventListener("pointerup", onUp, { signal: ac.signal });
            handle.addEventListener("pointercancel", onUp, { signal: ac.signal });
        });
    }

    #initializeZoom() {
        let scroll = (ev: WheelEvent) => {
            const optionVal = this.options.mouseWheelZoom;
            let delta = 0;

            if (optionVal === "off" || (optionVal === "ctrl" && !ev.ctrlKey)) {
                return;
            } else if (ev.deltaY) {
                let rawDelta = ev.deltaY;
                if (ev.deltaMode === 1) rawDelta *= 40;
                else if (ev.deltaMode === 2) rawDelta *= 800;
                // Pinch gestures set ctrlKey with small per-frame deltas; ctrl+scroll produces large ones
                const divisor = ev.ctrlKey && Math.abs(rawDelta) < 40 ? 100 : 2000;
                delta = (rawDelta * -1) / divisor;
            }

            ev.preventDefault();
            this.setZoom(this.#scale + delta * this.#scale);
        };

        this.elements.zoomer.addEventListener("input", () => this.#onZoom());
        this.elements.boundary.addEventListener("wheel", scroll);
    }

    #onZoom() {
        const transform = Transform.parse(this.elements.preview);
        const origin = new TransformOrigin(this.elements.preview);
        const vp = this.#vpRelRect;

        this.#scale = parseFloat(this.elements.zoomer.value);
        const scale = this.#scale;
        transform.scale = scale;

        // Reposition origin to viewport center while keeping the image visually stationary.
        const imgLeft = origin.x * (1 - scale) + transform.x;
        const imgTop = origin.y * (1 - scale) + transform.y;
        origin.x = (vp.left - imgLeft + vp.width / 2) / scale;
        origin.y = (vp.top - imgTop + vp.height / 2) / scale;
        transform.x = imgLeft - origin.x * (1 - scale);
        transform.y = imgTop - origin.y * (1 - scale);

        const { x, y } = this.#getVirtualBoundaries();
        [transform.x, origin.x] = clampAxis(transform.x, origin.x, x);
        [transform.y, origin.y] = clampAxis(transform.y, origin.y, y);

        this.elements.preview.style.transform = transform.toString();
        this.elements.preview.style.transformOrigin = origin.toString();
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

    #updatePropertiesFromImage() {
        if (!this.#isVisible()) {
            return;
        }

        const preview = this.elements.preview;
        preview.style.transform = new Transform(0, 0, 1).toString();
        preview.style.transformOrigin = new TransformOrigin().toString();

        this.#cacheViewportRect();
        this.#updateZoomLimits();
        this.#centerImage();
    }

    #setZoomRange() {
        const img = this.elements.preview;
        if (img.naturalWidth === 0) return;
        // Cover the current viewport, but never zoom out so far that the
        // image would be smaller than fitting within the options viewport.
        const minZoom = Math.max(
            this.#vpWidth / img.naturalWidth,
            this.#vpHeight / img.naturalHeight,
            Math.min(
                this.options.viewport.width / img.naturalWidth,
                this.options.viewport.height / img.naturalHeight,
            ),
        );
        // Scale maxZoom down with the viewport so resizing both dimensions won't
        // crop a smaller image area than the full-size viewport at max zoom.
        const vpScale = Math.max(
            this.#vpWidth / this.options.viewport.width,
            this.#vpHeight / this.options.viewport.height,
        );
        let maxZoom = 0.85 * vpScale;
        if (minZoom >= maxZoom) maxZoom += minZoom;
        // min zoom cannot be rounded, or large images won't match the viewport size when zoomed out
        this.elements.zoomer.min = minZoom.toString();
        this.elements.zoomer.max = maxZoom.toString();
    }

    #updateZoomLimits() {
        this.#setZoomRange();
        const img = this.elements.preview;
        let zoom = this.#boundZoom;

        if (zoom === null) {
            const vp = this.#vpRelRect;
            zoom = Math.max(vp.boundWidth / img.naturalWidth, vp.boundHeight / img.naturalHeight);
        }

        this.setZoom(zoom);
    }

    #centerImage() {
        const vp = this.#vpRelRect;
        const preview = this.elements.preview;
        const origin = new TransformOrigin();
        origin.x = preview.naturalWidth / 2;
        origin.y = preview.naturalHeight / 2;
        const transform = new Transform(0, 0, this.#scale);
        transform.x = vp.left + vp.width / 2 - origin.x;
        transform.y = vp.top + vp.height / 2 - origin.y;
        preview.style.transform = transform.toString();
        preview.style.transformOrigin = origin.toString();
    }
}
