import { Cropt } from "./cropt.js";

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

const outputSize = 500;

interface DemoConfig {
    id: string;
    options: {
        viewport: { width: number; height: number; borderRadius: string };
        mouseWheelZoom?: "off" | "on" | "ctrl";
        zoomerInputClass?: string;
        enableZoomSlider?: boolean;
        enableKeypress?: boolean;
        resizeBars?: boolean;
        enableRotateBtns?: boolean;
    };
    preset: null | {
        transform: {
            x: number;
            y: number;
            scale: number;
            rotate: number;
            origin: { x: number; y: number };
        };
        viewport: { width: number; height: number; borderRadius: string };
    };
    hideControls: boolean;
    notes: string;
    getRandomImage: () => string;
}

const demoConfigs: Record<string, DemoConfig> = {
    demo1: {
        id: "crop-demo",
        options: {
            viewport: { width: 220, height: 220, borderRadius: "50%" },
            mouseWheelZoom: "on",
            zoomerInputClass: "form-range",
            enableKeypress: true,
        },
        preset: null,
        hideControls: false,
        notes: "",
        getRandomImage: () => "photos/" + photos[Math.floor(Math.random() * photos.length)],
    },
    demo2: {
        id: "crop-demo-2",
        options: {
            viewport: { width: 1, height: 1, borderRadius: "0%" },
            enableZoomSlider: false,
        },
        preset: {
            transform: {
                x: -857,
                y: -752,
                scale: 0.685,
                rotate: 0,
                origin: { x: 1017.26, y: 911 },
            },
            viewport: {
                width: 252,
                height: 128,
                borderRadius: "33%",
            },
        },
        hideControls: true,
        notes:
            "Passing a previously captured:<br>&nbsp; &nbsp; <code class='language-javascript hljs'>cropt.get()</code> <br>restores viewport " +
            "and image position. See the <br>&nbsp; &nbsp; <code class='language-javascript hljs'>cropt.bind()</code> <br> section. Look in the console.log for output from <b>cropt.get()</b>.",
        getRandomImage: () => "photos/kitten.jpg",
    },
    demo3: {
        id: "crop-demo-3",
        options: {
            viewport: { width: 160, height: 220, borderRadius: "7%" },
            resizeBars: true,
            enableRotateBtns: true,
        },
        preset: null,
        hideControls: true,
        notes:
            "Note the <b>grab bars</b> on the viewport, you can manually adjust the sizing of viewport." +
            "<br><br>Note for <b>rotation</b>, if you are using the crop coordinates, <i>you must rotate " +
            "the image FIRST</i>, then the crop coordinates apply.",
        getRandomImage: () => "photos/" + photos[Math.floor(Math.random() * photos.length)],
    },
};

let activeDemo = "demo1";
let cropt: Cropt | null = null;
let config = demoConfigs[activeDemo];
let cropEl: HTMLElement | null = null;
let imgSrc = "";

