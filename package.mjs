// Helper file for the npm run build
// For the classic usage, removes 'export' and attaches wrapper for windows/module/commonjs
// NOTE: expects output to have a __export default class__ which it converted to 'class' and 
// then the window/module attachments

import { readFileSync, writeFileSync } from 'fs';
import { argv } from 'process';

// class name we're working
const Class = 'Cropt'

const input = argv[2];
const output = argv[3] || input;
let code = readFileSync(input, 'utf8');
// replace & append
if( code.indexOf('export default class') > -1 )
    code = code.replace(`export default class`, `class ${Class}`);
else if( code.indexOf('export ') > -1 )
    code = code.replace(`export `, '');
else{
    console.log( `ERROR: Unable to find export'ed class.` )
    process.exit(-1)
}
const appendCode = `if(typeof window!=='undefined')window.Cropt=${Class};else if(typeof module!=='undefined'&&module.exports)module.exports=Cropt; else if(typeof define==='function'&&define.amd)define(()=>Cropt);`

writeFileSync(output, code + appendCode, 'utf8');
