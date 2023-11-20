import { Cropt, type CroptOptions } from "./cropt.js";

declare var hljs: any;
declare var bootstrap: any;

function popupResult(src: string, viewport: string) {
    const resultModal = new bootstrap.Modal(getElById('resultModal'));
    const imgClass = (viewport === "circle") ? "rounded-circle" : "";
    const bodyEl = document.querySelector('#resultModal .modal-body');

    if (bodyEl === null) {
        throw new Error("bodyEl is null");
    }

    bodyEl.innerHTML = `<img src="${src}" class="${imgClass}" style="max-width: 280px; max-height: 280px;" />`;
    resultModal.show();
}

let photos = [
    "girl-piano.jpg",
    "hiker.jpg",
    "kitten.jpg",
    "toucan.jpg",
    "woman-dog.jpg",
];

const cropElId = "crop-demo";
const resultBtnId = "result-btn";
let photoSrc = "photos/" + photos[Math.floor(Math.random() * photos.length)];

let options: CroptOptions = {
    viewport: {
        width: 200,
        height: 200,
        type: "circle",
    },
    mouseWheelZoom: "on",
    zoomerInputClass: "form-range",
};

function getCode() {
    const optionStr = JSON.stringify(options, undefined, 4);

    return `import { Cropt } from "cropt";

const cropEl = document.getElementById("${cropElId}");
const resultBtn = document.getElementById("${resultBtnId}");

const cropt = new Cropt(cropEl, ${optionStr});

cropt.bind("${photoSrc}");

resultBtn.addEventListener("click", () => {
    cropt.toCanvas(400).then((canvas) => {
        let url = canvas.toDataURL();
        // Data URL can be set as the src of an image element.
        // Display in modal dialog.
    });
});`;
}

function getElById(elementId: string) {
    const el = document.getElementById(elementId);

    if (el === null) {
        throw new Error(`${elementId} is null`);
    }

    return el;
}

function setCode() {
    const code = getCode();
    getElById('code-el').innerHTML = hljs.highlight(code, { language: 'javascript' }).value;
}

function demoMain () {
    const cropEl = getElById(cropElId);
    const resultBtn = getElById(resultBtnId);
    const cropt = new Cropt(cropEl, options);
    cropt.bind(photoSrc);

    resultBtn.onclick = function () {
        cropt.toCanvas(400).then(function (canvas) {
            popupResult(canvas.toDataURL(), cropt.options.viewport.type);
        });
    };

    const vpTypeSelect = getElById('viewportType') as HTMLSelectElement;
    vpTypeSelect.value = options.viewport.type;

    vpTypeSelect.onchange = function (ev) {
        options.viewport.type = vpTypeSelect.value as "circle" | "square";
        setCode();
        cropt.setOptions(options);
    };

    const widthRange = getElById('widthRange') as HTMLInputElement;
    widthRange.value = options.viewport.width.toString();

    widthRange.oninput = function (ev) {
        options.viewport.width = +widthRange.value;
        setCode();
        cropt.setOptions(options);
    };

    const heightRange = getElById('heightRange') as HTMLInputElement;
    heightRange.value = options.viewport.height.toString();

    heightRange.oninput = function (ev) {
        options.viewport.height = +heightRange.value;
        setCode();
        cropt.setOptions(options);
    };

    const mouseWheelSelect = getElById('mouseWheelSelect') as HTMLSelectElement;
    mouseWheelSelect.value = options.mouseWheelZoom;

    mouseWheelSelect.onchange = function (ev) {
        options.mouseWheelZoom = mouseWheelSelect.value as "on" | "off" | "ctrl";
        setCode();
        cropt.setOptions(options);
    };

    const fileInput = getElById('imgFile') as HTMLInputElement;
    fileInput.value = "";

    fileInput.onchange = function () {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            photoSrc = file.name;
            setCode();
            const reader = new FileReader();
 
            reader.onload = (e) => {
                if (typeof e.target?.result === "string") {
                    cropt.bind(e.target.result).then(() => {
                        console.log('upload bind complete');
                    });
                }
            }
 
            reader.readAsDataURL(file);
        }
    };

    setCode();
}

demoMain();
