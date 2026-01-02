// install locally in a project, ex: npm i cropt2
// import Cropt from "cropt2";

// access via CDN like this (for modules note 'esm')
import Cropt from 'https://unpkg.com/cropt2@latest?module';

/* bootstrap tabs + modal -------------------------------------- */
document.addEventListener('click', e => {
    const btn = e.target.closest('[data-bs-toggle="tab"]');
    if (!btn) return;
    e.preventDefault();

    const nav = btn.closest('.nav');
    const target = document.querySelector(btn.dataset.bsTarget);
    
    nav.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('show','active'));

    btn.classList.add('active');
    target.classList.add('show','active');

    // initialize this demo when tab changed!
    demoSwitch( target.id )
});

document.getElementById('resultModalClose').addEventListener('click', 
    ()=>closeModal(getElById("resultModal")) )

function openModal(modal) {
    modal.classList.add('show');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
}

function closeModal(modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

/* DEMO Code --------------------------------------------------- */

function popupResult(src, borderRadius) {
    const imgStyle = `max-width: min(100%, 320px); max-height: 320px; border-radius: ${borderRadius};`;
    const bodyEl = document.querySelector("#resultModal .modal-body");
    if (bodyEl === null) throw new Error("Broken modal, can't display!");
    bodyEl.innerHTML = `<img src="${src}" style="${imgStyle}" />`;
    // now lets show it!
    openModal(getElById("resultModal"));
}

let photos = [
    "girl-piano.jpg",
    "hiker.jpg",
    "kitten.jpg",
    "red-panda.webp",
    "toucan.jpg",
    "woman-dog.jpg",
];

// Get Result output size
const outputSize = 500;

const demoConfigs = {
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
        getRandomImage: () => "assets/photos/" + photos[Math.floor(Math.random() * photos.length)],
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
        notes: "Passing a previously captured:<br>&nbsp; &nbsp; <code class='language-javascript hljs'>cropt.get()</code> <br>restores viewport " +
            "and image position. See the <br>&nbsp; &nbsp; <code class='language-javascript hljs'>cropt.bind()</code> <br> section. Look in the console.log for output from <b>cropt.get()</b>.",
        getRandomImage: () => "assets/photos/kitten.jpg",
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
        notes: "Note the <b>grab bars</b> on the viewport, you can manually adjust the sizing of viewport." +
            "<br><br>If picture is rotated, crop coordinates correspond to rotated canvas.",
        getRandomImage: () => "assets/photos/" + photos[Math.floor(Math.random() * photos.length)],
    },
};

let activeDemo = "demo1";
let cropt = null;
let config = demoConfigs[activeDemo];
let cropEl = null;
let imgSrc = "";

