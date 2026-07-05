function setZoomerVal(value, zoomer) {
    const zMin = parseFloat(zoomer.min);
    const zMax = parseFloat(zoomer.max);
    zoomer.value = clamp(value, zMin, zMax).toString();
}
function loadImage(src) {
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
        imageWrap: document.createElement("div"),
        preview: document.createElement("img"),
        overlay: document.createElement("div"),
        zoomerWrap: document.createElement("div"),
        zoomer: document.createElement("input"),
    };
}
const MIN_SIZE = 60;
const arrowKeyDeltas = {
    ArrowLeft: [2, 0],
    ArrowUp: [0, 2],
    ArrowRight: [-2, 0],
    ArrowDown: [0, -2],
};
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function isQuarterTurn(deg) {
    return deg === 90 || deg === 270;
}
/**
 * Returns [width, height] for 0/180 and [height, width] for 90/270.
 */
function swapDims(width, height, deg) {
    return isQuarterTurn(deg) ? [height, width] : [width, height];
}
/**
 * Maps a point from an image's displayed coordinate space to where the same pixel lands
 * after the image content is rotated clockwise by deg (a multiple of 90). oW/oH are the
 * pre-rotation displayed dimensions.
 */
function rotatePoint(x, y, oW, oH, deg) {
    if (deg === 90)
        return [oH - y, x];
    if (deg === 180)
        return [oW - x, oH - y];
    if (deg === 270)
        return [y, oW - x];
    return [x, y];
}
function prefersReducedMotion() {
    return (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
/**
 * Coalesces repeated calls into a single requestAnimationFrame. Owns only the rAF lifecycle;
 * the flush callback runs synchronously inside the frame (and on cancel, at the call site).
 */
function rafBatcher(flush) {
    let rafId = 0;
    return {
        schedule() {
            if (rafId === 0) {
                rafId = requestAnimationFrame(() => {
                    rafId = 0;
                    flush();
                });
            }
        },
        // Returns true if a frame was pending.
        cancel() {
            if (rafId === 0)
                return false;
            cancelAnimationFrame(rafId);
            rafId = 0;
            return true;
        },
    };
}
function clampAxis(val, curOrigin, bounds) {
    if (val >= bounds.translateMax)
        return [bounds.translateMax, bounds.originMin];
    if (val <= bounds.translateMin)
        return [bounds.translateMin, bounds.originMax];
    return [val, curOrigin];
}
function canvasSupportsWebP() {
    // https://caniuse.com/mdn-api_htmlcanvaselement_toblob_type_parameter_webp
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
}
export class Cropt {
    element;
    elements;
    options = {
        mouseWheelZoom: "on",
        viewport: {
            width: 220,
            height: 220,
            borderRadius: "0px",
        },
        enableResize: false,
        enableRotate: false,
        zoomerInputClass: "cr-slider",
        rotateButtonClass: "cr-rotate-btn",
    };
    #boundZoom = null;
    #scale = 1;
    #tx = 0;
    #ty = 0;
    #originX = 0;
    #originY = 0;
    /**
     * The crop viewport's position within the boundary, plus the boundary's size. Its width
     * and height are not cached here — they are always #vpWidth/#vpHeight (the viewport is
     * styled to exactly those), so bottom/right are derived from top/left + those.
     */
    #vpRelRect = {
        top: 0,
        left: 0,
        boundWidth: 0,
        boundHeight: 0,
    };
    #keyDownHandler = null;
    #resizeHandles = null;
    #rotateBtns = null;
    #rotation = 0;
    #rotateAnims = [];
    #previewCssWidth = 0;
    #previewCssHeight = 0;
    #vpWidth = 0;
    #vpHeight = 0;
    constructor(element, options) {
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
        this.elements.imageWrap.classList.add("cr-image-wrap");
        this.elements.preview.classList.add("cr-image");
        this.elements.viewport.classList.add("cr-viewport");
        this.elements.overlay.classList.add("cr-overlay");
        this.elements.viewport.setAttribute("tabindex", "0");
        this.elements.preview.alt = "";
        this.#setDragState(false);
        this.elements.imageWrap.appendChild(this.elements.preview);
        this.elements.boundary.appendChild(this.elements.imageWrap);
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
        this.#initKeyboard();
        this.#initializeZoom();
        if (this.options.enableResize) {
            this.#initResizeHandles();
        }
        if (this.options.enableRotate) {
            this.#initRotationButtons();
        }
    }
    /**
     * Bind an image from an src string, and optionally restore saved state.
     * Returns a Promise which resolves when the image has been loaded and state is initialized.
     */
    async bind(src, state = null) {
        if (!src) {
            throw new Error("src cannot be empty");
        }
        // continue accepting a number as the second parameter for backwards compatibility
        const stateIsZoom = typeof state === "number";
        // The full saved state, or null when restoring only a zoom number (or nothing).
        const cropState = stateIsZoom ? null : state;
        const rotation = cropState?.rotation ?? 0;
        this.#stopRotateAnim();
        this.elements.boundary.classList.add("cr-loading");
        try {
            const img = await loadImage(src);
            // Pre-decode before swapping the preview src so it appears without a flash.
            await img.decode();
            this.elements.preview.src = src;
            // Commit state only after async operations succeed. Rotation is applied as a CSS
            // transform via #applyImageLayout (no rasterization); the preview always holds the
            // unrotated original, and rotation is baked into pixels only at export time.
            this.#boundZoom = stateIsZoom ? state : (cropState?.zoom ?? null);
            this.#rotation = rotation;
            [this.#previewCssWidth, this.#previewCssHeight] = swapDims(img.naturalWidth, img.naturalHeight, rotation);
            this.#applyImageLayout();
        }
        finally {
            this.elements.boundary.classList.remove("cr-loading");
        }
        if (cropState !== null) {
            this.#vpWidth = cropState.width;
            this.#vpHeight = cropState.height;
        }
        else {
            this.#vpWidth = this.options.viewport.width;
            this.#vpHeight = this.options.viewport.height;
            if (this.options.enableResize) {
                this.#fitViewportToImage();
            }
        }
        this.#setOptionsCss();
        this.#updatePropertiesFromImage();
        if (cropState !== null) {
            const points = this.#getPoints();
            this.#assignTransformCoordinates((points.left - cropState.x) * this.#scale, (points.top - cropState.y) * this.#scale);
        }
    }
    /**
     * Returns the current crop state, which can be passed to bind() to restore it later.
     */
    getState() {
        const points = this.#getPoints();
        return {
            x: points.left,
            y: points.top,
            zoom: this.#scale,
            width: this.#vpWidth,
            height: this.#vpHeight,
            rotation: this.#rotation,
        };
    }
    #getPoints() {
        const imgData = this.elements.imageWrap.getBoundingClientRect();
        const vpData = this.elements.viewport.getBoundingClientRect();
        const left = vpData.left - imgData.left;
        const top = vpData.top - imgData.top;
        return {
            left: this.#getPoint(left),
            top: this.#getPoint(top),
            right: this.#getPoint(left + vpData.width),
            bottom: this.#getPoint(top + vpData.height),
        };
    }
    #getPoint(pos) {
        return Math.round(Math.max(0, pos / this.#scale));
    }
    /**
     * Returns a Promise resolving to an HTMLCanvasElement object for the cropped image.
     * If size is specified, the image will be scaled with its longest side set to size.
     */
    toCanvas(size = null) {
        const ratio = this.#vpWidth / this.#vpHeight;
        const points = this.#getPoints();
        let width = points.right - points.left;
        let height = points.bottom - points.top;
        if (size !== null) {
            if (ratio > 1) {
                width = size;
                height = size / ratio;
            }
            else {
                height = size;
                width = size * ratio;
            }
        }
        return Promise.resolve(this.#getCanvas(points, width, height));
    }
    async toBlob(size = null, type = "image/webp", quality = 1) {
        if (type === "image/webp" && quality < 1 && !canvasSupportsWebP()) {
            type = "image/jpeg";
        }
        const canvas = await this.toCanvas(size);
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob === null) {
                    reject(new Error("Canvas blob is null"));
                }
                else {
                    resolve(blob);
                }
            }, type, quality);
        });
    }
    refresh() {
        this.#updatePropertiesFromImage();
    }
    /**
     * Rotates the image by the specified degrees (must be a multiple of 90).
     * Returns a Promise that resolves once the rotation is complete.
     */
    async rotate(degrees) {
        if (degrees % 90 !== 0) {
            throw new Error("degrees must be a multiple of 90");
        }
        // Normalize to a positive clockwise rotation in [0, 360].
        const deg = ((degrees % 360) + 360) % 360;
        // Return early if no rotation or no image bound yet.
        if (deg === 0 || this.#previewCssWidth === 0)
            return;
        // Cancel any in-flight rotation so the static transform (and #getPoints, which the
        // commit reads) reflects the committed state rather than a mid-animation transform.
        this.#stopRotateAnim();
        // The shortest signed visual step (-90, 90, or ±180) so a CCW rotation animates the
        // short way rather than spinning 270° the other direction.
        const signedStep = ((deg + 180) % 360) - 180;
        this.#commitRotation(deg);
        if (!this.#isVisible() || prefersReducedMotion())
            return;
        const anim = this.#animateRotation(signedStep);
        try {
            await anim.finished;
        }
        catch {
            // The animation was cancelled (e.g. superseded by another rotation) — the final
            // state is already committed, so resolve normally.
        }
    }
    /**
     * Synchronously updates all numeric state so the same image content stays under the
     * (now W/H-swapped) crop frame. Because a rigid rotation about the viewport center
     * preserves the crop region, staying within the image bounds is automatic.
     */
    #commitRotation(deg) {
        const oWidth = this.#previewCssWidth;
        const oHeight = this.#previewCssHeight;
        // Captured before the swap, while the DOM still reflects the pre-rotation crop.
        const points = this.#isVisible() ? this.#getPoints() : null;
        [this.#vpWidth, this.#vpHeight] = swapDims(this.#vpWidth, this.#vpHeight, deg);
        [this.#previewCssWidth, this.#previewCssHeight] = swapDims(oWidth, oHeight, deg);
        this.#rotation = (this.#rotation + deg) % 360;
        this.#setOptionsCss();
        this.#applyImageLayout();
        if (points !== null) {
            this.#cacheViewportRect();
            const vp = this.#vpRelRect;
            // The crop rect's opposite corners, mapped into the new orientation. Their
            // min is the reoriented top-left; a rigid rotation preserves the crop's size,
            // so #scale is left unchanged.
            const [ax, ay] = rotatePoint(points.left, points.top, oWidth, oHeight, deg);
            const [bx, by] = rotatePoint(points.right, points.bottom, oWidth, oHeight, deg);
            // Anchor that corner to the viewport's top-left. Using it as the transform
            // origin makes the scale terms cancel out of the translation.
            this.#originX = Math.min(ax, bx);
            this.#originY = Math.min(ay, by);
            this.#tx = vp.left - this.#originX;
            this.#ty = vp.top - this.#originY;
            // Rotation preserves the zoom level and (by symmetry of the swapped dimensions)
            // the zoom range, so neither needs recomputing. Re-running #onZoom at the current
            // scale is a visual no-op but repositions the origin to the viewport-center image
            // point, so the next slider move zooms about the center instead of the corner
            // anchor used above for the clamp.
            this.setZoom(this.#scale);
        }
        this.#boundZoom = this.#scale;
    }
    /**
     * Rigidly rotates the framed scene (image wrapper + crop frame) about the viewport
     * center, from the previous orientation back to the already-committed one, so the same
     * pixels stay inside the frame at every instant. Both elements share the identical
     * `rotate(α)` about the viewport center, keeping them locked together.
     */
    #animateRotation(signedStep) {
        const vp = this.#vpRelRect;
        const s = this.#scale;
        // The committed wrapper transform expressed as a matrix about origin 0 0, so the
        // prefixed rotation composes cleanly (its own transform-origin would otherwise apply).
        const [ix, iy] = this.#imgTopLeft();
        const m = `matrix(${s}, 0, 0, ${s}, ${ix}, ${iy})`;
        // Wrapper local coords coincide with boundary coords (it sits at top:0/left:0).
        const cx = vp.left + this.#vpWidth / 2;
        const cy = vp.top + this.#vpHeight / 2;
        // The viewport's local origin is its own top-left, so its center is its half-size.
        const vcx = this.#vpWidth / 2;
        const vcy = this.#vpHeight / 2;
        const opts = { duration: 250, easing: "ease-in-out" };
        // Keyframes that rotate about (px, py) from the previous orientation back to the
        // committed one (rotate(0)). The optional suffix is the element's committed transform.
        const spin = (px, py, suffix = "") => [-signedStep, 0].map((ang) => ({
            transformOrigin: "0 0",
            transform: `translate(${px}px, ${py}px) rotate(${ang}deg) translate(${-px}px, ${-py}px) ${suffix}`,
        }));
        // The crop frame and the resize-handles container share the viewport's center and
        // size, so the same rotation about that center keeps the handles locked to the frame.
        const wrapAnim = this.elements.imageWrap.animate(spin(cx, cy, m), opts);
        const frameAnims = this.#frameElements().map((el) => el.animate(spin(vcx, vcy), opts));
        this.#rotateAnims = [wrapAnim, ...frameAnims];
        wrapAnim.addEventListener("finish", () => {
            // Cancelled animations fire "cancel", not "finish", so this only runs on natural
            // completion. Restore the static styles the WAAPI fill was masking.
            if (this.#rotateAnims[0] !== wrapAnim)
                return;
            this.#restoreStaticTransforms();
            this.#rotateAnims = [];
        });
        return wrapAnim;
    }
    /**
     * Elements that make up the on-screen crop frame: the viewport and, when present, the
     * resize-handles container. Both rotate rigidly with the image during a rotation.
     */
    #frameElements() {
        const els = [this.elements.viewport];
        if (this.#resizeHandles)
            els.push(this.#resizeHandles);
        return els;
    }
    #restoreStaticTransforms() {
        this.#applyTransform();
        for (const el of this.#frameElements()) {
            el.style.transform = "";
            el.style.transformOrigin = "";
        }
    }
    #cancelRotateAnims() {
        for (const anim of this.#rotateAnims)
            anim.cancel();
        this.#rotateAnims = [];
    }
    #stopRotateAnim() {
        if (this.#rotateAnims.length === 0)
            return;
        this.#cancelRotateAnims();
        this.#restoreStaticTransforms();
    }
    #mergeOptions(options) {
        const viewport = { ...this.options.viewport, ...options.viewport };
        this.options = { ...this.options, ...options, viewport };
    }
    setOptions(options) {
        const curWidth = this.#vpWidth;
        const curHeight = this.#vpHeight;
        const hadResize = this.options.enableResize;
        const hadRotateBtns = this.options.enableRotate;
        this.#mergeOptions(options);
        if (options.viewport?.width !== undefined)
            this.#vpWidth = this.options.viewport.width;
        if (options.viewport?.height !== undefined)
            this.#vpHeight = this.options.viewport.height;
        this.#setOptionsCss();
        this.#cacheViewportRect();
        if (this.options.enableResize && !hadResize) {
            this.#initResizeHandles();
        }
        else if (!this.options.enableResize && hadResize) {
            this.#removeResizeHandles();
        }
        if (this.options.enableRotate && !hadRotateBtns) {
            this.#initRotationButtons();
        }
        else if (!this.options.enableRotate && hadRotateBtns) {
            this.#removeRotationButtons();
        }
        if (this.#vpWidth !== curWidth || this.#vpHeight !== curHeight) {
            this.#updateZoomLimits();
        }
    }
    setZoom(value) {
        setZoomerVal(value, this.elements.zoomer);
        const event = new Event("input");
        this.elements.zoomer.dispatchEvent(event); // triggers this.#onZoom call
    }
    destroy() {
        if (this.#keyDownHandler) {
            document.removeEventListener("keydown", this.#keyDownHandler);
        }
        this.#cancelRotateAnims();
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
        if (this.#rotateBtns) {
            for (const btn of this.#rotateBtns) {
                btn.className = this.options.rotateButtonClass;
            }
        }
    }
    /**
     * Returns the displayed (rotation-baked) image, matching what #getPoints measures.
     * The preview <img> holds the unrotated original — rotation is applied via CSS during
     * interaction and rasterized here, onto a canvas about its center, only at export time.
     */
    #getRotatedSource() {
        const img = this.elements.preview;
        if (this.#rotation === 0)
            return img;
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = swapDims(img.naturalWidth, img.naturalHeight, this.#rotation);
        const ctx = canvas.getContext("2d");
        if (ctx === null)
            throw new Error("Canvas context cannot be null");
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((this.#rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        return canvas;
    }
    #getUnscaledCanvas(p) {
        const sWidth = p.right - p.left;
        const sHeight = p.bottom - p.top;
        const canvas = document.createElement("canvas");
        canvas.width = sWidth;
        canvas.height = sHeight;
        const ctx = canvas.getContext("2d");
        if (ctx === null)
            throw new Error("Canvas context cannot be null");
        const el = this.#getRotatedSource();
        ctx.drawImage(el, p.left, p.top, sWidth, sHeight, 0, 0, sWidth, sHeight);
        return canvas;
    }
    #getCanvas(points, width, height) {
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
            const curWidth = cur.width;
            const curHeight = cur.height;
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
        const vp = this.#vpRelRect;
        const natWidth = this.#previewCssWidth;
        const natHeight = this.#previewCssHeight;
        const originMinX = this.#vpWidth / 2 / scale;
        const originMinY = this.#vpHeight / 2 / scale;
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
    /**
     * Writes the numeric transform state to the DOM. Must stay synchronous (no await, no
     * requestAnimationFrame): callers read getBoundingClientRect() or swap the image src on
     * the next line and rely on this transform already being applied.
     */
    #applyTransform() {
        const wrap = this.elements.imageWrap;
        wrap.style.transform = `translate(${this.#tx}px, ${this.#ty}px) scale(${this.#scale})`;
        wrap.style.transformOrigin = `${this.#originX}px ${this.#originY}px`;
    }
    /**
     * Boundary-space position of the image's top-left corner under the current transform.
     */
    #imgTopLeft() {
        return [
            this.#originX * (1 - this.#scale) + this.#tx,
            this.#originY * (1 - this.#scale) + this.#ty,
        ];
    }
    /**
     * Sizes the wrapper to the displayed (rotation-swapped) dimensions, and centers the
     * unrotated <img> within it rotated by #rotation. Because the img is centered on the
     * wrapper's center and rotation preserves that center, a quarter-turn img's bounding
     * box exactly fills the wrapper (no gap or overflow).
     */
    #applyImageLayout() {
        const wrap = this.elements.imageWrap;
        const img = this.elements.preview;
        // Natural (unrotated) dims = displayed dims swapped back when rotated a quarter turn.
        // Derived rather than read from img.naturalWidth so the layout is correct even before
        // the bitmap finishes loading during bind().
        const [natWidth, natHeight] = swapDims(this.#previewCssWidth, this.#previewCssHeight, this.#rotation);
        wrap.style.width = this.#previewCssWidth + "px";
        wrap.style.height = this.#previewCssHeight + "px";
        img.style.width = natWidth + "px";
        img.style.height = natHeight + "px";
        img.style.left = (this.#previewCssWidth - natWidth) / 2 + "px";
        img.style.top = (this.#previewCssHeight - natHeight) / 2 + "px";
        img.style.transform = `rotate(${this.#rotation}deg)`;
    }
    #assignTransformCoordinates(deltaX, deltaY) {
        const scale = this.#scale;
        const vp = this.#vpRelRect;
        // Origin is left unchanged here; only the translation is clamped and updated.
        const [imgRelLeft, imgRelTop] = this.#imgTopLeft();
        const imgRelBottom = imgRelTop + this.#previewCssHeight * scale;
        const imgRelRight = imgRelLeft + this.#previewCssWidth * scale;
        const clampY = clamp(deltaY, vp.top + this.#vpHeight - imgRelBottom, vp.top - imgRelTop);
        const clampX = clamp(deltaX, vp.left + this.#vpWidth - imgRelRight, vp.left - imgRelLeft);
        this.#ty += clampY;
        this.#tx += clampX;
        this.#applyTransform();
    }
    #cacheViewportRect() {
        const vpRect = this.elements.viewport.getBoundingClientRect();
        const boundRect = this.elements.boundary.getBoundingClientRect();
        this.#vpRelRect = {
            top: vpRect.top - boundRect.top,
            left: vpRect.left - boundRect.left,
            boundWidth: boundRect.width,
            boundHeight: boundRect.height,
        };
    }
    #initDraggable() {
        let originalX = 0;
        let originalY = 0;
        let pEventCache = [];
        let lastPinchDist = 0;
        let lastMidX = 0;
        let lastMidY = 0;
        let pendingDeltaX = 0;
        let pendingDeltaY = 0;
        let flushPending = () => {
            this.#assignTransformCoordinates(pendingDeltaX, pendingDeltaY);
            pendingDeltaX = 0;
            pendingDeltaY = 0;
        };
        const batch = rafBatcher(flushPending);
        let pointerMove = (ev) => {
            ev.preventDefault();
            const cacheIndex = pEventCache.findIndex((cEv) => cEv.pointerId === ev.pointerId);
            if (cacheIndex === -1) {
                // can occur when pinch gesture initiated with one pointer outside
                // the overlay and then moved inside (particularly in Safari).
                return;
            }
            else {
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
            }
            else if (lastPinchDist !== 0) {
                return; // ignore single pointer movement after pinch zoom
            }
            pendingDeltaX += ev.pageX - originalX;
            pendingDeltaY += ev.pageY - originalY;
            originalX = ev.pageX;
            originalY = ev.pageY;
            batch.schedule();
        };
        let pointerUp = (ev) => {
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
                if (batch.cancel() && (pendingDeltaX !== 0 || pendingDeltaY !== 0)) {
                    flushPending();
                }
                this.#setDragState(false);
                lastPinchDist = 0;
            }
        };
        let pointerDown = (ev) => {
            if (ev.button || pEventCache.length >= 2) {
                return; // non-left mouse button press or already tracking 2 touch points
            }
            // A new interaction supersedes any in-flight rotation animation, which otherwise
            // masks the wrapper's inline transform until it finishes.
            this.#stopRotateAnim();
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
            this.#setDragState(true);
            this.elements.overlay.addEventListener("pointermove", pointerMove);
            this.elements.overlay.addEventListener("pointerup", pointerUp);
            this.elements.overlay.addEventListener("pointercancel", pointerUp);
        };
        this.elements.overlay.addEventListener("pointerdown", pointerDown);
    }
    #initKeyboard() {
        const keyDown = (ev) => {
            if (document.activeElement !== this.elements.viewport) {
                return;
            }
            if (ev.shiftKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
                ev.preventDefault();
                let zoomVal = parseFloat(this.elements.zoomer.value);
                let stepVal = ev.key === "ArrowUp" ? 0.01 : -0.01;
                this.setZoom(zoomVal + stepVal);
            }
            else if (ev.key in arrowKeyDeltas) {
                ev.preventDefault();
                this.#stopRotateAnim();
                let [deltaX, deltaY] = arrowKeyDeltas[ev.key];
                this.#assignTransformCoordinates(deltaX, deltaY);
            }
        };
        document.addEventListener("keydown", keyDown);
        this.#keyDownHandler = keyDown;
    }
    #initResizeHandles() {
        if (this.#resizeHandles)
            return;
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
        if (!this.#resizeHandles)
            return;
        this.elements.boundary.removeChild(this.#resizeHandles);
        this.#resizeHandles = null;
    }
    #makeRotateBtn(isLeft) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this.options.rotateButtonClass;
        btn.setAttribute("aria-label", isLeft ? "Rotate counterclockwise" : "Rotate clockwise");
        btn.innerHTML = isLeft
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 -1 16 16" aria-hidden="true" style="display:block"><path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 -1 16 16" aria-hidden="true" style="display:block"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>`;
        btn.addEventListener("click", () => this.rotate(isLeft ? -90 : 90));
        return btn;
    }
    #initRotationButtons() {
        if (this.#rotateBtns)
            return;
        const left = this.#makeRotateBtn(true);
        const right = this.#makeRotateBtn(false);
        this.elements.zoomerWrap.insertBefore(left, this.elements.zoomer);
        this.elements.zoomerWrap.appendChild(right);
        this.#rotateBtns = [left, right];
    }
    #removeRotationButtons() {
        if (!this.#rotateBtns)
            return;
        for (const btn of this.#rotateBtns) {
            this.elements.zoomerWrap.removeChild(btn);
        }
        this.#rotateBtns = null;
    }
    #initHandleDrag(handle, direction) {
        handle.addEventListener("pointerdown", (ev) => {
            if (ev.button)
                return;
            ev.preventDefault();
            ev.stopPropagation();
            this.#stopRotateAnim();
            const origX = ev.pageX;
            const origY = ev.pageY;
            const origW = this.#vpWidth;
            const origH = this.#vpHeight;
            handle.setPointerCapture(ev.pointerId);
            const isHoriz = direction === "e" || direction === "w";
            const sign = direction === "e" || direction === "s" ? 1 : -1;
            let pendingEv = null;
            const flushPending = () => {
                if (pendingEv === null)
                    return;
                const ev = pendingEv;
                pendingEv = null;
                const [optMaxW, optMaxH] = this.#effectiveViewportMax();
                const [pointerDelta, origSize, maxSize] = isHoriz
                    ? [ev.pageX - origX, origW, optMaxW]
                    : [ev.pageY - origY, origH, optMaxH];
                const newSize = Math.round(clamp(origSize + 2 * sign * pointerDelta, MIN_SIZE, maxSize));
                if (isHoriz) {
                    this.#vpWidth = newSize;
                }
                else {
                    this.#vpHeight = newSize;
                }
                this.#setOptionsCss();
                this.#cacheViewportRect();
                this.#setZoomRange();
                this.setZoom(this.#scale);
            };
            const batch = rafBatcher(flushPending);
            const onMove = (ev) => {
                ev.preventDefault();
                pendingEv = ev;
                batch.schedule();
            };
            const ac = new AbortController();
            const onUp = () => {
                if (batch.cancel())
                    flushPending();
                ac.abort();
            };
            handle.addEventListener("pointermove", onMove, { signal: ac.signal });
            handle.addEventListener("pointerup", onUp, { signal: ac.signal });
            handle.addEventListener("pointercancel", onUp, { signal: ac.signal });
        });
    }
    #initializeZoom() {
        let scroll = (ev) => {
            const optionVal = this.options.mouseWheelZoom;
            let delta = 0;
            if (optionVal === "off" || (optionVal === "ctrl" && !ev.ctrlKey)) {
                return;
            }
            else if (ev.deltaY) {
                let rawDelta = ev.deltaY;
                if (ev.deltaMode === 1)
                    rawDelta *= 40;
                else if (ev.deltaMode === 2)
                    rawDelta *= 800;
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
        this.#stopRotateAnim();
        const vp = this.#vpRelRect;
        this.#scale = parseFloat(this.elements.zoomer.value);
        const scale = this.#scale;
        let tx = this.#tx;
        let ty = this.#ty;
        let ox = this.#originX;
        let oy = this.#originY;
        // Reposition origin to viewport center while keeping the image visually stationary.
        const [imgLeft, imgTop] = this.#imgTopLeft();
        ox = (vp.left - imgLeft + this.#vpWidth / 2) / scale;
        oy = (vp.top - imgTop + this.#vpHeight / 2) / scale;
        tx = imgLeft - ox * (1 - scale);
        ty = imgTop - oy * (1 - scale);
        const { x, y } = this.#getVirtualBoundaries();
        [tx, ox] = clampAxis(tx, ox, x);
        [ty, oy] = clampAxis(ty, oy, y);
        this.#tx = tx;
        this.#ty = ty;
        this.#originX = ox;
        this.#originY = oy;
        this.#applyTransform();
    }
    #setDragState(isDragging) {
        this.elements.preview.setAttribute("aria-grabbed", isDragging.toString());
        this.elements.boundary.setAttribute("aria-dropeffect", isDragging ? "move" : "none");
    }
    #isVisible() {
        return this.elements.imageWrap.offsetParent !== null;
    }
    #updatePropertiesFromImage() {
        if (!this.#isVisible()) {
            return;
        }
        this.#tx = 0;
        this.#ty = 0;
        this.#originX = 0;
        this.#originY = 0;
        this.#scale = 1;
        this.#applyTransform();
        this.#cacheViewportRect();
        this.#updateZoomLimits();
        this.#centerImage();
    }
    /**
     * The option viewport maxima, swapped to match the live frame orientation when the
     * image is rotated a quarter turn (the frame rotates with the image, so its per-axis
     * maximum extent rotates too).
     */
    #effectiveViewportMax() {
        return swapDims(this.options.viewport.width, this.options.viewport.height, this.#rotation);
    }
    /**
     * The zoom at which the bound image just covers the current viewport (the larger of
     * the per-axis cover scales). With a matched aspect ratio this is an exact fit.
     */
    #coverZoom() {
        return Math.max(this.#vpWidth / this.#previewCssWidth, this.#vpHeight / this.#previewCssHeight);
    }
    #setZoomRange() {
        if (this.#previewCssWidth === 0)
            return;
        const [optMaxW, optMaxH] = this.#effectiveViewportMax();
        // Cover the current viewport, but never zoom out so far that the
        // image would be smaller than fitting within the options viewport.
        const minZoom = Math.max(this.#coverZoom(), Math.min(optMaxW / this.#previewCssWidth, optMaxH / this.#previewCssHeight));
        // Scale maxZoom down with the viewport so resizing both dimensions won't
        // crop a smaller image area than the full-size viewport at max zoom.
        const vpScale = Math.max(this.#vpWidth / optMaxW, this.#vpHeight / optMaxH);
        let maxZoom = 0.85 * vpScale;
        if (minZoom >= maxZoom)
            maxZoom += minZoom;
        // min zoom cannot be rounded, or large images won't match the viewport size when zoomed out
        this.elements.zoomer.min = minZoom.toString();
        this.elements.zoomer.max = maxZoom.toString();
    }
    #updateZoomLimits() {
        this.#setZoomRange();
        let zoom = this.#boundZoom;
        if (zoom === null) {
            const vp = this.#vpRelRect;
            zoom = Math.max(vp.boundWidth / this.#previewCssWidth, vp.boundHeight / this.#previewCssHeight);
        }
        this.setZoom(zoom);
    }
    #centerImage() {
        const vp = this.#vpRelRect;
        this.#originX = this.#previewCssWidth / 2;
        this.#originY = this.#previewCssHeight / 2;
        this.#tx = vp.left + this.#vpWidth / 2 - this.#originX;
        this.#ty = vp.top + this.#vpHeight / 2 - this.#originY;
        this.#applyTransform();
    }
    /**
     * Shrinks one viewport dimension (keeping the other at its option maximum) so the
     * viewport's aspect ratio matches the bound image's. Clamped to MIN_SIZE so extreme
     * aspect ratios don't collapse the frame to a sliver. Only called on a fresh bind
     * (no restored state) when enableResize is on, so dragging the shrunk edge back out
     * stays bounded by the option maxima via #effectiveViewportMax.
     */
    #fitViewportToImage() {
        const [optW, optH] = this.#effectiveViewportMax();
        const imgRatio = this.#previewCssWidth / this.#previewCssHeight;
        const vpRatio = optW / optH;
        if (imgRatio > vpRatio) {
            this.#vpWidth = optW;
            this.#vpHeight = clamp(Math.round(optW / imgRatio), MIN_SIZE, optH);
        }
        else {
            this.#vpHeight = optH;
            this.#vpWidth = clamp(Math.round(optH * imgRatio), MIN_SIZE, optW);
        }
        // With matched aspect ratios, this equals minZoom — zooming all the way out
        // fits the whole image inside the viewport.
        this.#boundZoom = this.#coverZoom();
    }
}