function getCode() {
    const optionStr = JSON.stringify(config.options, undefined, 4);
    let bindPreset = "";
    if (config.preset) {
        bindPreset =
            `\n// Using a preset here (ignoring initial viewport setup):\nconst preset = ${JSON.stringify(config.preset)}` +
            `\n// Pass to bind():`;
    }

    return `import { Cropt } from "cropt"; // npm install cropt

const cropEl = document.getElementById("${config.id}");
const resultBtn = document.getElementById("result-btn");

const cropt = new Cropt(cropEl, ${optionStr});
${bindPreset}
cropt.bind("${imgSrc}"${bindPreset ? ", preset" : ""});

resultBtn.addEventListener("click", () => {${
        bindPreset
            ? `
    // Read the crop & viewport details this way...
    const cropAndViewportInfo = cropt.get();
    console.log(\`Image parameters [cropt.get()]:\`)
    console.log( JSON.stringify(cropAndViewportInfo) );\n`
            : ""
    }
    cropt.toCanvas(${outputSize}).then((canvas) => {
        let url = canvas.toDataURL();
        // Display in modal dialog.
    });
});`;
}

function getElById(elementId: string) {
    const el = document.getElementById(elementId);
    if (el === null) throw new Error(`${elementId} is null`);
    return el;
}

function setCode() {
    const code = getCode();
    getElById("code-el").innerHTML = hljs.highlight(code, { language: "javascript" }).value;
}

function setupControls() {
    const config = demoConfigs[activeDemo];
    const controlsContainer = document.getElementById("controls");
    const notesContainer = document.getElementById("notes");
    if (controlsContainer) controlsContainer.classList.toggle("d-none", config.hideControls);
    if (notesContainer) {
        notesContainer.classList.toggle("d-none", !config.hideControls);
        notesContainer.innerHTML = config.notes;
    }

    if (!config.hideControls) {
        const borderRadiusRange = getElById("borderRadiusRange") as HTMLInputElement;
        borderRadiusRange.value = parseInt(config.options.viewport.borderRadius).toString();

        const widthRange = getElById("widthRange") as HTMLInputElement;
        widthRange.value = config.options.viewport.width.toString();

        const heightRange = getElById("heightRange") as HTMLInputElement;
        heightRange.value = config.options.viewport.height.toString();

        if (config.options.mouseWheelZoom) {
            const mouseWheelSelect = getElById("mouseWheelSelect") as HTMLSelectElement;
            mouseWheelSelect.value = config.options.mouseWheelZoom;
        }
    }
}

function bindControlEvents() {
    const config = demoConfigs[activeDemo];
    if (config.hideControls) return;

    const borderRadiusRange = getElById("borderRadiusRange") as HTMLInputElement;
    borderRadiusRange.oninput = () => {
        const activeConfig = demoConfigs[activeDemo];
        activeConfig.options.viewport.borderRadius = borderRadiusRange.value + "%";
        setCode();
        cropt?.setOptions(activeConfig.options);
    };

    const widthRange = getElById("widthRange") as HTMLInputElement;
    widthRange.oninput = () => {
        const activeConfig = demoConfigs[activeDemo];
        activeConfig.options.viewport.width = Math.round(+widthRange.value);
        setCode();
        cropt?.setOptions(activeConfig.options);
    };

    const heightRange = getElById("heightRange") as HTMLInputElement;
    heightRange.oninput = () => {
        const activeConfig = demoConfigs[activeDemo];
        activeConfig.options.viewport.height = Math.round(+heightRange.value);
        setCode();
        cropt?.setOptions(activeConfig.options);
    };

    const mouseWheelSelect = getElById("mouseWheelSelect") as HTMLSelectElement;
    mouseWheelSelect.onchange = () => {
        const activeConfig = demoConfigs[activeDemo];
        const value = mouseWheelSelect.value as "on" | "off" | "ctrl";
        activeConfig.options.mouseWheelZoom = value;
        setCode();
        cropt?.setOptions(activeConfig.options);
    };
}

function bindFileUpload() {
    const fileInput = getElById("imgFile") as HTMLInputElement;
    fileInput.value = "";

    fileInput.onchange = () => {
        if (fileInput.files?.[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();

            reader.onload = (e) => {
                const result = e.target?.result;
                if (typeof result === "string" && cropt) {
                    cropt.bind(result);
                }
            };

            reader.readAsDataURL(file);
        }
    };
}

function initializeDemo(demoKey: string) {
    config = demoConfigs[demoKey];
    cropEl = getElById(config.id);
    imgSrc = config.getRandomImage();

    // Destroy existing instance if present
    if (cropt) {
        cropt.destroy();
        console.log(`Destroyed prior cropt instance;`);
    }

    // Create new instance
    cropt = new Cropt(cropEl, config.options);
    console.log(`Initialized new Cropt() instance (${demoKey}).`);

    if (config.preset) {
        cropt.bind(imgSrc, config.preset);
    } else {
        cropt.bind(imgSrc);
    }
}

function demoMain() {
    // Initial setup
    initializeDemo("demo1");
    setupControls();
    setCode();
    bindControlEvents();
    bindFileUpload();

    // Setup result button
    const resultBtn = getElById("result-btn");
    resultBtn.onclick = () => {
        if (!cropt) return;
        const cropAndViewportInfo = cropt.get();
        console.log(`Image parameters [cropt.get()]:`, JSON.stringify(cropAndViewportInfo));

        cropt.toCanvas(outputSize).then((canvas: HTMLCanvasElement) => {
            if (cropt) popupResult(canvas.toDataURL(), cropt.options.viewport.borderRadius);
        });
    };

    // Setup tab switching
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach((tab) => {
        tab.addEventListener("shown.bs.tab", (event) => {
            const target = (event.target as HTMLElement).dataset.bsTarget?.substring(1);

            if (target && activeDemo !== target) {
                activeDemo = target;
                initializeDemo(target);
                setupControls();
                setCode();
                if (activeDemo === "demo1") {
                    bindControlEvents();
                    bindFileUpload();
                }
            }
        });
    });
}

demoMain();
