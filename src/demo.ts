import { Cropt, type CroptOptions } from "./cropt.js";

declare var hljs: any;
declare var bootstrap: any;

function popupResult(src: string, borderRadius: string) {
    const resultModal = new bootstrap.Modal(getElById("resultModal"));
    const imgStyle = `max-width: min(100%, 320px); max-height: 320px; border-radius: ${borderRadius};`;
    const bodyEl = document.querySelector("#resultModal .modal-body");

    if (bodyEl === null) {
        throw new Error("bodyEl is null");
    }

    bodyEl.innerHTML = `<img src="${src}" style="${imgStyle}" />`;
    resultModal.show();
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

let options: CroptOptions = {
    viewport: {
        width: 220,
        height: 220,
        borderRadius: "50%",
    },
    mouseWheelZoom: "on",
    zoomerInputClass: "form-range",
    resizeBars: true,
};

function getCode() {
    const optionStr = JSON.stringify(options, undefined, 4);

    return `import { Cropt } from "cropt";

const cropEl = document.getElementById("${cropElId}");
const resultBtn = document.getElementById("${resultBtnId}");

const cropt = new Cropt(cropEl, ${optionStr});

cropt.bind("${photoSrc}");

resultBtn.addEventListener("click", () => {
    cropt.toCanvas(${outputSize}).then((canvas) => {
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
    getElById("code-el").innerHTML = hljs.highlight(code, { language: "javascript" }).value;
}

function demoMain() {
    const cropEl = getElById(cropElId);
    const resultBtn = getElById(resultBtnId);
    const cropt = new Cropt(cropEl, options);
    cropt.bind(photoSrc);
    // If wanting to pass in preset image-transform/viewport; do this way:
    // const set = {"transform":{"x":-857,"y":-752,"scale":0.685,"rotate":0,"origin":{"x":1017.26,"y":911}},"viewport":{"width":252,"height":128,"borderRadius":"33%"}}
    // cropt.bind(photoSrc, set);

    resultBtn.onclick = function () {
        const restoreSet = cropt.get();
        console.log( `Image parameters [cropt.get()]:`, JSON.stringify(restoreSet) );

        cropt.toCanvas(outputSize).then(function (canvas) {
            popupResult(canvas.toDataURL(), cropt.options.viewport.borderRadius);
        });
    };

    const borderRadiusRange = getElById("borderRadiusRange") as HTMLInputElement;
    borderRadiusRange.value = parseInt(options.viewport.borderRadius).toString();

    borderRadiusRange.oninput = function (ev) {
        options.viewport.borderRadius = borderRadiusRange.value + "%";
        setCode();
        cropt.setOptions(options);
    };

    const widthRange = getElById("widthRange") as HTMLInputElement;
    widthRange.value = options.viewport.width.toString();

    widthRange.oninput = function (ev) {
        options.viewport.width = +widthRange.value;
        setCode();
        cropt.setOptions(options);
    };

    const heightRange = getElById("heightRange") as HTMLInputElement;
    heightRange.value = options.viewport.height.toString();

    heightRange.oninput = function (ev) {
        options.viewport.height = +heightRange.value;
        setCode();
        cropt.setOptions(options);
    };

    const mouseWheelSelect = getElById("mouseWheelSelect") as HTMLSelectElement;
    mouseWheelSelect.value = options.mouseWheelZoom;

    mouseWheelSelect.onchange = function (ev) {
        options.mouseWheelZoom = mouseWheelSelect.value as "on" | "off" | "ctrl";
        setCode();
        cropt.setOptions(options);
    };

    const fileInput = getElById("imgFile") as HTMLInputElement;
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
