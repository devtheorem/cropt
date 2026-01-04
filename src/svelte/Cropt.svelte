<script>
/******************************************************
 * Sample Component for Cropt
 * By Filipe Laborde (fil@rezox.com), MIT License
*******************************************************

// place it in your project, ex. in lib
import Cropt from '$lib/Componenets/Cropt.svelte'
 
// now states that will affect the Cropt component in your code
let cropUrl = $state(null)
let cropt = $state(null)
 
// you can access all the dropt methods with cropt.toBlob(), cropt.get(), etc.
 
// now in your actual html: 
<Cropt imageSrc={cropUrl} bind:cropt={cropt} {options} {presets} />

******************************************************/

// needs npm install cropt2
import Cropt from 'cropt2';
// then in <style>@import "cropt2/style";</style>

let { imageSrc = null, cropt=$bindable(), options = {}, presets = {} }= $props()

let elContainer
let prevSrc

$effect(() => {
    if (!elContainer || !imageSrc) return;

    // Only create new instance if imageSrc actually changed
    if( prevSrc === imageSrc ) // only create new if img changed
        return

    // Destroy previous instance before creating new one
    if (cropt) {
        cropt.destroy();
        cropt = null;
    }

    prevSrc = imageSrc

    const instance = new Cropt( elContainer, {
        // your defaults
        viewport: {
            width: 280,
            height: 420,
            borderRadius: "2%"
        },
        resizeBars: true,
        enableRotateBtns: true,
        enableKeypress: true,
        ...options
    });

    // preset too - wait for binding to complete
    instance.bind(imageSrc, presets).then(() => {
        cropt = instance;
        console.log( `[Cropper] cropt.bind(${imageSrc}) complete -> instance:`, cropt )
    });
  });

// Cleanup on unmount
$effect(() => {
    return () => {
        if (cropt) {
            cropt.destroy();
            cropt = null;
        }
    };
});
</script>

<div bind:this={elContainer} class="cropt-container relative"></div>

<style>
@import "cropt2/style";

.cropt-container {
    border: 1px solid #ddd;
    border-radius: 0.375rem;
    width: 100% !important;
    height: 100% !important;
    margin-bottom: 15px;
}
.cropt-container IMG {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
    min-width: 1px;
    min-height: 1px;
}
</style>