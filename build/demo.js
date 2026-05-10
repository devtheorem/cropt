import { Cropt } from "./cropt.js";
function popupResult(src, borderRadius) {
    const imgEl = getElById("result-img");
    imgEl.src = src;
    imgEl.style.cssText = `max-width: min(100%, 320px); max-height: 320px; border-radius: ${borderRadius};`;
    new bootstrap.Modal(getElById("resultModal")).show();
}
let photos = [
    "girl-piano.jpg",
    "hiker.jpg",
    "kitten.jpg",
    "red-panda.webp",
    "toucan.jpg",
    "woman-dog.jpg",
];
const cropElId = "crop-demo";
const resultBtnId = "result-btn";
const outputSize = 500;
let photoSrc = "photos/" + photos[Math.floor(Math.random() * photos.length)];
let boundSrc = photoSrc;
let options = {
    mouseWheelZoom: "on",
    viewport: {
        width: 220,
        height: 220,
        borderRadius: "0px",
    },
    enableResize: false,
    zoomerInputClass: "form-range",
};
let savedState = null;
function getCode() {
    const vp = options.viewport;
    const stateStr = savedState === null
        ? "null"
        : `{ x: ${savedState.x}, y: ${savedState.y}, zoom: ${parseFloat(savedState.zoom.toFixed(3))}, width: ${savedState.width}, height: ${savedState.height} }`;
    const optionStr = `{
    mouseWheelZoom: "${options.mouseWheelZoom}",
    viewport: {
        width: ${vp.width},
        height: ${vp.height},
        borderRadius: "${vp.borderRadius}",
    },
    enableResize: ${options.enableResize},
    zoomerInputClass: "${options.zoomerInputClass}",
}`;
    return `import { Cropt } from "cropt";

const cropEl = document.getElementById("${cropElId}");
const resultBtn = document.getElementById("${resultBtnId}");

let savedState = ${stateStr};

const cropt = new Cropt(cropEl, ${optionStr});

cropt.bind("${photoSrc}", savedState);

resultBtn.addEventListener("click", async () => {
    savedState = cropt.getState(); // for restoring position/size later
    const canvas = await cropt.toCanvas(${outputSize});
    const imgEl = document.getElementById("result-img");
    imgEl.src = canvas.toDataURL();
    new bootstrap.Modal(document.getElementById("resultModal")).show();
});`;
}
function getElById(elementId) {
    const el = document.getElementById(elementId);
    if (el === null) {
        throw new Error(`${elementId} is null`);
    }
    return el;
}
function setCode() {
    const code = getCode();
    getElById("code-el").innerHTML = hljs.highlight(code, { language: "javascript" }).value;
}
function debounce(func, wait) {
    let timer = 0;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(func, wait);
    };
}
const setCodeDebounced = debounce(setCode, 100);
function demoMain() {
    const cropEl = getElById(cropElId);
    const resultBtn = getElById(resultBtnId);
    const restoreStateBtn = getElById("restore-state-btn");
    const cropt = new Cropt(cropEl, options);
    cropt.bind(photoSrc);
    resultBtn.onclick = function () {
        savedState = cropt.getState();
        restoreStateBtn.style.display = "";
        setCode();
        cropt.toCanvas(outputSize).then(function (canvas) {
            popupResult(canvas.toDataURL(), cropt.options.viewport.borderRadius);
        });
    };
    const borderRadiusRange = getElById("borderRadiusRange");
    borderRadiusRange.value = parseInt(options.viewport.borderRadius).toString();
    borderRadiusRange.oninput = function (ev) {
        options.viewport.borderRadius = borderRadiusRange.value + "%";
        setCodeDebounced();
        cropt.setOptions({ viewport: { borderRadius: options.viewport.borderRadius } });
    };
    const enableResizeCheck = getElById("enableResizeCheck");
    enableResizeCheck.checked = options.enableResize;
    enableResizeCheck.onchange = function () {
        options.enableResize = enableResizeCheck.checked;
        setCode();
        cropt.setOptions({ enableResize: options.enableResize });
    };
    restoreStateBtn.onclick = () => {
        cropt.bind(boundSrc, savedState);
    };
    const mouseWheelSelect = getElById("mouseWheelSelect");
    mouseWheelSelect.value = options.mouseWheelZoom;
    mouseWheelSelect.onchange = function (ev) {
        options.mouseWheelZoom = mouseWheelSelect.value;
        setCode();
        cropt.setOptions({ mouseWheelZoom: options.mouseWheelZoom });
    };
    const fileInput = getElById("imgFile");
    fileInput.value = "";
    fileInput.onchange = function () {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            photoSrc = file.name;
            savedState = null;
            restoreStateBtn.style.display = "none";
            setCode();
            const reader = new FileReader();
            reader.onload = (e) => {
                if (typeof e.target?.result === "string") {
                    boundSrc = e.target.result;
                    cropt.bind(boundSrc).then(() => {
                        console.log("upload bind complete");
                    });
                }
            };
            reader.readAsDataURL(file);
        }
    };
    setCode();
}
demoMain();