function getCode() {
    const optionStr = JSON.stringify(config.options, undefined, 4);
    let bindPreset = "";
    if (config.preset) {
        bindPreset =
            `\n// Using a preset here (ignoring initial viewport setup):\nconst preset = ${JSON.stringify(config.preset)}` +
                `\n// Pass to bind():`;
    }
    return `// import Cropt from "cropt2"; // npm install cropt2
import Cropt from 'https://unpkg.com/cropt2@latest?module'; //direct

const cropEl = document.getElementById("${config.id}");
const resultBtn = document.getElementById("result-btn");

const cropt = new Cropt(cropEl, ${optionStr});
${bindPreset}
cropt.bind("${imgSrc}"${bindPreset ? ", preset" : ""});

resultBtn.addEventListener("click", () => {${bindPreset
        ? `
    // Read the crop & viewport details this way...
    const cropAndViewportInfo = cropt.get();
    console.log(\`Image parameters [cropt.get()]:\`)
    console.log( JSON.stringify(cropAndViewportInfo) );\n`
        : ""}
    cropt.toCanvas(${outputSize}).then( canvas => {
        let url = canvas.toDataURL(); // or canvas.toBlob();
        // Now can display in image: img.src = url
        // Display in modal dialog.
    })
    
});`;
}

function getElById(elementId) {
    const el = document.getElementById(elementId);
    if (el === null)
        throw new Error(`${elementId} is null`);
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
    if (controlsContainer)
        controlsContainer.classList.toggle("d-none", config.hideControls);
    if (notesContainer) {
        notesContainer.classList.toggle("d-none", !config.hideControls);
        notesContainer.innerHTML = config.notes;
    }
    if (!config.hideControls) {
        const borderRadiusRange = getElById("borderRadiusRange");
        borderRadiusRange.value = parseInt(config.options.viewport.borderRadius).toString();
        const widthRange = getElById("widthRange");
        widthRange.value = config.options.viewport.width.toString();
        const heightRange = getElById("heightRange");
        heightRange.value = config.options.viewport.height.toString();
        if (config.options.mouseWheelZoom) {
            const mouseWheelSelect = getElById("mouseWheelSelect");
            mouseWheelSelect.value = config.options.mouseWheelZoom;
        }
    }
}

function bindControlEvents() {
    const config = demoConfigs[activeDemo];
    if (config.hideControls)
        return;
    const borderRadiusRange = getElById("borderRadiusRange");
    borderRadiusRange.oninput = () => {
        const activeConfig = demoConfigs[activeDemo];
        activeConfig.options.viewport.borderRadius = borderRadiusRange.value + "%";
        setCode();
        cropt?.setOptions(activeConfig.options);
    };
    const widthRange = getElById("widthRange");
    widthRange.oninput = () => {
        const activeConfig = demoConfigs[activeDemo];
        activeConfig.options.viewport.width = Math.round(+widthRange.value);
        setCode();
        cropt?.setOptions(activeConfig.options);
    };
    const heightRange = getElById("heightRange");
    heightRange.oninput = () => {
        const activeConfig = demoConfigs[activeDemo];
        activeConfig.options.viewport.height = Math.round(+heightRange.value);
        setCode();
        cropt?.setOptions(activeConfig.options);
    };
    const mouseWheelSelect = getElById("mouseWheelSelect");
    mouseWheelSelect.onchange = () => {
        const activeConfig = demoConfigs[activeDemo];
        const value = mouseWheelSelect.value;
        activeConfig.options.mouseWheelZoom = value;
        setCode();
        cropt?.setOptions(activeConfig.options);
    };
}

function bindFileUpload() {
    const fileInput = getElById("imgFile");
    fileInput.value = "";
    fileInput.onchange = () => {
        if (fileInput.files?.[0]) {
            const file = fileInput.files[0];
            if (cropt) {
                if (imgSrc.startsWith('blob'))
                    URL.revokeObjectURL(imgSrc);
                imgSrc = URL.createObjectURL(file);
                cropt.bind(imgSrc);
                setCode();
            }
        }
    };
}

function initializeDemo(demoKey) {
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
    }
    else {
        cropt.bind(imgSrc);
    }
}

function demoSwitch( demoKey ){
    activeDemo = demoKey;
    initializeDemo(activeDemo);
    setupControls();
    setCode();
    document.getElementById('html-el').classList.add('d-none')
    // only demo 1 binds these thigs
    if (activeDemo === "demo1") {
        bindControlEvents();
        bindFileUpload();
        document.getElementById('html-el').classList.remove('d-none')
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
    resultBtn.onclick = async () => {
        if (!cropt)
            return;
        const cropAndViewportInfo = cropt.get();
        console.log(`Image parameters [cropt.get()]:`, JSON.stringify(cropAndViewportInfo));
        // const canvas = await cropt.toCanvas(outputSize)
        // if (cropt && canvas) popupResult(canvas.toDataURL(), cropt.options.viewport.borderRadius);
        // or using blobs better if big images
        const cropBlob = await cropt.toBlob(outputSize);
        console.log(`- returned Blob:`, cropBlob);
        if (cropt && cropBlob)
            popupResult(URL.createObjectURL(cropBlob), cropt.options.viewport.borderRadius);
    };
}
demoMain();
